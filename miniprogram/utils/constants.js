const CATEGORIES = ['beautify', 'color', 'style', 'auto'];

const CATEGORY_LABELS = {
  beautify: '人像美化', color: '色彩画质',
  style: '风格转换', auto: '一键美化',
};

const SUB_TYPES = {
  beautify: [
    { key: 'smooth', label: '磨皮美肤' },
    { key: 'whiten', label: '智能美白' },
    { key: 'thin_face', label: '瘦脸塑形' },
    { key: 'big_eyes', label: '大眼亮眼' },
    { key: 'acne_removal', label: '祛痘去皱' },
  ],
  color: [
    { key: 'auto_tone', label: '智能调色' },
    { key: 'filter', label: '滤镜风格' },
    { key: 'sharpen', label: '清晰度增强' },
    { key: 'dehaze_denoise', label: '去雾除噪' },
    { key: 'lighting', label: '光影优化' },
  ],
  style: [
    { key: 'anime', label: '动漫风' },
    { key: 'oil_painting', label: '油画风' },
    { key: 'ink', label: '水墨风' },
    { key: 'sketch', label: '素描/线稿风' },
    { key: 'pixel', label: '像素风' },
  ],
  auto: [
    { key: 'auto_enhance', label: 'AI 智能美化' },
  ],
};

const DEFAULT_PRICES = { beautify: 2, color: 1, style: 3, auto: 2 };
const SUPPORTED_FORMATS = ['jpg', 'jpeg', 'png', 'heic', 'webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

module.exports = {
  CATEGORIES, CATEGORY_LABELS, SUB_TYPES, DEFAULT_PRICES,
  SUPPORTED_FORMATS, MAX_FILE_SIZE,
};
