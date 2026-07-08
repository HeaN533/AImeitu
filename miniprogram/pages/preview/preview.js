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
    const category = img.data.process_type;
    const originalFileID = img.data.original_url;

    let price = DEFAULT_PRICES[category] || 2;
    try {
      const priceRes = await db.collection('pricing_config')
        .where({ category }).get();
      if (priceRes.data.length > 0) {
        price = priceRes.data[0].tokens;
      }
    } catch (e) { /* fallback to DEFAULT_PRICES */ }

    this.setData({ price, category, originalFileID });
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
            success: () => {
              this.setData({ downloading: false });
              wx.showToast({ title: '已保存到相册' });
            },
            fail: (err) => {
              this.setData({ downloading: false });
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
          this.setData({ downloading: false });
          wx.showToast({ title: '下载失败', icon: 'none' });
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
