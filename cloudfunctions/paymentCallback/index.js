const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { outTradeNo, returnCode } = event;
  if (returnCode !== 'SUCCESS') return { errcode: -1, errmsg: '支付失败' };

  const orderRes = await db.collection('orders').doc(outTradeNo).get();
  const order = orderRes.data;
  if (!order) return { errcode: -1, errmsg: '订单不存在' };
  if (order.status === 'paid' || order.status === 'completed') return { errcode: 0 };

  try {
    await db.runTransaction(async transaction => {
      const txOrderRes = await transaction.collection('orders').doc(outTradeNo).get();
      const txOrder = txOrderRes.data;
      if (txOrder.status === 'paid' || txOrder.status === 'completed') return;

      await transaction.collection('orders').doc(outTradeNo).update({
        data: { status: 'paid', wx_order_id: event.transactionId || '' }
      });

      await transaction.collection('users').where({ _openid: txOrder.user_id }).update({
        data: { tokens: _.inc(txOrder.tokens) }
      });

      const userRes = await transaction.collection('users').where({ _openid: txOrder.user_id }).get();
      await transaction.collection('token_records').add({
        data: {
          user_id: txOrder.user_id, type: 'purchase', token_type: 'permanent',
          amount: txOrder.tokens, balance_after: userRes.data[0].tokens,
          related_order: outTradeNo, created_at: new Date(), _openid: txOrder.user_id,
        }
      });
    });
  } catch (txErr) {
    console.error('paymentCallback transaction error:', txErr);
    return { errcode: -1, errmsg: '发币失败，将自动重试' };
  }

  return { errcode: 0, errmsg: 'ok' };
};
