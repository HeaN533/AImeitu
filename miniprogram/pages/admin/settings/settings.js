const app = getApp();
const { CATEGORY_LABELS, SUB_TYPES } = require('../../../utils/constants');
const { callFunction } = require('../../../utils/cloud');

Page({
  data: {
    activeTab: 'price', pricingGroups: [], packages: [], subConfig: {}, inviteConfig: {}, adConfig: {},
    showForm: false, saving: false, editingId: '', formData: {},
  },

  onShow() {
    if (!app.globalData.isAdmin) { wx.navigateBack(); return; }
    this.loadAll();
  },

  async loadAll() {
    const db = wx.cloud.database();
    const safe = async (fn, fallback) => {
      try { return await fn(); } catch (e) { console.warn('loadAll 子查询失败:', e.errMsg || e.message); return fallback; }
    };
    const [pr, pk, sc, ic, ac] = await Promise.all([
      safe(() => db.collection('pricing_config').get(), { data: [] }),
      safe(() => db.collection('token_packages').orderBy('price', 'asc').get(), { data: [] }),
      safe(() => db.collection('subscribe_config').limit(1).get(), { data: [] }),
      safe(() => db.collection('invite_config').limit(1).get(), { data: [] }),
      safe(() => db.collection('ad_config').limit(1).get(), { data: [] }),
    ]);
    // 定价按大类分组，每组含子选项列表
    const SUB_LABELS = {};
    Object.keys(SUB_TYPES).forEach(cat => {
      SUB_LABELS[cat] = {};
      SUB_TYPES[cat].forEach(s => { SUB_LABELS[cat][s.key] = s.label; });
    });
    const priceGroups = {};
    pr.data.forEach(p => {
      if (!priceGroups[p.category]) priceGroups[p.category] = [];
      priceGroups[p.category].push({
        ...p,
        subLabel: SUB_LABELS[p.category] && SUB_LABELS[p.category][p.sub_type] || p.sub_type,
      });
    });
    const pricingGroups = Object.keys(CATEGORY_LABELS).map(cat => ({
      key: cat, label: CATEGORY_LABELS[cat], items: priceGroups[cat] || [],
    }));
    this.setData({
      pricingGroups,
      packages: pk.data.map(p => ({ ...p, priceInYuan: (p.price / 100).toFixed(2) })),
      subConfig: sc.data[0] || { price: 1999, daily_tokens: 5 },
      inviteConfig: ic.data[0] || { inviter_reward: 10, invitee_reward: 5 },
      adConfig: ac.data[0] || { daily_limit: 3, reward_tokens: 2, is_active: true },
    });
  },

  switchTab(e) { this.setData({ activeTab: e.currentTarget.dataset.tab }); },

  // ---- pricing ----
  async updatePricing(e) {
    const { id, field } = e.currentTarget.dataset;
    const value = parseInt(e.detail.value) || 0;
    await callFunction('adminAction', { action: 'update', collection: 'pricing_config', docId: id, data: { [field]: value } });
    wx.showToast({ title: '已更新', icon: 'success' });
  },

  // ---- packages ----
  async updatePackage(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.packages.find(p => p._id === id);
    await callFunction('adminAction', { action: 'update', collection: 'token_packages', docId: id, data: { is_active: !item.is_active } });
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
    const payload = {
      name: formData.name, price: formData.price, tokens: formData.tokens,
      bonus: formData.bonus,
    };

    try {
      if (editingId) {
        await callFunction('adminAction', { action: 'update', collection: 'token_packages', docId: editingId, data: payload });
      } else {
        await callFunction('adminAction', { action: 'add', collection: 'token_packages', data: { ...payload, is_active: true, created_at: new Date() } });
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
    await callFunction('adminAction', { action: 'update', collection: 'subscribe_config', docId: this.data.subConfig._id, data: { [field]: value } });
    wx.showToast({ title: '已更新', icon: 'success' });
  },

  async updateSubStr(e) {
    const { field } = e.currentTarget.dataset;
    const value = e.detail.value || '';
    await callFunction('adminAction', {
      action: 'update', collection: 'subscribe_config',
      docId: this.data.subConfig._id, data: { [field]: value }
    });
    wx.showToast({ title: '已更新', icon: 'success' });
  },

  // ---- invite ----
  async updateInvite(e) {
    const { field } = e.currentTarget.dataset;
    const value = parseInt(e.detail.value) || 0;
    await callFunction('adminAction', { action: 'update', collection: 'invite_config', docId: this.data.inviteConfig._id, data: { [field]: value } });
    wx.showToast({ title: '已更新', icon: 'success' });
  },

  // ---- ad ----
  async updateAd(e) {
    const { field } = e.currentTarget.dataset;
    const value = parseInt(e.detail.value) || 0;
    await callFunction('adminAction', {
      action: 'update', collection: 'ad_config',
      docId: this.data.adConfig._id, data: { [field]: value }
    });
    wx.showToast({ title: '已更新', icon: 'success' });
  },

  async toggleAdActive(e) {
    await callFunction('adminAction', {
      action: 'update', collection: 'ad_config',
      docId: this.data.adConfig._id, data: { is_active: e.detail.value }
    });
    wx.showToast({ title: '已更新', icon: 'success' });
  },
});
