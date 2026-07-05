const { callFunction } = require('../../utils/cloud');

Page({
  data: { fileID: '', tempPath: '', category: '', subType: '', processing: false },

  onLoad(options) {
    this.setData({ category: options.category || 'auto' });
  },

  onImageUploaded(e) {
    this.setData({ fileID: e.detail.fileID, tempPath: e.detail.tempPath });
  },

  onEffectSelect(e) {
    this.setData({ subType: e.detail.subType, category: e.detail.category });
  },

  async startProcess() {
    this.setData({ processing: true });
    try {
      const res = await callFunction('processImage', {
        imageFileID: this.data.fileID,
        processType: this.data.category,
        subType: this.data.subType,
      });
      wx.redirectTo({
        url: '/pages/preview/preview?imageId=' + res.imageId + '&previewFileID=' + res.previewFileID,
      });
    } catch (e) {
      this.setData({ processing: false });
    }
  },
});
