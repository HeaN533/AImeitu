const app = getApp();
Page({
  data: { list: [], showForm: false, saving: false, editingId: '', formData: {} },

  onShow() { if (!app.globalData.isAdmin) { wx.navigateBack(); return; } this.load(); },

  async load() {
    const db = wx.cloud.database();
    const res = await db.collection('activities').orderBy('created_at', 'desc').get();
    this.setData({
      list: res.data.map(a => ({
        ...a,
        startLabel: a.start_time ? new Date(a.start_time).toLocaleDateString() : '',
        endLabel: a.end_time ? new Date(a.end_time).toLocaleDateString() : '',
      })),
    });
  },

  async toggle(e) {
    const { id, active } = e.currentTarget.dataset;
    const db = wx.cloud.database();
    await db.collection('activities').doc(id).update({ data: { is_active: !active } });
    this.load();
  },

  // ---- add ----
  showAddForm() {
    const today = new Date();
    const weekLater = new Date(Date.now() + 7 * 86400000);
    this.setData({
      showForm: true, editingId: '',
      formData: {
        name: '', description: '', reward_tokens: 10,
        start_time: today.toISOString().slice(0, 10),
        end_time: weekLater.toISOString().slice(0, 10),
      },
    });
  },

  // ---- edit ----
  editActivity(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.list.find(a => a._id === id);
    if (!item) return;
    const fmt = (d) => d ? new Date(d).toISOString().slice(0, 10) : '';
    this.setData({
      showForm: true, editingId: id,
      formData: {
        name: item.name, description: item.description || '',
        reward_tokens: item.reward_tokens,
        start_time: fmt(item.start_time),
        end_time: fmt(item.end_time),
      },
    });
  },

  hideForm() { this.setData({ showForm: false }); },

  onFieldChange(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['formData.' + field]: e.detail.value });
  },

  onNumChange(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['formData.' + field]: parseInt(e.detail.value) || 0 });
  },

  onDateChange(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['formData.' + field]: e.detail.value });
  },

  // ---- save ----
  async saveActivity() {
    const { editingId, formData } = this.data;
    if (!formData.name) { wx.showToast({ title: '请输入活动名称', icon: 'none' }); return; }

    this.setData({ saving: true });
    const db = wx.cloud.database();
    const payload = {
      name: formData.name,
      description: formData.description,
      reward_tokens: formData.reward_tokens,
      start_time: new Date(formData.start_time),
      end_time: new Date(formData.end_time),
    };

    try {
      if (editingId) {
        await db.collection('activities').doc(editingId).update({ data: payload });
      } else {
        await db.collection('activities').add({
          data: { ...payload, is_active: true, created_at: new Date() }
        });
      }
      wx.showToast({ title: editingId ? '已更新' : '已创建', icon: 'success' });
      this.setData({ showForm: false });
      this.load();
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  async deleteAct(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除？',
      success: async (res) => {
        if (!res.confirm) return;
        const db = wx.cloud.database();
        await db.collection('activities').doc(id).remove();
        this.load();
      },
    });
  },
});
