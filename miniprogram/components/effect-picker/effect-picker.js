const { CATEGORIES, CATEGORY_LABELS, SUB_TYPES, DEFAULT_PRICES } = require('../../utils/constants');

Component({
  data: {
    categories: CATEGORIES.map(k => ({ key: k, label: CATEGORY_LABELS[k] })),
    activeCategory: 'beautify',
    currentSubTypes: SUB_TYPES['beautify'],
    currentPrice: DEFAULT_PRICES['beautify'],
    selectedSubType: '',
  },

  methods: {
    switchCategory(e) {
      const cat = e.currentTarget.dataset.key;
      this.setData({
        activeCategory: cat,
        currentSubTypes: SUB_TYPES[cat],
        currentPrice: DEFAULT_PRICES[cat],
        selectedSubType: '',
      });
    },

    selectSubType(e) {
      const subType = e.currentTarget.dataset.key;
      this.setData({ selectedSubType: subType });
      this.triggerEvent('select', {
        category: this.data.activeCategory,
        subType: subType,
        price: this.data.currentPrice,
      });
    },
  },
});
