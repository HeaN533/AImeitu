const { CATEGORIES, CATEGORY_LABELS, SUB_TYPES, DEFAULT_PRICES, BEAUTY_DEFAULTS, FILTER_OPTIONS } = require('../../utils/constants');

Component({
  data: {
    categories: CATEGORIES.map(k => ({ key: k, label: CATEGORY_LABELS[k] })),
    activeCategory: 'beautify',
    currentSubTypes: SUB_TYPES['beautify'],
    selectedSubType: '',
    priceMap: {},
    defaultPrices: DEFAULT_PRICES,
    // 人像美化 slider 参数
    bParams: { ...BEAUTY_DEFAULTS },
    bFilterIdx: 0,
    showFilterList: false,
    filterOptions: FILTER_OPTIONS,
    isBeautify: true,
  },

  properties: {
    initialCategory: { type: String, value: '' },
  },

  lifetimes: {
    attached() {
      const initCat = this.data.initialCategory && CATEGORIES.includes(this.data.initialCategory)
        ? this.data.initialCategory : 'beautify';
      this.setData({
        activeCategory: initCat,
        currentSubTypes: SUB_TYPES[initCat],
        isBeautify: initCat === 'beautify',
      });
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
        console.warn('[effect-picker] 加载定价失败', e);
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
        isBeautify: cat === 'beautify',
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

    // ---- 人像美化 slider ----
    onSliderChange(e) {
      const field = e.currentTarget.dataset.field;
      const value = e.detail.value;
      this.setData({ ['bParams.' + field]: value });
    },

    toggleFilterList() {
      this.setData({ showFilterList: !this.data.showFilterList });
    },

    selectFilter(e) {
      this.setData({ bFilterIdx: parseInt(e.currentTarget.dataset.idx), showFilterList: false });
    },

    confirmBeautify() {
      const params = { ...this.data.bParams };
      const filterKey = FILTER_OPTIONS[this.data.bFilterIdx].key;
      if (filterKey) params.filter_type = filterKey;
      const price = this.getPrice('beautify', 'beautify');
      this.triggerEvent('select', {
        category: 'beautify',
        subType: 'beautify',
        price: price,
        params: params,
      });
    },
  },
});
