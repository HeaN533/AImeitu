const app = getApp();
const AD_UNIT_ID = 'adunit-xxxxxxxxxx';
let rewardedVideoAd = null;
const { callFunction } = require('../../utils/cloud');

const TYPE_LABELS = {
  gift: '注册赠送', purchase: '购买', subscribe: '订阅领取',
  consume: '下载消耗', activity: '活动赠送', invite: '邀请奖励', expire: '过期清零',
};

Page({
  data: { userId: '', tokens: 0, activityTokens: 0, isAdmin: false, recentRecords: [], adRemaining: 0 },

  onShow: async function () {
    const user = await app.getUserInfo();
    this.setData({
      userId: (user._id || '').slice(-8),
      tokens: user.tokens || 0,
      activityTokens: user.activity_tokens || 0,
      isAdmin: app.globalData.isAdmin,
    });
    this.loadRecords();
    this.loadAdRemaining();
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

  onShareAppMessage() {
    const app = getApp();
    const fullId = (app.globalData.userInfo && app.globalData.userInfo._id) || '';
    return {
      title: 'AI 图片美化 — 免费体验智能修图',
      path: '/pages/index/index?inviter=' + fullId,
    };
  },

  async loadAdRemaining() {
    try {
      const db = wx.cloud.database();
      const cfgRes = await db.collection('ad_config').limit(1).get();
      if (cfgRes.data.length === 0 || !cfgRes.data[0].is_active) {
        this.setData({ adRemaining: 0 });
        return;
      }
      const cfg = cfgRes.data[0];
      const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
      const todayStart = new Date(today + 'T00:00:00+08:00');
      const _ = db.command;
      const countRes = await db.collection('token_records')
        .where({ _openid: '{openid}', type: 'ad', created_at: _.gte(todayStart) }).count();
      this.setData({ adRemaining: Math.max(0, cfg.daily_limit - countRes.total) });
    } catch (e) {
      this.setData({ adRemaining: 0 });
    }
  },

  watchAd() {
    if (!rewardedVideoAd) {
      try {
        rewardedVideoAd = wx.createRewardedVideoAd({ adUnitId: AD_UNIT_ID });
        rewardedVideoAd.onClose((res) => {
          if (res && res.isEnded) {
            this.handleAdComplete();
          } else {
            wx.showToast({ title: '需看完广告才能领取', icon: 'none' });
          }
        });
        rewardedVideoAd.onError((err) => {
          console.error('广告加载失败:', err);
          wx.showToast({ title: '广告加载失败，请稍后重试', icon: 'none' });
        });
      } catch (e) {
        wx.showToast({ title: '当前环境不支持广告', icon: 'none' });
        return;
      }
    }
    rewardedVideoAd.show().catch(() => {
      rewardedVideoAd.load().then(() => rewardedVideoAd.show());
    });
  },

  async handleAdComplete() {
    try {
      const res = await callFunction('rewardAd', {});
      if (res.err) {
        wx.showToast({ title: res.err, icon: 'none' });
        return;
      }
      wx.showToast({ title: '+' + res.tokens + ' 代币', icon: 'success' });
      this.setData({ adRemaining: res.remainingToday });
      app.refreshUserInfo();
      this.onShow();
    } catch (e) { /* toast already shown */ }
  },
});
