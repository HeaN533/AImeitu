const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { imageId } = event;
  const { OPENID } = cloud.getWXContext();
  if (!imageId) return { err: '缺少图片ID' };

  const imgRes = await db.collection('images').doc(imageId).get();
  const image = imgRes.data;
  if (!image || image.user_id !== OPENID) return { err: '图片不存在' };

  if (image.is_downloaded) return { resultFileID: image.result_url };

  const priceRes = await db.collection('pricing_config')
    .where({ category: image.process_type }).get();
  const price = priceRes.data.length > 0 ? priceRes.data[0].tokens : 2;

  const userRes = await db.collection('users').where({ _openid: OPENID }).get();
  if (userRes.data.length === 0) return { err: '用户不存在' };
  const user = userRes.data[0];
  const totalBalance = (user.tokens || 0) + (user.activity_tokens || 0);
  if (totalBalance < price) return { err: '代币不足，请先充值' };

  try {
    await db.runTransaction(async transaction => {
      const txUserRes = await transaction.collection('users').where({ _openid: OPENID }).get();
      const txUser = txUserRes.data[0];
      const txBalance = (txUser.tokens || 0) + (txUser.activity_tokens || 0);
      if (txBalance < price) throw new Error('代币不足');

      let remaining = price;
      let activityDeducted = 0;
      let permanentDeducted = 0;

      const actRes = await transaction.collection('user_activity_tokens')
        .where({ user_id: OPENID, tokens: _.gt(0) })
        .orderBy('expires_at', 'asc').get();

      for (const at of actRes.data) {
        if (remaining <= 0) break;
        const deduct = Math.min(at.tokens, remaining);
        await transaction.collection('user_activity_tokens').doc(at._id).update({
          data: { tokens: _.inc(-deduct) }
        });
        remaining -= deduct;
        activityDeducted += deduct;
      }

      if (remaining > 0) {
        permanentDeducted = remaining;
        await transaction.collection('users').where({ _openid: OPENID }).update({
          data: { tokens: _.inc(-remaining) }
        });
      }

      if (activityDeducted > 0) {
        await transaction.collection('users').where({ _openid: OPENID }).update({
          data: { activity_tokens: _.inc(-activityDeducted) }
        });
      }

      const afterRes = await transaction.collection('users').where({ _openid: OPENID }).get();
      const balanceAfter = (afterRes.data[0].tokens || 0) + (afterRes.data[0].activity_tokens || 0);

      const tokenType = (activityDeducted > 0 && permanentDeducted === 0) ? 'temporary' : 'permanent';
      await transaction.collection('token_records').add({
        data: {
          user_id: OPENID, type: 'consume', token_type: tokenType,
          amount: -price, balance_after: balanceAfter, related_image: imageId,
          created_at: new Date(), _openid: OPENID,
        }
      });

      await transaction.collection('images').doc(imageId).update({
        data: { is_downloaded: true }
      });
    });
  } catch (txErr) {
    if (txErr.message === '代币不足') return { err: '代币不足，请充值' };
    console.error('downloadImage transaction error:', txErr);
    return { err: '扣费失败，请重试' };
  }

  // 邀请奖励逻辑（事务外，非扣费关键路径）
  const orderCount = await db.collection('token_records')
    .where({ user_id: OPENID, type: 'consume' }).count();
  if (orderCount.total === 1) {
    const inviteRes = await db.collection('invite_records')
      .where({ invitee_openid: OPENID, status: 'registered' }).get();
    if (inviteRes.data.length > 0) {
      const invite = inviteRes.data[0];
      const cfgRes = await db.collection('invite_config').limit(1).get();
      const cfg = cfgRes.data[0] || { inviter_reward: 10, invitee_reward: 5 };

      const inviterUserRes = await db.collection('users').doc(invite.inviter_id).get();
      const inviterBalance = inviterUserRes.data.tokens || 0;
      await db.collection('users').doc(invite.inviter_id).update({
        data: { tokens: _.inc(cfg.inviter_reward) }
      });
      await db.collection('token_records').add({
        data: {
          user_id: invite.inviter_id, type: 'invite', token_type: 'permanent',
          amount: cfg.inviter_reward, balance_after: inviterBalance + cfg.inviter_reward,
          created_at: new Date(), _openid: invite.inviter_id,
        }
      });

      await db.collection('users').where({ _openid: OPENID }).update({
        data: { tokens: _.inc(cfg.invitee_reward) }
      });
      const finalUser = await db.collection('users').where({ _openid: OPENID }).get();
      await db.collection('token_records').add({
        data: {
          user_id: OPENID, type: 'invite', token_type: 'permanent',
          amount: cfg.invitee_reward, balance_after: finalUser.data[0].tokens,
          created_at: new Date(), _openid: OPENID,
        }
      });

      await db.collection('invite_records').doc(invite._id).update({
        data: { status: 'first_paid', inviter_reward: cfg.inviter_reward, invitee_reward: cfg.invitee_reward }
      });
    }
  }

  return { resultFileID: image.result_url };
};
