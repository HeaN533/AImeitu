const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function todayBeijing() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  const cfgRes = await db.collection('ad_config').limit(1).get();
  if (cfgRes.data.length === 0) return { err: '广告配置不存在' };
  const cfg = cfgRes.data[0];
  if (!cfg.is_active) return { err: '广告功能已关闭' };

  const userRes = await db.collection('users').where({ _openid: OPENID }).get();
  if (userRes.data.length === 0) return { err: '用户不存在' };

  const today = todayBeijing();
  const todayStart = new Date(today + 'T00:00:00+08:00');
  const countRes = await db.collection('token_records')
    .where({ _openid: OPENID, type: 'ad', created_at: _.gte(todayStart) }).count();

  if (countRes.total >= cfg.daily_limit) {
    return { err: '今日观看次数已达上限' };
  }

  const rewardTokens = cfg.reward_tokens || 2;

  await db.runTransaction(async transaction => {
    const txUserRes = await transaction.collection('users').where({ _openid: OPENID }).get();
    if (txUserRes.data.length === 0) return { err: '用户不存在' };

    await transaction.collection('users').where({ _openid: OPENID }).update({
      data: { tokens: _.inc(rewardTokens) }
    });

    const afterRes = await transaction.collection('users').where({ _openid: OPENID }).get();
    await transaction.collection('token_records').add({
      data: {
        user_id: OPENID, type: 'ad', token_type: 'permanent',
        amount: rewardTokens, balance_after: afterRes.data[0].tokens,
        created_at: new Date(), _openid: OPENID,
      }
    });
  });

  return { tokens: rewardTokens, remainingToday: cfg.daily_limit - countRes.total - 1 };
};
