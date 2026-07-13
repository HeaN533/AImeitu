const CATEGORIES = ['beautify', 'filter', 'style'];

const CATEGORY_LABELS = {
  beautify: '人像美化', filter: '滤镜转换',
  style: '风格转换',
};

const SUB_TYPES = {
  beautify: [
    { key: 'smooth', label: '磨皮美肤' },
    { key: 'whiten', label: '智能美白' },
    { key: 'thin_face', label: '瘦脸塑形' },
    { key: 'big_eyes', label: '大眼亮眼' },
    { key: 'acne_removal', label: '祛痘去皱' },
  ],
  filter: [
    { key: 'auto_tone', label: '智能调色' },
    { key: 'sharpen', label: '清晰度增强' },
    { key: 'dehaze_denoise', label: '去雾除噪' },
    { key: 'vintage', label: '复古滤镜' },
    { key: 'film', label: '胶片滤镜' },
    { key: 'japanese', label: '日系滤镜' },
    { key: 'bw', label: '黑白艺术' },
    { key: 'warm_sun', label: '暖阳滤镜' },
  ],
  style: [
    { key: 'anime', label: '动漫风' },
    { key: 'oil_painting', label: '油画风' },
    { key: 'sketch', label: '素描/线稿风' },
    { key: 'watercolor', label: '水彩风' },
    { key: 'cyberpunk', label: '赛博风' },
  ],
};

const DEFAULT_PRICES = { beautify: 2, filter: 1, style: 3 };
const SUPPORTED_FORMATS = ['jpg', 'jpeg', 'png', 'heic', 'webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

module.exports = {
  CATEGORIES, CATEGORY_LABELS, SUB_TYPES, DEFAULT_PRICES,
  SUPPORTED_FORMATS, MAX_FILE_SIZE,
};
