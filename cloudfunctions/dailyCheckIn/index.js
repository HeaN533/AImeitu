const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  const userRes = await db.collection('users').where({ _openid: OPENID }).get();
  if (userRes.data.length === 0) return { err: '用户不存在' };
  const user = userRes.data[0];

  if (!user.subscription || !user.subscription.is_active) return { err: '请先订阅后再领取' };

  const today = new Date().toDateString();
  const claimedDate = user.subscription.daily_claimed_at ? new Date(user.subscription.daily_claimed_at).toDateString() : null;
  if (claimedDate === today) return { err: '今日已领取，明天再来' };

  const cfgRes = await db.collection('subscribe_config').limit(1).get();
  const cfg = cfgRes.data[0];
  if (!cfg) return { err: '订阅配置不存在' };
  const tokens = cfg.daily_tokens || 5;

  await db.collection('users').where({ _openid: OPENID }).update({
    data: {
      tokens: _.inc(tokens),
      'subscription.daily_claimed_at': new Date(),
    }
  });

  const updatedUser = await db.collection('users').where({ _openid: OPENID }).get();
  await db.collection('token_records').add({
    data: {
      user_id: OPENID, type: 'subscribe', token_type: 'permanent',
      amount: tokens, balance_after: updatedUser.data[0].tokens,
      created_at: new Date(), _openid: OPENID,
    }
  });

  return { tokens };
};
