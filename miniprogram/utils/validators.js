const { SUPPORTED_FORMATS, MAX_FILE_SIZE } = require('./constants');

function validateImage(file) {
  if (!file) return { valid: false, error: '请选择图片' };
  if (file.size > MAX_FILE_SIZE) return { valid: false, error: '图片不能超过 10MB' };

  if (file.fileType) {
    const ft = file.fileType.toLowerCase();
    if (ft === 'jpg' || ft === 'jpeg' || ft === 'png' || ft === 'heic' || ft === 'webp') {
      return { valid: true };
    }
    return { valid: false, error: '仅支持 jpg/png/heic/webp 格式' };
  }

  const ext = (file.name || file.path || '').split('.').pop().toLowerCase();
  if (!ext || ext === (file.name || file.path || '').toLowerCase()) {
    return { valid: true };
  }
  if (!SUPPORTED_FORMATS.includes(ext)) return { valid: false, error: '仅支持 jpg/png/heic/webp 格式' };
  return { valid: true };
}

function validateRequired(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return { valid: false, error: fieldName + '不能为空' };
  }
  return { valid: true };
}

module.exports = { validateImage, validateRequired };
