const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const now = new Date();

  // 查找当前有效活动
  const actRes = await db.collection('activities')
    .where({ is_active: true, start_time: _.lte(now), end_time: _.gte(now) })
    .orderBy('end_time', 'asc').limit(1).get();

  if (actRes.data.length === 0) return { err: '暂无可用活动' };
  const activity = actRes.data[0];

  // 检查是否已领取
  const existRes = await db.collection('user_activity_tokens')
    .where({ user_id: OPENID, activity_id: activity._id }).count();
  if (existRes.total > 0) return { err: '已领取过该活动奖励' };

  const tokens = activity.reward_tokens || 0;

  // 写入用户活动代币
  await db.collection('user_activity_tokens').add({
    data: {
      user_id: OPENID, activity_id: activity._id, tokens,
      expires_at: activity.end_time, created_at: new Date(), _openid: OPENID,
    }
  });

  // 更新用户 activity_tokens
  await db.collection('users').where({ _openid: OPENID }).update({
    data: { activity_tokens: _.inc(tokens) }
  });

  // 写流水
  await db.collection('token_records').add({
    data: {
      user_id: OPENID, type: 'activity', token_type: 'temporary',
      amount: tokens, balance_after: 0,
      related_activity: activity._id, created_at: new Date(), _openid: OPENID,
    }
  });

  return { tokens };
};
