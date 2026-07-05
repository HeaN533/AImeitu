const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { packageId } = event;
  const { OPENID } = cloud.getWXContext();
  if (!packageId) return { err: '缺少套餐ID' };

  const pkgRes = await db.collection('token_packages').doc(packageId).get();
  const pkg = pkgRes.data;
  if (!pkg || !pkg.is_active) return { err: '套餐不存在或已下架' };

  // 创建订单
  const tokens = (pkg.tokens || 0) + (pkg.bonus || 0);
  const order = await db.collection('orders').add({
    data: {
      user_id: OPENID, type: 'purchase', package_id: packageId,
      amount: pkg.price, tokens: tokens, status: 'pending',
      created_at: new Date(), _openid: OPENID,
    }
  });

  // 调用微信支付统一下单
  const payResult = await cloud.cloudPay.unifiedOrder({
    body: pkg.name,
    outTradeNo: order._id,
    totalFee: pkg.price,
    envId: cloud.DYNAMIC_CURRENT_ENV,
    functionName: 'paymentCallback',
  });

  return { orderId: order._id, wxPayParams: payResult.payment };
};
