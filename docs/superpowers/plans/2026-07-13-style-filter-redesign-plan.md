# 风格转换+滤镜转换为主打 + 毛玻璃 UI 改造计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将项目定位调整为风格转换+滤镜转换为主打，人像美化为副业；整体 UI 改为毛玻璃风格。

**Architecture:** 微信小程序原生 + 微信云开发。改 constants.js 驱动分类变更，app.wxss 定义毛玻璃通用类，各页面 wxss 引用通用类实现统一风格。

**Tech Stack:** 微信小程序原生框架、微信云开发（Node.js 18）、CSS backdrop-filter

## Global Constraints

- 图片格式：`SUPPORTED_FORMATS = ['jpg', 'jpeg', 'png', 'heic', 'webp']`
- 单张上限：`MAX_FILE_SIZE = 10 * 1024 * 1024`（10MB）
- 云函数超时：30s
- 扣费优先级：限时代币（`expires_at` 升序）→ 永久代币（`users.tokens`）
- 管理端鉴权：服务端校验 `users.role === 'admin'`
- 时区：所有日期计算以北京时间（UTC+8）为准
- 定价按子选项（category + sub_type），后台可配
- AI 模型：继续用现有 API 模式（model_configs 表配置）
- 毛玻璃效果：`backdrop-filter: blur(20rpx)` + `background: rgba(255,255,255,0.15)` + 半透明边框
- Git 分支：`feature/style-filter-redesign`，每个任务 commit

## 测试策略

- 云函数：`node --check` 语法检查 + 云开发控制台云端测试
- 前端：微信开发者工具编译无报错 + 模拟器视觉验证
- 毛玻璃效果：开发者工具模拟器 + 真机预览（backdrop-filter 需真机验证）

---

## File Structure

```
miniprogram/
├── app.wxss                         # [修改] 毛玻璃通用类 + 渐变背景变量
├── utils/constants.js               # [修改] 分类调整（color→filter，删auto，新子项）
├── pages/
│   ├── index/index.js               # [修改] 分类数据适配
│   ├── index/index.wxml             # [修改] 大卡片+小卡片布局
│   ├── index/index.wxss             # [修改] 毛玻璃大卡片+小卡片样式
│   ├── process/process.wxss         # [修改] 毛玻璃步骤卡片
│   ├── preview/preview.wxss         # [修改] 毛玻璃信息栏+按钮
│   ├── history/history.wxss         # [修改] 毛玻璃列表项
│   ├── profile/profile.wxss         # [修改] 毛玻璃用户/菜单/流水卡片
│   ├── recharge/recharge.wxss       # [修改] 毛玻璃套餐卡片
│   └── admin/*/*.wxss               # [修改] 管理后台毛玻璃统一风格
└── components/
    ├── effect-picker/effect-picker.wxml  # [修改] 图标适配 filter key
    ├── effect-picker/effect-picker.wxss  # [修改] 毛玻璃标签+子选项
    └── image-uploader/image-uploader.wxss # [修改] 毛玻璃上传区域

cloudfunctions/
├── initDB/index.js                  # [修改] pricing_config 清旧+插入18条新定价
└── processImage/index.js            # [修改] 删除 getActiveModel 的 auto 分支
```

---

## Task 1：constants.js 分类调整

**Files:**
- Modify: `miniprogram/utils/constants.js`

**Interfaces:**
- Produces: `CATEGORIES = ['beautify', 'filter', 'style']`（删 auto，color→filter）
- Produces: `CATEGORY_LABELS = { beautify:'人像美化', filter:'滤镜转换', style:'风格转换' }`
- Produces: `SUB_TYPES` 按新定义替换
- Produces: `DEFAULT_PRICES = { beautify:2, filter:1, style:3 }`（color→filter）

- [ ] **Step 1：替换 constants.js 全文**

```js
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
```

- [ ] **Step 2：语法检查**

Run: `node --check miniprogram/utils/constants.js`
Expected: 无输出，exit 0

- [ ] **Step 3：Commit**

```bash
git add miniprogram/utils/constants.js
git commit -m "refactor: 分类调整—color→filter，删auto，新增水彩/赛博/复古/胶片/日系/黑白/暖阳"
```

---

## Task 2：app.wxss 毛玻璃通用类

