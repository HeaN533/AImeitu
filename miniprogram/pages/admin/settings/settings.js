const app = getApp();
const { CATEGORY_LABELS } = require('../../../utils/constants');

Page({
  data: { activeTab: 'price', pricingList: [], packages: [], subConfig: {}, inviteConfig: {} },

  onShow() {
    if (!app.globalData.isAdmin) { wx.navigateBack(); return; }
    this.loadAll();
  },

  async loadAll() {
    const db = wx.cloud.database();
    const [pr, pk, sc, ic] = await Promise.all([
      db.collection('pricing_config').get(),
      db.collection('token_packages').orderBy('price', 'asc').get(),
      db.collection('subscribe_config').limit(1).get(),
      db.collection('invite_config').limit(1).get(),
    ]);
    this.setData({
      pricingList: pr.data.map(p => ({ ...p, label: CATEGORY_LABELS[p.category] || p.category })),
      packages: pk.data.map(p => ({ ...p, priceInYuan: (p.price / 100).toFixed(2) })),
      subConfig: sc.data[0] || { price: 1999, daily_tokens: 5 },
      inviteConfig: ic.data[0] || { inviter_reward: 10, invitee_reward: 5 },
    });
  },

  switchTab(e) { this.setData({ activeTab: e.currentTarget.dataset.tab }); },

  async updatePricing(e) {
    const { id, field } = e.currentTarget.dataset;
    const value = parseInt(e.detail.value) || 0;
    const db = wx.cloud.database();
    await db.collection('pricing_config').doc(id).update({ data: { [field]: value, updated_at: new Date() } });
  },

  async updatePackage(e) {
    const db = wx.cloud.database();
    await db.collection('token_packages').doc(e.currentTarget.dataset.id).update({
      data: { is_active: e.detail.value }
    });
  },

  async addPackage() { /* 简化：通过云开发控制台直接操作 */ wx.showToast({ title: '请在云开发控制台添加', icon: 'none' }); },

  async updateSub(e) {
    const { field } = e.currentTarget.dataset;
    const value = parseInt(e.detail.value) || 0;
    const db = wx.cloud.database();
    await db.collection('subscribe_config').doc(this.data.subConfig._id).update({ data: { [field]: value } });
  },

  async updateInvite(e) {
    const { field } = e.currentTarget.dataset;
    const value = parseInt(e.detail.value) || 0;
    const db = wx.cloud.database();
    await db.collection('invite_config').doc(this.data.inviteConfig._id).update({ data: { [field]: value } });
  },
});
