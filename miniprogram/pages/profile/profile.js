const app = getApp();
const { callFunction } = require('../../utils/cloud');

const TYPE_LABELS = {
  gift: '注册赠送', purchase: '购买', subscribe: '订阅领取',
  consume: '下载消耗', activity: '活动赠送', invite: '邀请奖励', expire: '过期清零',
};

Page({
  data: { userId: '', tokens: 0, activityTokens: 0, isAdmin: false, recentRecords: [] },

  onShow: async function () {
    const user = await app.getUserInfo();
    this.setData({
      userId: (user._id || '').slice(-8),
      tokens: user.tokens || 0,
      activityTokens: user.activity_tokens || 0,
      isAdmin: app.globalData.isAdmin,
    });
    this.loadRecords();
  },

  async loadRecords() {
    const db = wx.cloud.database();
    const res = await db.collection('token_records')
      .where({ _openid: '{openid}' })
      .orderBy('created_at', 'desc').limit(10).get();
    this.setData({
      recentRecords: res.data.map(r => ({
        ...r,
        typeLabel: TYPE_LABELS[r.type] || r.type,
        dateStr: r.created_at ? new Date(r.created_at).toLocaleDateString() : '',
      })),
    });
  },

  goRecharge() { wx.navigateTo({ url: '/pages/recharge/recharge' }); },
  goHistory() { wx.navigateTo({ url: '/pages/history/history' }); },
  goAdmin() { wx.navigateTo({ url: '/pages/admin/dashboard/dashboard' }); },

  async dailyCheckIn() {
    try {
      const res = await callFunction('dailyCheckIn', {});
      wx.showToast({ title: '领取成功！+' + res.tokens + ' 代币' });
      app.refreshUserInfo();
      this.onShow();
    } catch (e) { /* toast already shown */ }
  },

  async claimActivity() {
    try {
      const res = await callFunction('claimActivity', {});
      wx.showToast({ title: '领取成功！+' + res.tokens + ' 代币' });
      app.refreshUserInfo();
      this.onShow();
    } catch (e) { /* toast already shown */ }
  },

  shareInvite() {
    wx.shareAppMessage({
      title: 'AI 图片美化 — 免费体验智能修图',
      path: '/pages/index/index?inviter=' + this.data.userId,
    });
  },
});
