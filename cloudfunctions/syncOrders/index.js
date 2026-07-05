const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

  // 查找超过 5 分钟的 pending 订单（不含今天的，避免与正常回调冲突）
  const orderRes = await db.collection('orders')
    .where({ status: 'pending', created_at: _.lt(fiveMinAgo) })
    .limit(50).get();

  if (orderRes.data.length === 0) return { synced: 0, fixed: 0 };

  let fixed = 0;

  for (const order of orderRes.data) {
    try {
      // 调用微信支付查询接口
      const payResult = await cloud.cloudPay.queryOrder({
        out_trade_no: order._id,
        sub_mch_id: '', // 根据实际商户号配置
      });

      if (payResult.returnCode === 'SUCCESS' && payResult.tradeState === 'SUCCESS') {
        // 支付成功但未到账 → 补单
        await db.collection('orders').doc(order._id).update({
          data: { status: 'paid', wx_order_id: payResult.transactionId || '' }
        });

        await db.collection('users').where({ _openid: order.user_id }).update({
          data: { tokens: _.inc(order.tokens) }
        });

        const userRes = await db.collection('users').where({ _openid: order.user_id }).get();
        if (userRes.data.length > 0) {
          await db.collection('token_records').add({
            data: {
              user_id: order.user_id, type: 'purchase', token_type: 'permanent',
              amount: order.tokens, balance_after: userRes.data[0].tokens,
              related_order: order._id, created_at: new Date(), _openid: order.user_id,
            }
          });
        }

        fixed++;
      } else if (payResult.tradeState === 'NOTPAY' || payResult.tradeState === 'CLOSED') {
        // 未支付或已关闭 → 取消订单
        await db.collection('orders').doc(order._id).update({
          data: { status: 'cancelled' }
        });
      }
    } catch (e) {
      // 单笔查询失败不影响其他订单
      console.error('syncOrders error for order', order._id, e.message);
    }
  }

  return { synced: orderRes.data.length, fixed };
};
