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
    console.log('[loadPrice] start, imageId:', imageId);
    const img = await db.collection('images').doc(imageId).get();
    console.log('[loadPrice] img:', JSON.stringify(img.data));
    const category = img.data.process_type;
    const subType = img.data.sub_type;
    const originalFileID = img.data.original_url;

    let price = DEFAULT_PRICES[category] || 2;
    console.log('[loadPrice] default price:', price, 'category:', category, 'subType:', subType);
    try {
      const subPriceRes = await db.collection('pricing_config')
        .where({ category: category, sub_type: subType }).get();
      console.log('[loadPrice] subPriceRes length:', subPriceRes.data.length, 'data:', JSON.stringify(subPriceRes.data));
      if (subPriceRes.data.length > 0) {
        price = subPriceRes.data[0].tokens;
      } else {
        console.log('[loadPrice] no sub price, trying category only');
        const catPriceRes = await db.collection('pricing_config')
          .where({ category: category }).limit(1).get();
        console.log('[loadPrice] catPriceRes:', JSON.stringify(catPriceRes.data));
        if (catPriceRes.data.length > 0) {
          price = catPriceRes.data[0].tokens;
        }
      }
    } catch (e) { console.error('[loadPrice] ERROR:', e); }

    console.log('[loadPrice] FINAL price:', price);
    this.setData({ price: price, category: category, originalFileID: originalFileID });
    console.log('[loadPrice] after setData, this.data.price =', this.data.price);
    setTimeout(() => {
      console.log('[loadPrice] 1s later, this.data.price =', this.data.price);
    }, 1000);
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
