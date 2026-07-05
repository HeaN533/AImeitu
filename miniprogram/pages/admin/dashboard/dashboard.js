const app = getApp();
Page({
  data: { todayProcess: 0, todayRevenue: 0, todayActive: 0, totalOrders: 0 },

  onShow() {
    if (!app.globalData.isAdmin) { wx.showToast({ title: '无权限', icon: 'none' }); wx.navigateBack(); return; }
    this.loadStats();
  },

  async loadStats() {
    const db = wx.cloud.database();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const _ = db.command;

    const imgCount = await db.collection('images').where({ created_at: _.gte(today) }).count();
    const orderRes = await db.collection('orders').where({ created_at: _.gte(today), status: 'paid' }).get();
    const revenue = orderRes.data.reduce((s, o) => s + o.amount, 0);
    const activeUsers = new Set(orderRes.data.map(o => o.user_id)).size;
    const totalOrders = await db.collection('orders').where({ status: 'paid' }).count();

    this.setData({
      todayProcess: imgCount.total,
      todayRevenue: (revenue / 100).toFixed(2),
      todayActive: activeUsers,
      totalOrders: totalOrders.total,
    });
  },

  goModels() { wx.navigateTo({ url: '/pages/admin/models/models' }); },
  goActivities() { wx.navigateTo({ url: '/pages/admin/activities/activities' }); },
  goSettings() { wx.navigateTo({ url: '/pages/admin/settings/settings' }); },
});