**Files:**
- Modify: `miniprogram/app.wxss`

**Interfaces:**
- Produces: `.glass-card` `.glass-bg` `.glass-input` `.glass-btn` 通用类
- Produces: 毛玻璃配色 CSS 变量

- [ ] **Step 1：替换 app.wxss 全文**

```css
page {
  background: #1a1a2e;
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue',
    Helvetica, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  --primary: #6c5ce7;
  --primary-dark: #5a4bd1;
  --primary-light: rgba(108,92,231,0.15);
  --danger: #fa5151;
  --warn: #ff9500;
  --text: #ffffff;
  --text-secondary: rgba(255,255,255,0.7);
  --text-hint: rgba(255,255,255,0.5);
  --glass-bg: rgba(255,255,255,0.12);
  --glass-border: rgba(255,255,255,0.2);
  --glass-blur: blur(20rpx);
  --shadow: 0 8rpx 32rpx rgba(0,0,0,0.15);
  --radius: 32rpx;
  --radius-sm: 24rpx;
  --radius-btn: 16rpx;
}

.container {
  min-height: 100vh;
  padding: 24rpx;
  box-sizing: border-box;
  position: relative;
}

/* 毛玻璃渐变背景 */
.glass-bg {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%);
  z-index: 0;
  pointer-events: none;
}

/* 毛玻璃卡片 */
.glass-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1rpx solid var(--glass-border);
  border-radius: var(--radius);
  padding: 28rpx;
  margin-bottom: 20rpx;
  box-shadow: var(--shadow);
  box-sizing: border-box;
  position: relative;
  z-index: 1;
}

/* 毛玻璃小卡片 */
.glass-card-sm {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1rpx solid var(--glass-border);
  border-radius: var(--radius-sm);
  padding: 20rpx;
  margin-bottom: 16rpx;
  box-shadow: var(--shadow);
  box-sizing: border-box;
}

/* 毛玻璃输入框 */
.glass-input {
  background: rgba(255,255,255,0.08);
  backdrop-filter: blur(10rpx);
  -webkit-backdrop-filter: blur(10rpx);
  border: 1rpx solid var(--glass-border);
  border-radius: var(--radius-btn);
  padding: 16rpx 24rpx;
  font-size: 28rpx;
  color: var(--text);
  box-sizing: border-box;
}

/* 毛玻璃按钮 */
.glass-btn {
  background: rgba(108,92,231,0.3);
  backdrop-filter: blur(10rpx);
  -webkit-backdrop-filter: blur(10rpx);
  border: 1rpx solid rgba(108,92,231,0.4);
  border-radius: var(--radius-btn);
  color: #fff;
  font-size: 30rpx;
  padding: 20rpx 40rpx;
  text-align: center;
}
.glass-btn::after { border: none; }

/* card base（兼容旧代码） */
.card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1rpx solid var(--glass-border);
  border-radius: var(--radius);
  padding: 28rpx;
  margin-bottom: 20rpx;
  box-shadow: var(--shadow);
  box-sizing: border-box;
  position: relative;
  z-index: 1;
}

/* empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 40rpx;
}
.empty-state .icon { font-size: 100rpx; margin-bottom: 24rpx; }
.empty-state .text { font-size: 28rpx; color: var(--text-secondary); }

/* divider */
.divider { height: 1rpx; background: rgba(255,255,255,0.1); margin: 0 -28rpx; }

/* global reset */
view, text, image, button, input, scroll-view {
  box-sizing: border-box;
}
```

- [ ] **Step 2：Commit**

```bash
git add miniprogram/app.wxss
git commit -m "style: app.wxss 毛玻璃通用类 + 深色渐变背景"
```

---

## Task 3：首页布局改造（大卡片+小卡片+毛玻璃）

