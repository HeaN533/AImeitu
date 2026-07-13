const app = getApp();
const { CATEGORIES, CATEGORY_LABELS } = require('../../utils/constants');

const CATEGORY_ICONS = { beautify: '👤', filter: '📸', style: '🎭' };
const CATEGORY_DESC = {
  beautify: '磨皮美肤、智能美白等',
  filter: '复古、胶片、日系、黑白等',
  style: '动漫、油画、素描、水彩、赛博',
};

Page({
  data: { tokens: 0, activityTokens: 0, mainCards: [], subCards: [] },

  onShow: async function () {
    const user = await app.getUserInfo();
    const allCards = CATEGORIES.map(k => ({
      key: k, label: CATEGORY_LABELS[k], icon: CATEGORY_ICONS[k], desc: CATEGORY_DESC[k],
    }));
    this.setData({
      tokens: user.tokens || 0,
      activityTokens: user.activity_tokens || 0,
      mainCards: allCards.filter(c => c.key === 'style' || c.key === 'filter'),
      subCards: allCards.filter(c => c.key === 'beautify'),
    });
  },

  goProcess(e) {
    const category = e.currentTarget.dataset.category;
    wx.navigateTo({ url: '/pages/process/process?category=' + category });
  },
});
