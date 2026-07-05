const app = getApp();
const { callFunction } = require('../../utils/cloud');

Page({
  data: { tokens: 0, packages: [] },

  onShow: async function () {
    const user = await app.getUserInfo();
    const db = wx.cloud.database();
    const res = await db.collection('token_packages')
      .where({ is_active: true }).orderBy('price', 'asc').get();
    this.setData({
      tokens: user.tokens || 0,
      packages: res.data.map(p => ({
        ...p, priceInYuan: (p.price / 100).toFixed(2),
      })),
    });
  },

  async buy(e) {
    const packageId = e.currentTarget.dataset.id;
    wx.showLoading({ title: '创建订单...' });
    try {
      const res = await callFunction('createOrder', { packageId });
      wx.hideLoading();
      wx.requestPayment({
        timeStamp: res.wxPayParams.timeStamp,
        nonceStr: res.wxPayParams.nonceStr,
        package: res.wxPayParams.package,
        signType: res.wxPayParams.signType || 'RSA',
        paySign: res.wxPayParams.paySign,
        success: () => {
          wx.showToast({ title: '支付成功' });
          app.refreshUserInfo();
          this.onShow();
        },
        fail: (err) => {
          if (err.errMsg.indexOf('cancel') === -1) {
            wx.showToast({ title: '支付失败', icon: 'none' });
          }
        },
      });
    } catch (e) {
      wx.hideLoading();
    }
  },
});