**Files:**
- Modify: `miniprogram/pages/index/index.js`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.wxss`

**Interfaces:**
- Consumes: `CATEGORIES`（`['beautify','filter','style']`）、`CATEGORY_LABELS`
- Produces: 首页大卡片（风格+滤镜）+ 小卡片（人像美化）

- [ ] **Step 1：替换 index.js**

```js
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
```

- [ ] **Step 2：替换 index.wxml**

```xml
<view class="container">
  <view class="glass-bg"></view>

  <view class="hero">
    <view class="hero-title">AI 图片美化</view>
    <view class="hero-sub">让每张照片变成艺术品</view>
    <token-badge tokens="{{tokens}}" activityTokens="{{activityTokens}}" />
  </view>

  <view class="main-grid">
    <view class="main-card glass-card" wx:for="{{mainCards}}" wx:key="key"
      data-category="{{item.key}}" bindtap="goProcess">
      <view class="main-icon-wrap"><text class="main-icon">{{item.icon}}</text></view>
      <view class="main-name">{{item.label}}</view>
      <view class="main-desc">{{item.desc}}</view>
    </view>
  </view>

  <view class="sub-section">
    <view class="sub-section-title">更多功能</view>
    <view class="sub-card glass-card-sm" wx:for="{{subCards}}" wx:key="key"
      data-category="{{item.key}}" bindtap="goProcess">
      <view class="sub-icon-wrap"><text class="sub-icon">{{item.icon}}</text></view>
      <view class="sub-info">
        <view class="sub-name">{{item.label}}</view>
        <view class="sub-desc">{{item.desc}}</view>
      </view>
      <text class="sub-arrow">›</text>
    </view>
  </view>
</view>
```

- [ ] **Step 3：替换 index.wxss**

```css
.hero {
  padding: 60rpx 0 40rpx;
  text-align: center;
  position: relative;
  z-index: 1;
}
.hero-title {
  font-size: 48rpx;
  font-weight: 800;
  color: var(--text);
  letter-spacing: 2rpx;
}
.hero-sub {
  font-size: 28rpx;
  color: var(--text-secondary);
  margin: 12rpx 0 28rpx;
}

/* 主打大卡片 */
.main-grid {
  display: flex;
  gap: 20rpx;
  position: relative;
  z-index: 1;
  margin-bottom: 40rpx;
}
.main-card {
  flex: 1;
  padding: 48rpx 24rpx 40rpx;
  text-align: center;
}
.main-icon-wrap {
  width: 112rpx;
  height: 112rpx;
  border-radius: 50%;
  margin: 0 auto 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(108,92,231,0.2);
  border: 1rpx solid rgba(108,92,231,0.3);
}
.main-icon { font-size: 60rpx; }
.main-name {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 12rpx;
}
.main-desc {
  font-size: 22rpx;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* 副业小卡片 */
.sub-section {
  position: relative;
  z-index: 1;
}
.sub-section-title {
  font-size: 26rpx;
  color: var(--text-hint);
  margin-bottom: 16rpx;
  padding-left: 8rpx;
}
.sub-card {
  display: flex;
  align-items: center;
  padding: 24rpx 28rpx;
}
.sub-icon-wrap {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.1);
  margin-right: 24rpx;
  flex-shrink: 0;
}
.sub-icon { font-size: 40rpx; }
.sub-info { flex: 1; }
.sub-name {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4rpx;
}
.sub-desc {
  font-size: 22rpx;
  color: var(--text-secondary);
}
.sub-arrow {
  font-size: 40rpx;
  color: var(--text-hint);
}
```

- [ ] **Step 4：Commit**

```bash
git add miniprogram/pages/index/index.js miniprogram/pages/index/index.wxml miniprogram/pages/index/index.wxss
git commit -m "feat: 首页大卡片+小卡片布局 + 毛玻璃风格"
```

---

## Task 4：effect-picker 适配新分类 + 毛玻璃

**Files:**
- Modify: `miniprogram/components/effect-picker/effect-picker.wxml`
- Modify: `miniprogram/components/effect-picker/effect-picker.wxss`

- [ ] **Step 1：修改 effect-picker.wxml 图标适配**

将 effect-picker.wxml 中的图标判断：
```xml
        <text wx:if="{{activeCategory === 'beautify'}}">✨</text>
        <text wx:elif="{{activeCategory === 'color'}}">🎨</text>
        <text wx:elif="{{activeCategory === 'style'}}">🖼️</text>
        <text wx:else>🤖</text>
```
替换为：
```xml
        <text wx:if="{{activeCategory === 'beautify'}}">✨</text>
        <text wx:elif="{{activeCategory === 'filter'}}">📸</text>
        <text wx:elif="{{activeCategory === 'style'}}">🎭</text>
        <text wx:else>🎨</text>
