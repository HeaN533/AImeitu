const { getTempURL, callFunction } = require('../../utils/cloud');
const { CATEGORY_LABELS, SUB_TYPES } = require('../../utils/constants');

function findSubLabel(category, subType) {
  const subs = SUB_TYPES[category] || [];
  const found = subs.find(s => s.key === subType);
  return found ? found.label : subType;
}

Page({
  data: { list: [], loading: true },

  onShow: async function () {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    const res = await db.collection('images')
      .where({ _openid: '{openid}' })
      .orderBy('created_at', 'desc').limit(50).get();

    const list = [];
    for (const img of res.data) {
      let thumbUrl = '';
      try {
        thumbUrl = await getTempURL(img.preview_url);
      } catch (e) { /* skip */ }
      list.push({
        ...img,
        thumbUrl,
        label: CATEGORY_LABELS[img.process_type] || img.process_type,
        subLabel: findSubLabel(img.process_type, img.sub_type),
        created_at: img.created_at ? new Date(img.created_at).toLocaleDateString() : '',
      });
    }
    this.setData({ list, loading: false });
  },

  async download(e) {
    const imageId = e.currentTarget.dataset.id;
    wx.showLoading({ title: '处理中...' });
    try {
      const res = await callFunction('downloadImage', { imageId });
      const url = await getTempURL(res.resultFileID);
      wx.downloadFile({
        url,
        success: (df) => {
          wx.saveImageToPhotosAlbum({
            filePath: df.tempFilePath,
            success: () => { wx.hideLoading(); wx.showToast({ title: '已保存到相册' }); },
            fail: (err) => {
              wx.hideLoading();
              if (err.errMsg && err.errMsg.indexOf('auth deny') !== -1) {
                wx.showModal({
                  title: '需要相册权限',
                  content: '请在设置中允许保存图片到相册',
                  confirmText: '去设置',
                  success: (m) => { if (m.confirm) wx.openSetting(); }
                });
              } else {
                wx.showToast({ title: '保存失败', icon: 'none' });
              }
            },
          });
        },
        fail: () => {
          wx.hideLoading();
          wx.showToast({ title: '下载失败', icon: 'none' });
        },
      });
    } catch (e) {
      wx.hideLoading();
    }
  },

  reprocess(e) {
    const { category, fileid } = e.currentTarget.dataset;
    wx.navigateTo({
      url: '/pages/process/process?category=' + category + '&fileID=' + fileid
    });
  },
});
