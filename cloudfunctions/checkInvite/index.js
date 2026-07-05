const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { inviter_id } = event;

  if (!inviter_id) return { inviter_id: null };

  // 检查当前用户是否已有记录（老用户不受邀请）
  const userQuery = await db.collection('users').where({ _openid: OPENID }).count();
  if (userQuery.total > 0) return { inviter_id: null };

  // 检查 inviter_id 是否存在
  try {
    await db.collection('users').doc(inviter_id).get();
  } catch (e) {
    return { inviter_id: null };
  }

  // 检查是否已被其他人邀请过
  const existInvite = await db.collection('invite_records')
    .where({ invitee_openid: OPENID }).count();
  if (existInvite.total > 0) return { inviter_id: null };

  // 获取邀请配置
  const cfgRes = await db.collection('invite_config').limit(1).get();
  const cfg = cfgRes.data[0] || { inviter_reward: 10, invitee_reward: 5 };

  // 写入邀请记录（此时被邀请人尚未注册，用 openid 记录）
  await db.collection('invite_records').add({
    data: {
      inviter_id,
      invitee_openid: OPENID,
      status: 'registered',
      inviter_reward: cfg.inviter_reward,
      invitee_reward: cfg.invitee_reward,
      created_at: new Date(),
    }
  });

  return { inviter_id };
};
