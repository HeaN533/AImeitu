const app = getApp();
const { CATEGORIES, CATEGORY_LABELS } = require('../../../utils/constants');

Page({
  data: { categories: [] },

  onShow() {
    if (!app.globalData.isAdmin) { wx.navigateBack(); return; }
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

  async toggleModel(e) {
    const { id, active } = e.currentTarget.dataset;
    const db = wx.cloud.database();
    await db.collection('model_configs').doc(id).update({
      data: { is_active: !active, updated_at: new Date() }
    });
    this.loadModels();
  },

  addModel(e) {
    const category = e.currentTarget.dataset.category;
    wx.showModal({
      title: '添加模型',
      editable: true,
      placeholderText: '输入模型名称',
      success: async (res) => {
        if (!res.confirm || !res.content) return;
        const db = wx.cloud.database();
        await db.collection('model_configs').add({
          data: {
            name: res.content, category, api_url: '', api_key: '',
            is_active: false, config: {}, updated_at: new Date(),
          }
        });
        this.loadModels();
      },
    });
  },
});
