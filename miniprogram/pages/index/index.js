const app = getApp();
const { CATEGORIES, CATEGORY_LABELS } = require('../../utils/constants');

const CATEGORY_ICONS = { beautify: '👤', color: '🎨', style: '🎭', auto: '✨' };
const CATEGORY_DESC = { beautify: '磨皮美肤、智能美白等', color: '调色滤镜、去雾增强等', style: '动漫油画水墨等风格', auto: 'AI 自动分析最优方案' };

Page({
  data: { tokens: 0, activityTokens: 0, categories: [] },

  onShow: async function () {
    const user = await app.getUserInfo();
    this.setData({
      tokens: user.tokens || 0,
      activityTokens: user.activity_tokens || 0,
      categories: CATEGORIES.map(k => ({
        key: k, label: CATEGORY_LABELS[k], icon: CATEGORY_ICONS[k], desc: CATEGORY_DESC[k],
      })),
    });
  },

  goProcess(e) {
    const category = e.currentTarget.dataset.category;
    wx.navigateTo({ url: '/pages/process/process?category=' + category });
  },
});
