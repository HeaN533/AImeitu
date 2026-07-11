const { SUPPORTED_FORMATS, MAX_FILE_SIZE } = require('./constants');

function validateImage(file) {
  if (!file) return { valid: false, error: '请选择图片' };
  if (file.size > MAX_FILE_SIZE) return { valid: false, error: '图片不能超过 10MB' };

  // wx.chooseMedia 的 mediaType:['image'] 已保证是图片
  // fileType 字段是媒体类别（'image'/'video'），不是扩展名，不能用于格式判断
  // 只基于路径扩展名判断；无扩展名（如 camera 拍照 wxfile://tmp_xxx）放行
  const fullPath = file.name || file.path || '';
  const dotIdx = fullPath.lastIndexOf('.');
  if (dotIdx < 0 || dotIdx === fullPath.length - 1) {
    return { valid: true };
  }
  const ext = fullPath.slice(dotIdx + 1).toLowerCase();
  if (!SUPPORTED_FORMATS.includes(ext)) {
    return { valid: false, error: '仅支持 jpg/png/heic/webp 格式' };
  }
  return { valid: true };
}

function validateRequired(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return { valid: false, error: fieldName + '不能为空' };
  }
  return { valid: true };
}

module.exports = { validateImage, validateRequired };
