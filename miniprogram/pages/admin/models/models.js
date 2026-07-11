const app = getApp();
const { CATEGORIES, CATEGORY_LABELS } = require('../../../utils/constants');
const { callFunction } = require('../../../utils/cloud');

Page({
  data: {
    categories: [],
    showForm: false,
    saving: false,
    editingId: '',
    formCategoryIdx: 0,
    formData: { name: '', api_url: '', api_key: '', api_secret: '', config: {} },
    formConfigText: '{}',
    showKey: false,
    categoryOptions: [],
  },

  onShow() {
    if (!app.globalData.isAdmin) { wx.navigateBack(); return; }
    this.setData({
      categoryOptions: CATEGORIES.map(k => ({ key: k, label: CATEGORY_LABELS[k] })),
    });
    this.loadModels();
  },

  async loadModels() {
    const db = wx.cloud.database();
    const res = await db.collection('model_configs').get();
    const categories = CATEGORIES.filter(c => c !== 'auto').map(key => ({
      key, label: CATEGORY_LABELS[key],
      models: res.data.filter(m => m.category === key),
    }));
    this.setData({ categories });
  },

  // ---- toggle ----
  async toggleModel(e) {
    const { id, active } = e.currentTarget.dataset;
    await callFunction('adminAction', {
      action: 'update', collection: 'model_configs', docId: id,
      data: { is_active: !active }
    });
    this.loadModels();
  },

  async testModel(e) {
    const { id } = e.currentTarget.dataset;
    wx.showLoading({ title: '测试中...' });
    let loadingActive = true;
    try {
      const res = await callFunction('testModel', { modelId: id });
      wx.hideLoading();
      loadingActive = false;
      if (res.ok) {
        wx.showToast({ title: '连通成功 ' + res.latency + 'ms', icon: 'success' });
      } else {
        console.error('[testModel] 失败详情:', res);
        wx.showModal({
          title: '测试失败',
          content: String(res.error || '未知错误').slice(0, 200),
          showCancel: false,
        });
      }
    } catch (err) {
      if (loadingActive) { wx.hideLoading(); loadingActive = false; }
      console.error('[testModel] 请求异常:', err);
      wx.showModal({
        title: '测试请求失败',
        content: String(err && (err.errMsg || err.message) || err).slice(0, 200),
        showCancel: false,
      });
    }
  },

  // ---- add ----
  showAddForm(e) {
    const category = e.currentTarget.dataset.category;
    const idx = this.data.categoryOptions.findIndex(c => c.key === category);
    this.setData({
      showForm: true, editingId: '',
      formCategoryIdx: idx >= 0 ? idx : 0,
      formData: { name: '', api_url: '', api_key: '', api_secret: '', config: {} },
      formConfigText: '{}',
    });
  },

  // ---- edit ----
  editModel(e) {
    const id = e.currentTarget.dataset.id;
    const db = wx.cloud.database();
    db.collection('model_configs').doc(id).get().then(res => {
      const m = res.data;
      const idx = this.data.categoryOptions.findIndex(c => c.key === m.category);
      this.setData({
        showForm: true, editingId: id,
        formCategoryIdx: idx >= 0 ? idx : 0,
        formData: { name: m.name, api_url: m.api_url || '', api_key: m.api_key || '', api_secret: m.api_secret || '', config: m.config || {} },
        formConfigText: JSON.stringify(m.config || {}, null, 2),
      });
    }).catch(err => {
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  hideForm() {
    this.setData({ showForm: false });
  },

  // ---- form handlers ----
  onCategoryChange(e) {
    this.setData({ formCategoryIdx: parseInt(e.detail.value) });
  },

  onFieldChange(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({ ['formData.' + field]: value });
  },

  onConfigChange(e) {
    this.setData({ formConfigText: e.detail.value });
  },

  toggleShowKey() {
    this.setData({ showKey: !this.data.showKey });
  },

  // ---- save ----
  async saveModel() {
    const { editingId, formData, formConfigText, formCategoryIdx, categoryOptions } = this.data;
    let config = {};
    try {
      config = JSON.parse(formConfigText);
    } catch (e) {
      wx.showToast({ title: '扩展参数 JSON 格式错误', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    const category = categoryOptions[formCategoryIdx].key;
    const payload = { ...formData, config, category, updated_at: new Date() };

    try {
      if (editingId) {
        await callFunction('adminAction', {
          action: 'update', collection: 'model_configs', docId: editingId, data: payload
        });
      } else {
        payload.is_active = false;
        await callFunction('adminAction', {
          action: 'add', collection: 'model_configs', data: payload
        });
      }
      wx.showToast({ title: editingId ? '已更新' : '已添加', icon: 'success' });
      this.setData({ showForm: false });
      this.loadModels();
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },
});