```

- [ ] **Step 2：替换 effect-picker.wxss 为毛玻璃风格**

读取当前 effect-picker.wxss，替换为毛玻璃版本（保留布局逻辑，改配色为深色毛玻璃）：

```css
.picker {
  position: relative;
  z-index: 1;
}
.tabs {
  white-space: nowrap;
  margin-bottom: 24rpx;
}
.tab {
  display: inline-block;
  padding: 16rpx 32rpx;
  margin-right: 16rpx;
  font-size: 28rpx;
  color: var(--text-secondary);
  background: rgba(255,255,255,0.08);
  backdrop-filter: blur(10rpx);
  -webkit-backdrop-filter: blur(10rpx);
  border: 1rpx solid var(--glass-border);
  border-radius: 32rpx;
}
.tab.on {
  color: #fff;
  background: rgba(108,92,231,0.3);
  border-color: rgba(108,92,231,0.5);
}
.subs {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}
.sub {
  width: calc(33.33% - 12rpx);
  padding: 24rpx 12rpx;
  text-align: center;
  background: rgba(255,255,255,0.08);
  backdrop-filter: blur(10rpx);
  -webkit-backdrop-filter: blur(10rpx);
  border: 1rpx solid var(--glass-border);
  border-radius: var(--radius-sm);
}
.sub.on {
  background: rgba(108,92,231,0.25);
  border-color: rgba(108,92,231,0.5);
}
.sub-icon { font-size: 48rpx; margin-bottom: 12rpx; }
.sub-name { font-size: 24rpx; color: var(--text); margin-bottom: 4rpx; }
.sub-price { font-size: 20rpx; color: var(--text-hint); }
```

- [ ] **Step 3：Commit**

```bash
git add miniprogram/components/effect-picker/effect-picker.wxml miniprogram/components/effect-picker/effect-picker.wxss
git commit -m "style: effect-picker 适配 filter 分类 + 毛玻璃风格"
```

---

## Task 5：image-uploader 毛玻璃

**Files:**
- Modify: `miniprogram/components/image-uploader/image-uploader.wxss`

- [ ] **Step 1：读取并替换 image-uploader.wxss 为毛玻璃风格**

读取当前文件，替换为毛玻璃版本。上传区域用虚线半透明边框 + 毛玻璃背景，预览区用毛玻璃卡片。

```css
.uploader {
  position: relative;
  z-index: 1;
}
.up-zone {
  border: 2rpx dashed var(--glass-border);
  border-radius: var(--radius);
  padding: 80rpx 40rpx;
  text-align: center;
  background: rgba(255,255,255,0.05);
  backdrop-filter: blur(10rpx);
  -webkit-backdrop-filter: blur(10rpx);
}
.up-plus {
  font-size: 80rpx;
  color: var(--text-hint);
  margin-bottom: 16rpx;
}
.up-text {
  font-size: 28rpx;
  color: var(--text-secondary);
  margin-bottom: 8rpx;
}
.up-hint {
  font-size: 22rpx;
  color: var(--text-hint);
}
.up-preview {
  border-radius: var(--radius);
  overflow: hidden;
  background: rgba(255,255,255,0.05);
  backdrop-filter: blur(10rpx);
  -webkit-backdrop-filter: blur(10rpx);
  border: 1rpx solid var(--glass-border);
}
.up-img {
  width: 100%;
  height: 400rpx;
}
.up-btns {
  display: flex;
  justify-content: center;
  gap: 24rpx;
  padding: 24rpx;
}
.up-repick, .up-confirm {
  padding: 16rpx 40rpx;
  border-radius: var(--radius-btn);
  font-size: 28rpx;
}
.up-repick {
  background: rgba(255,255,255,0.1);
  color: var(--text-secondary);
  border: 1rpx solid var(--glass-border);
}
.up-confirm {
  background: rgba(108,92,231,0.4);
  color: #fff;
  border: 1rpx solid rgba(108,92,231,0.5);
}
.up-err {
  color: var(--danger);
  font-size: 24rpx;
  text-align: center;
  padding: 16rpx;
}
```

- [ ] **Step 2：Commit**

```bash
git add miniprogram/components/image-uploader/image-uploader.wxss
git commit -m "style: image-uploader 毛玻璃风格"
```

---

## Task 6：process 页毛玻璃

**Files:**
- Modify: `miniprogram/pages/process/process.wxss`

- [ ] **Step 1：读取并替换 process.wxss 为毛玻璃风格**

读取当前文件，保留布局逻辑，配色改为深色毛玻璃。步骤卡片用 `.glass-card-sm`，按钮用 `.glass-btn`。

- [ ] **Step 2：Commit**

```bash
git add miniprogram/pages/process/process.wxss
git commit -m "style: process 页毛玻璃风格"
```

---

## Task 7：preview 页毛玻璃

**Files:**
- Modify: `miniprogram/pages/preview/preview.wxss`

- [ ] **Step 1：读取并替换 preview.wxss 为毛玻璃风格**

图片预览区用毛玻璃卡片包裹，信息栏半透明，按钮用 `.glass-btn`。

- [ ] **Step 2：Commit**

```bash
git add miniprogram/pages/preview/preview.wxss
git commit -m "style: preview 页毛玻璃风格"
```

---

## Task 8：history 页毛玻璃

**Files:**
- Modify: `miniprogram/pages/history/history.wxss`

- [ ] **Step 1：读取并替换 history.wxss 为毛玻璃风格**

列表项用 `.glass-card-sm`，状态标签半透明。

- [ ] **Step 2：Commit**

```bash
git add miniprogram/pages/history/history.wxss
git commit -m "style: history 页毛玻璃风格"
```

---

## Task 9：profile 页毛玻璃

**Files:**
- Modify: `miniprogram/pages/profile/profile.wxss`

- [ ] **Step 1：读取并替换 profile.wxss 为毛玻璃风格**

用户卡片、代币卡片、菜单卡片、流水卡片全部毛玻璃。

- [ ] **Step 2：Commit**

```bash
git add miniprogram/pages/profile/profile.wxss
git commit -m "style: profile 页毛玻璃风格"
```

---

## Task 10：recharge 页毛玻璃

**Files:**
- Modify: `miniprogram/pages/recharge/recharge.wxss`

- [ ] **Step 1：读取并替换 recharge.wxss 为毛玻璃风格**

套餐卡片毛玻璃，选中状态用紫色高亮。

- [ ] **Step 2：Commit**

```bash
git add miniprogram/pages/recharge/recharge.wxss
git commit -m "style: recharge 页毛玻璃风格"
```

---

## Task 11：管理后台毛玻璃统一风格

**Files:**
- Modify: `miniprogram/pages/admin/dashboard/dashboard.wxss`
- Modify: `miniprogram/pages/admin/models/models.wxss`
- Modify: `miniprogram/pages/admin/activities/activities.wxss`
- Modify: `miniprogram/pages/admin/settings/settings.wxss`

- [ ] **Step 1：逐个读取并替换为毛玻璃风格**

4 个管理后台页面 wxss 统一改为毛玻璃风格：卡片用 `.glass-card`，输入框用 `.glass-input`，tab 栏半透明。

- [ ] **Step 2：Commit**

```bash
git add miniprogram/pages/admin/
git commit -m "style: 管理后台毛玻璃统一风格"
```

---

## Task 12：initDB 定价记录更新

**Files:**
- Modify: `cloudfunctions/initDB/index.js`

**Interfaces:**
- Produces: pricing_config 表清理旧记录 + 插入 18 条新子选项定价

- [ ] **Step 1：修改 initDB 的 pricing_config 部分**

在 initDB/index.js 中，将旧定价清理逻辑和插入逻辑替换为：
- 清理所有旧 pricing_config 记录（全部删除后重新插入）
- 插入 18 条新记录：beautify 5 条 + filter 8 条 + style 5 条

```js
  // 定价配置：清理旧记录后插入新子选项定价
  const _ = db.command;
  const oldPrices = await db.collection('pricing_config').get();
  for (const old of oldPrices.data) {
    await db.collection('pricing_config').doc(old._id).remove();
  }

  const prices = [
    { category: 'beautify', sub_type: 'smooth', tokens: 2 },
    { category: 'beautify', sub_type: 'whiten', tokens: 2 },
    { category: 'beautify', sub_type: 'thin_face', tokens: 3 },
    { category: 'beautify', sub_type: 'big_eyes', tokens: 3 },
    { category: 'beautify', sub_type: 'acne_removal', tokens: 2 },
    { category: 'filter', sub_type: 'auto_tone', tokens: 1 },
    { category: 'filter', sub_type: 'sharpen', tokens: 1 },
    { category: 'filter', sub_type: 'dehaze_denoise', tokens: 2 },
    { category: 'filter', sub_type: 'vintage', tokens: 2 },
    { category: 'filter', sub_type: 'film', tokens: 2 },
    { category: 'filter', sub_type: 'japanese', tokens: 2 },
    { category: 'filter', sub_type: 'bw', tokens: 1 },
    { category: 'filter', sub_type: 'warm_sun', tokens: 2 },
    { category: 'style', sub_type: 'anime', tokens: 3 },
    { category: 'style', sub_type: 'oil_painting', tokens: 3 },
    { category: 'style', sub_type: 'sketch', tokens: 2 },
    { category: 'style', sub_type: 'watercolor', tokens: 3 },
    { category: 'style', sub_type: 'cyberpunk', tokens: 3 },
  ];
  for (const p of prices) {
    await db.collection('pricing_config').add({
      data: { ...p, updated_at: new Date() }
    });
  }
  results['default_pricing'] = 'inserted 18';
