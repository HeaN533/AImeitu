const app = getApp();
const { CATEGORY_LABELS } = require('../../../utils/constants');

Page({
  data: {
    activeTab: 'price', pricingList: [], packages: [], subConfig: {}, inviteConfig: {},
    showForm: false, saving: false, editingId: '', formData: {},
  },

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

  // ---- pricing ----
  async updatePricing(e) {
    const { id, field } = e.currentTarget.dataset;
    const value = parseInt(e.detail.value) || 0;
    const db = wx.cloud.database();
    await db.collection('pricing_config').doc(id).update({ data: { [field]: value, updated_at: new Date() } });
    wx.showToast({ title: '已更新', icon: 'success' });
  },

  // ---- packages ----
  async updatePackage(e) {
    const db = wx.cloud.database();
    const id = e.currentTarget.dataset.id;
    const item = this.data.packages.find(p => p._id === id);
    await db.collection('token_packages').doc(id).update({
      data: { is_active: !item.is_active }
    });
    this.loadAll();
  },

  showAddPackage() {
    this.setData({
      showForm: true, editingId: '', priceInYuan: '19.99',
      formData: { name: '', price: 1999, tokens: 100, bonus: 0 },
    });
  },

  editPackage(e) {
    const id = e.currentTarget.dataset.id;
    const p = this.data.packages.find(p => p._id === id);
    if (!p) return;
    this.setData({
      showForm: true, editingId: id, priceInYuan: ((p.price || 0) / 100).toFixed(2),
      formData: { name: p.name, price: p.price, tokens: p.tokens, bonus: p.bonus || 0 },
    });
  },

  hideForm() { this.setData({ showForm: false }); },

  onFieldChange(e) {
    this.setData({ ['formData.' + e.currentTarget.dataset.field]: e.detail.value });
  },

  onNumChange(e) {
    const field = e.currentTarget.dataset.field;
    const value = parseInt(e.detail.value) || 0;
    const update = { ['formData.' + field]: value };
    if (field === 'price') update.priceInYuan = (value / 100).toFixed(2);
    this.setData(update);
  },

  async savePackage() {
    const { editingId, formData } = this.data;
    if (!formData.name) { wx.showToast({ title: '请输入套餐名称', icon: 'none' }); return; }

    this.setData({ saving: true });
    const db = wx.cloud.database();
    const payload = {
      name: formData.name, price: formData.price, tokens: formData.tokens,
      bonus: formData.bonus,
    };

    try {
      if (editingId) {
        await db.collection('token_packages').doc(editingId).update({ data: payload });
      } else {
        await db.collection('token_packages').add({
          data: { ...payload, is_active: true, created_at: new Date() }
        });
      }
      wx.showToast({ title: editingId ? '已更新' : '已创建', icon: 'success' });
      this.setData({ showForm: false });
      this.loadAll();
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  // ---- subscription ----
  async updateSub(e) {
    const { field } = e.currentTarget.dataset;
    const value = parseInt(e.detail.value) || 0;
    const db = wx.cloud.database();
    await db.collection('subscribe_config').doc(this.data.subConfig._id).update({ data: { [field]: value } });
    wx.showToast({ title: '已更新', icon: 'success' });
  },

  // ---- invite ----
  async updateInvite(e) {
    const { field } = e.currentTarget.dataset;
    const value = parseInt(e.detail.value) || 0;
    const db = wx.cloud.database();
    await db.collection('invite_config').doc(this.data.inviteConfig._id).update({ data: { [field]: value } });
    wx.showToast({ title: '已更新', icon: 'success' });
  },
});
