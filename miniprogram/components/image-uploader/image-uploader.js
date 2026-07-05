const { validateImage } = require('../../utils/validators');
const { uploadImage } = require('../../utils/cloud');

Component({
  data: {
    imagePath: '',
    imageFile: null,
    uploading: false,
    error: '',
  },

  methods: {
    chooseImage() {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sizeType: ['original'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const file = res.tempFiles[0];
          const validation = validateImage({ name: file.tempFilePath, size: file.size });
          if (!validation.valid) {
            this.setData({ error: validation.error });
            return;
          }
          this.setData({
            imagePath: file.tempFilePath,
            imageFile: file,
            error: '',
          });
        },
      });
    },

    reChoose() {
      this.setData({ imagePath: '', imageFile: null, error: '' });
    },

    async confirmUpload() {
      this.setData({ uploading: true, error: '' });
      try {
        const fileID = await uploadImage(this.data.imagePath);
        this.triggerEvent('upload', { fileID, tempPath: this.data.imagePath });
      } catch (e) {
        this.setData({ error: '上传失败，请重试' });
      } finally {
        this.setData({ uploading: false });
      }
    },
  },
});
