const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

async function fulfillOrder(order) {
  await db.runTransaction(async transaction => {
    const txOrderRes = await transaction.collection('orders').doc(order._id).get();
    if (txOrderRes.data.status === 'completed') return;

    if (txOrderRes.data.status !== 'paid') {
      await transaction.collection('orders').doc(order._id).update({
        data: { status: 'paid' }
      });
    }

    await transaction.collection('users').where({ _openid: order.user_id }).update({
      data: { tokens: _.inc(order.tokens) }
    });

    const userRes = await transaction.collection('users').where({ _openid: order.user_id }).get();
    await transaction.collection('token_records').add({
      data: {
        user_id: order.user_id, type: 'purchase', token_type: 'permanent',
        amount: order.tokens, balance_after: userRes.data[0].tokens,
        related_order: order._id, created_at: new Date(), _openid: order.user_id,
      }
    });

    await transaction.collection('orders').doc(order._id).update({
      data: { status: 'completed' }
    });
  });
}

exports.main = async (event, context) => {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  let fixed = 0;
  let synced = 0;

  // 1. 扫 pending 超时 → 查微信支付 → 补单
  const pendingRes = await db.collection('orders')
    .where({ status: 'pending', created_at: _.lt(fiveMinAgo) })
    .limit(50).get();
  synced += pendingRes.data.length;

  for (const order of pendingRes.data) {
    try {
      const payResult = await cloud.cloudPay.queryOrder({
        out_trade_no: order._id,
        sub_mch_id: '',
      });

      if (payResult.returnCode === 'SUCCESS' && payResult.tradeState === 'SUCCESS') {
        await fulfillOrder(order);
        fixed++;
      } else if (payResult.tradeState === 'NOTPAY' || payResult.tradeState === 'CLOSED') {
        await db.collection('orders').doc(order._id).update({
          data: { status: 'cancelled' }
        });
      }
    } catch (e) {
      console.error('syncOrders pending error for order', order._id, e.message);
    }
  }

  // 2. 扫 paid 但无流水 → 补发代币
  const paidNoStream = await db.collection('orders')
    .where({ status: 'paid' }).limit(50).get();
  synced += paidNoStream.data.length;

  for (const order of paidNoStream.data) {
    try {
      const streamRes = await db.collection('token_records')
        .where({ related_order: order._id, type: 'purchase' }).count();
      if (streamRes.total === 0) {
        await fulfillOrder(order);
        fixed++;
      }
    } catch (e) {
      console.error('syncOrders paid-no-stream error for order', order._id, e.message);
    }
  }

  return { synced, fixed };
};
