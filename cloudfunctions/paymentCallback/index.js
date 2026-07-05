const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { outTradeNo, returnCode } = event;
  if (returnCode !== 'SUCCESS') return { errcode: -1, errmsg: '支付失败' };

  // 查询订单
  const orderRes = await db.collection('orders').doc(outTradeNo).get();
  const order = orderRes.data;
  if (!order) return { errcode: -1, errmsg: '订单不存在' };
  if (order.status === 'paid' || order.status === 'completed') return { errcode: 0 };

  // 更新订单状态
  await db.collection('orders').doc(outTradeNo).update({
    data: { status: 'paid', wx_order_id: event.transactionId || '' }
  });

  // 加代币
  await db.collection('users').where({ _openid: order.user_id }).update({
    data: { tokens: _.inc(order.tokens) }
  });

  // 写流水
  const userRes = await db.collection('users').where({ _openid: order.user_id }).get();
  await db.collection('token_records').add({
    data: {
      user_id: order.user_id, type: 'purchase', token_type: 'permanent',
      amount: order.tokens, balance_after: userRes.data[0].tokens,
      related_order: outTradeNo, created_at: new Date(), _openid: order.user_id,
    }
  });

  return { errcode: 0, errmsg: 'ok' };
};
