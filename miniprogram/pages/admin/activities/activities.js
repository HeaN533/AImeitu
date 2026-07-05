const app = getApp();
Page({
  data: { list: [] },
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

  createActivity() {
    wx.showModal({
      title: '创建活动', editable: true, placeholderText: '活动名称',
      success: async (res) => {
        if (!res.confirm || !res.content) return;
        const db = wx.cloud.database();
        await db.collection('activities').add({
          data: {
            name: res.content, description: '', reward_tokens: 10,
            start_time: new Date(), end_time: new Date(Date.now() + 7 * 86400000),
            is_active: true, created_at: new Date(),
          }
        });
        this.load();
      },
    });
  },

  async deleteAct(e) {
    const id = e.currentTarget.dataset.id;
    const db = wx.cloud.database();
    await db.collection('activities').doc(id).remove();
    this.load();
  },
});
