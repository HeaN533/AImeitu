const { getTempURL, callFunction } = require('../../utils/cloud');
const { DEFAULT_PRICES } = require('../../utils/constants');

Page({
  data: { imageId: '', previewFileID: '', previewUrl: '', price: 0, downloading: false, category: '', originalFileID: '' },

  onLoad(options) {
    const imageId = options.imageId;
    const previewFileID = options.previewFileID;
    this.setData({ imageId, previewFileID });
    this.loadPreview(previewFileID);
    this.loadPrice(imageId);
  },

  async loadPreview(fileID) {
    try {
      const url = await getTempURL(fileID);
      this.setData({ previewUrl: url });
    } catch (e) { /* toast already shown */ }
  },

  async loadPrice(imageId) {
    const db = wx.cloud.database();
    const img = await db.collection('images').doc(imageId).get();
    const price = DEFAULT_PRICES[img.data.process_type] || 2;
    this.setData({
      price,
      category: img.data.process_type,
      originalFileID: img.data.original_url
    });
  },

  async download() {
    this.setData({ downloading: true });
    try {
      const res = await callFunction('downloadImage', { imageId: this.data.imageId });
      const url = await getTempURL(res.resultFileID);
      wx.downloadFile({
        url,
        success: (df) => {
          wx.saveImageToPhotosAlbum({
            filePath: df.tempFilePath,
            success: () => wx.showToast({ title: '已保存到相册' }),
            fail: () => wx.showToast({ title: '保存失败', icon: 'none' }),
          });
        },
      });
    } catch (e) {
      this.setData({ downloading: false });
    }
  },

  retry() {
    wx.redirectTo({
      url: '/pages/process/process?category=' + this.data.category + '&fileID=' + this.data.originalFileID
    });
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
