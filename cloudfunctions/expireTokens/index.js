const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const now = new Date();

  // 1. 分页查找所有已过期的活动代币记录
  let allExpired = [];
  let batch;
  do {
    batch = await db.collection('user_activity_tokens')
      .where({ expires_at: _.lt(now), tokens: _.gt(0) })
      .limit(100).get();
    allExpired = allExpired.concat(batch.data);
  } while (batch.data.length === 100);

  if (allExpired.length === 0) return { processed: 0, expiredTokens: 0 };
  const expiredRes = { data: allExpired };

  // 2. 按用户汇总过期代币数
  const userTotals = {};
  for (const record of expiredRes.data) {
    if (!userTotals[record.user_id]) userTotals[record.user_id] = 0;
    userTotals[record.user_id] += record.tokens;
  }

  // 3. 逐个用户处理
  let totalExpired = 0;
  for (const [userId, expiring] of Object.entries(userTotals)) {
    // 扣减用户 activity_tokens
    await db.collection('users').where({ _openid: userId }).update({
      data: { activity_tokens: _.inc(-expiring) }
    });

    // 写过期流水
    const userRes = await db.collection('users').where({ _openid: userId }).get();
    if (userRes.data.length > 0) {
      await db.collection('token_records').add({
        data: {
          user_id: userId, type: 'expire', token_type: 'temporary',
          amount: -expiring, balance_after: userRes.data[0].activity_tokens,
          created_at: new Date(), _openid: userId,
        }
      });
    }

    totalExpired += expiring;
  }

  // 4. 将过期记录的 tokens 置零
  const expiredIds = expiredRes.data.map(r => r._id);
  for (const id of expiredIds) {
    await db.collection('user_activity_tokens').doc(id).update({
      data: { tokens: 0 }
    });
  }

  return { processed: expiredRes.data.length, expiredTokens: totalExpired };
};