```

- [ ] **Step 2：语法检查**

Run: `node --check cloudfunctions/initDB/index.js`

- [ ] **Step 3：Commit**

```bash
git add cloudfunctions/initDB/index.js
git commit -m "feat(initDB): pricing_config 清旧+插入18条新子选项定价"
```

---

## Task 13：processImage 删除 auto 分支

**Files:**
- Modify: `cloudfunctions/processImage/index.js`

- [ ] **Step 1：替换 getActiveModel 函数**

将 processImage/index.js 的 getActiveModel 函数替换为（删除 auto 分支）：

```js
async function getActiveModel(category) {
  const res = await db.collection('model_configs')
    .where({ category, is_active: true }).limit(1).get();
  if (res.data.length === 0) throw new Error('没有可用的模型，请联系管理员');
  return res.data[0];
}
```

- [ ] **Step 2：语法检查**

Run: `node --check cloudfunctions/processImage/index.js`

- [ ] **Step 3：Commit**

```bash
git add cloudfunctions/processImage/index.js
git commit -m "refactor: processImage 删除 auto 分类调度分支"
```

---

## 自检清单

### 规格覆盖

| 需求 | 任务 |
|---|---|
| CATEGORIES 删 auto，color→filter | Task 1 |
| SUB_TYPES 新增水彩/赛博/复古/胶片/日系/黑白/暖阳 | Task 1 |
| DEFAULT_PRICES color→filter | Task 1 |
| 毛玻璃通用类 | Task 2 |
| 首页大卡片+小卡片布局 | Task 3 |
| effect-picker 适配 filter + 毛玻璃 | Task 4 |
| image-uploader 毛玻璃 | Task 5 |
| process/preview/history/profile/recharge 毛玻璃 | Task 6-10 |
| 管理后台毛玻璃 | Task 11 |
| initDB 18 条新定价 | Task 12 |
| processImage 删 auto 分支 | Task 13 |

### 占位符

无 TBD/TODO。Task 6-11 的 wxss 具体代码需实现时读取当前文件再替换，spec 里给了样式指引和通用类引用。

### 类型一致性

- `CATEGORIES = ['beautify', 'filter', 'style']`：Task 1 定义，Task 3 使用 ✅
- `DEFAULT_PRICES = { beautify:2, filter:1, style:3 }`：Task 1 定义，effect-picker/preview/downloadImage 使用 ✅
- `getActiveModel(category)`：Task 13 简化签名，processImage 调用处不变 ✅

---

## 执行顺序与依赖

```
Task 1（constants.js）→ Task 3（首页，依赖新分类）
Task 2（app.wxss 通用类）→ Task 3-11（各页面引用通用类）
Task 4 依赖 Task 1（filter key）
Task 12 依赖 Task 1（新子选项 key）
Task 13 独立（删 auto 分支）

推荐顺序：1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13
```
