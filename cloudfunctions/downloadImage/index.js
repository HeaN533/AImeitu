const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { imageId } = event;
  const { OPENID } = cloud.getWXContext();
  if (!imageId) return { err: '缺少图片ID' };

  // 1. 查询图片记录
  const imgRes = await db.collection('images').doc(imageId).get();
  const image = imgRes.data;
  if (!image || image.user_id !== OPENID) return { err: '图片不存在' };

  // 2. 已付费的直接返回原图，不扣费
  if (image.is_downloaded) return { resultFileID: image.result_url };

  // 3. 获取定价
  const priceRes = await db.collection('pricing_config')
    .where({ category: image.process_type }).get();
  const price = priceRes.data.length > 0 ? priceRes.data[0].tokens : 2;

  // 4. 检查用户总余额
  const userRes = await db.collection('users').where({ _openid: OPENID }).get();
  if (userRes.data.length === 0) return { err: '用户不存在' };
  const user = userRes.data[0];
  const totalBalance = (user.tokens || 0) + (user.activity_tokens || 0);
  if (totalBalance < price) return { err: '代币不足，请先充值' };

  // 5. 扣费：先扣限时代币（按 expires_at 升序），再扣永久代币
  let remaining = price;
  let activityDeducted = 0;
  let permanentDeducted = 0;

  // 5a. 查询限时代币明细
  const activityTokens = await db.collection('user_activity_tokens')
    .where({ user_id: OPENID, tokens: _.gt(0) })
    .orderBy('expires_at', 'asc').get();

  for (const at of activityTokens.data) {
    if (remaining <= 0) break;
    const deduct = Math.min(at.tokens, remaining);
    await db.collection('user_activity_tokens').doc(at._id).update({
      data: { tokens: _.inc(-deduct) }
    });
    remaining -= deduct;
    activityDeducted += deduct;
  }

  // 5b. 剩余从永久代币扣
  if (remaining > 0) {
    permanentDeducted = remaining;
    await db.collection('users').where({ _openid: OPENID }).update({
      data: { tokens: _.inc(-remaining) }
    });
  }

  // 5c. 更新用户 activity_tokens 冗余字段
  if (activityDeducted > 0) {
    await db.collection('users').where({ _openid: OPENID }).update({
      data: { activity_tokens: _.inc(-activityDeducted) }
    });
  }

  // 6. 写入消费流水
  const balanceAfter = (user.tokens - permanentDeducted) + (user.activity_tokens - activityDeducted);
  await db.collection('token_records').add({
    data: {
      user_id: OPENID, type: 'consume', token_type: 'permanent',
      amount: -price, balance_after: balanceAfter, related_image: imageId,
      created_at: new Date(), _openid: OPENID,
    }
  });

  // 7. 标记已下载
  await db.collection('images').doc(imageId).update({
    data: { is_downloaded: true }
  });

  // 8. 检查首次付费 → 触发邀请奖励
  const orderCount = await db.collection('token_records')
    .where({ user_id: OPENID, type: 'consume' }).count();
  if (orderCount.total === 1) {
    const inviteRes = await db.collection('invite_records')
      .where({ invitee_openid: OPENID, status: 'registered' }).get();
    if (inviteRes.data.length > 0) {
      const invite = inviteRes.data[0];
      const cfgRes = await db.collection('invite_config').limit(1).get();
      const cfg = cfgRes.data[0] || { inviter_reward: 10, invitee_reward: 5 };

      // 奖励邀请人
      await db.collection('users').doc(invite.inviter_id).update({
        data: { tokens: _.inc(cfg.inviter_reward) }
      });
      await db.collection('token_records').add({
        data: {
          user_id: invite.inviter_id, type: 'invite', token_type: 'permanent',
          amount: cfg.inviter_reward, balance_after: 0,
          created_at: new Date(), _openid: invite.inviter_id,
        }
      });

      // 奖励被邀请人
      await db.collection('users').where({ _openid: OPENID }).update({
        data: { tokens: _.inc(cfg.invitee_reward) }
      });
      await db.collection('token_records').add({
        data: {
          user_id: OPENID, type: 'invite', token_type: 'permanent',
          amount: cfg.invitee_reward, balance_after: balanceAfter + cfg.invitee_reward,
          created_at: new Date(), _openid: OPENID,
        }
      });

      // 更新邀请状态
      await db.collection('invite_records').doc(invite._id).update({
        data: { status: 'first_paid', inviter_reward: cfg.inviter_reward, invitee_reward: cfg.invitee_reward }
      });
    }
  }

  return { resultFileID: image.result_url };
};
