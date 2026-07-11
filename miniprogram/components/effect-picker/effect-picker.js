const { CATEGORIES, CATEGORY_LABELS, SUB_TYPES, DEFAULT_PRICES } = require('../../utils/constants');

Component({
  data: {
    categories: CATEGORIES.map(k => ({ key: k, label: CATEGORY_LABELS[k] })),
    activeCategory: 'beautify',
    currentSubTypes: SUB_TYPES['beautify'],
    selectedSubType: '',
    priceMap: {},
    defaultPrices: DEFAULT_PRICES,
  },

  lifetimes: {
    attached() {
      this.loadPrices();
    },
  },

  methods: {
    async loadPrices() {
      try {
        const db = wx.cloud.database();
        const res = await db.collection('pricing_config').get();
        const map = {};
        res.data.forEach(p => {
          map[p.category + '_' + p.sub_type] = p.tokens;
        });
        this.setData({ priceMap: map });
      } catch (e) {
        console.warn('[effect-picker] 加载定价失败，用默认值', e);
      }
    },

    getPrice(category, subType) {
      const key = category + '_' + subType;
      if (this.data.priceMap[key] !== undefined) return this.data.priceMap[key];
      return DEFAULT_PRICES[category] || 2;
    },

    switchCategory(e) {
      const cat = e.currentTarget.dataset.key;
      this.setData({
        activeCategory: cat,
        currentSubTypes: SUB_TYPES[cat],
        selectedSubType: '',
      });
    },

    selectSubType(e) {
      const subType = e.currentTarget.dataset.key;
      const price = this.getPrice(this.data.activeCategory, subType);
      this.setData({ selectedSubType: subType });
      this.triggerEvent('select', {
        category: this.data.activeCategory,
        subType: subType,
        price: price,
      });
    },
  },
});
