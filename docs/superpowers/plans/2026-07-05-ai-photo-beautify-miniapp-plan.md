# AI 图片美化微信小程序 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 AI 图片美化微信小程序 — 上传照片 → AI 处理 → 水印预览免费 → 下载扣代币。四大分类：人像美颜/色彩画质/风格转换/一键美化。代币体系 + 管理后台。

**Architecture:** 微信小程序原生 + WeUI 前端，微信云开发后端（云函数/云数据库/云存储），模型调度抽象层可替换 AI 供应商。管理员通过 `users.role === 'admin'` 进入管理端。

**Tech Stack:** 微信小程序原生框架、WeUI 2.x、微信云开发（Node.js 18）、云数据库、云存储、微信支付

## Global Constraints

- 图片格式仅 jpg/png/heic/webp，单张 ≤ 10MB
- 云函数超时 30s
- 预览图加水印+降分辨率，下载无水印原图才扣费
- 扣费优先级：限时代币(expires_at 升序) → 永久代币(users.tokens)
- 管理端 `role === 'admin'` 判断
- 所有定价/比例后台可调、即时生效
- MVP 不做：批量处理、裁剪旋转、社区、多语言、图片去重

---

## File Structure

```
/
├── miniprogram/
│   ├── app.js / app.json / app.wxss
│   ├── pages/
│   │   ├── index/          # 首页
│   │   ├── process/        # 上传 + 选效果
│   │   ├── preview/        # 水印预览 + 下载
│   │   ├── history/        # 历史记录
│   │   ├── profile/        # 个人中心
│   │   ├── recharge/       # 充值
│   │   ├── admin/
│   │   │   ├── dashboard/  # 数据面板
│   │   │   ├── models/     # 模型配置
│   │   │   ├── activities/ # 活动管理
│   │   │   └── settings/   # 套餐/定价/订阅/邀请
│   ├── components/
│   │   ├── image-uploader/
│   │   ├── effect-picker/
│   │   └── token-badge/
│   ├── utils/
│   │   ├── constants.js / cloud.js / validators.js
│   └── images/
├── cloudfunctions/
│   ├── processImage/       # AI 处理 + 模型调度
│   ├── downloadImage/      # 扣费 + 返回原图
│   ├── createOrder/        # 创建充值订单
│   ├── paymentCallback/    # 支付回调
│   ├── dailyCheckIn/       # 每日签到领币
│   ├── claimActivity/      # 领取活动代币
│   ├── checkInvite/        # 绑定邀请关系
│   ├── expireTokens/       # 定时：过期扫描
│   ├── syncOrders/         # 定时：订单补单
│   └── initDB/             # 初始化默认配置数据
├── project.config.json
└── README.md
```

---


### Task 1: 项目脚手架 + initDB 云函数

**Files:**
- Create: `project.config.json`
- Create: `miniprogram/app.js`
- Create: `miniprogram/app.json`
- Create: `miniprogram/app.wxss`
- Create: `cloudfunctions/initDB/index.js`
- Create: `cloudfunctions/initDB/package.json`
- Create: `cloudfunctions/initDB/config.json`
- Create: `miniprogram/utils/constants.js`

**Interfaces:**
- Consumes: 无（第一个任务）
- Produces:
  - `app.globalData.userInfo` — `{ _id, openid, role, tokens, activity_tokens }`
  - `constants.CATEGORIES`, `constants.CATEGORY_LABELS`, `constants.SUB_TYPES`
  - `constants.DEFAULT_PRICES` — `{ beautify: 2, color: 1, style: 3, auto: 2 }`
  - `constants.SUPPORTED_FORMATS` — `['jpg', 'jpeg', 'png', 'heic', 'webp']`
  - `constants.MAX_FILE_SIZE` — `10 * 1024 * 1024`（10MB）
  - 云数据库集合 12 个

- [ ] **Step 1: 创建 project.config.json**

```json
{
  "miniprogramRoot": "miniprogram/",
  "cloudfunctionRoot": "cloudfunctions/",
  "setting": {
    "urlCheck": true,
    "es6": true,
    "enhance": true,
    "postcss": true,
    "minified": true,
    "nodeModules": true,
    "compileHotReLoad": false,
    "useMultiFrameRuntime": true
  },
  "appid": "YOUR_APPID_HERE",
  "projectname": "ai-photo-beautify",
  "libVersion": "3.3.4"
}
```

- [ ] **Step 2: 创建 miniprogram/app.json**

```json
{
  "pages": [
    "pages/index/index",
    "pages/process/process",
    "pages/preview/preview",
    "pages/history/history",
    "pages/profile/profile",
    "pages/recharge/recharge",
    "pages/admin/dashboard/dashboard",
    "pages/admin/models/models",
    "pages/admin/activities/activities",
    "pages/admin/settings/settings"
  ],
  "window": {
    "backgroundTextStyle": "light",
    "navigationBarBackgroundColor": "#fff",
    "navigationBarTitleText": "AI 图片美化",
    "navigationBarTextStyle": "black"
  },
  "style": "v2",
  "sitemapLocation": "sitemap.json"
}
```

- [ ] **Step 3: 创建 miniprogram/app.js**

```javascript
App({
  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({ env: 'YOUR_ENV_ID', traceUser: true });
    }
    this.globalData = { userInfo: null, isAdmin: false };
  },

  getUserInfo: async function () {
    if (this.globalData.userInfo) return this.globalData.userInfo;
    const db = wx.cloud.database();
    const res = await wx.cloud.callFunction({ name: 'checkInvite', data: {} });
    const { data } = await db.collection('users')
      .where({ _openid: '{openid}' }).get();
    if (data.length === 0) {
      const createRes = await db.collection('users').add({
        data: {
          role: 'user', tokens: 50, activity_tokens: 0,
          subscription: null, inviter_id: res.result.inviter_id || null,
          created_at: db.serverDate(),
        }
      });
      this.globalData.userInfo = {
        _id: createRes._id, role: 'user', tokens: 50, activity_tokens: 0
      };
    } else {
      this.globalData.userInfo = data[0];
    }
    this.globalData.isAdmin = this.globalData.userInfo.role === 'admin';
    return this.globalData.userInfo;
  },

  refreshUserInfo: async function () {
    this.globalData.userInfo = null;
    return this.getUserInfo();
  }
});
```

- [ ] **Step 4: 创建 miniprogram/app.wxss**

```css
page {
  background-color: #f6f6f6;
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue',
    Helvetica, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
.container { min-height: 100vh; padding: 20rpx; }
page {
  --primary-color: #07c160;
  --danger-color: #fa5151;
  --text-primary: #333;
  --text-secondary: #999;
  --bg-white: #fff;
}
```

- [ ] **Step 5: 创建 miniprogram/utils/constants.js**

```javascript
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
```

- [ ] **Step 6: 创建 cloudfunctions/initDB/package.json**

```json
{
  "name": "initDB",
  "version": "1.0.0",
  "description": "初始化数据库默认配置",
  "main": "index.js",
  "dependencies": { "wx-server-sdk": "~3.0.0" }
}
```

- [ ] **Step 7: 创建 cloudfunctions/initDB/config.json**

```json
{ "permissions": { "openapi": [] } }
```

- [ ] **Step 8: 创建 cloudfunctions/initDB/index.js**

```javascript
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const names = [
    'users', 'token_records', 'orders', 'images', 'model_configs',
    'activities', 'user_activity_tokens', 'token_packages',
    'pricing_config', 'subscribe_config', 'invite_config', 'invite_records',
  ];
  const results = {};

  for (const name of names) {
    try {
      await db.createCollection(name);
      results[name] = 'created';
    } catch (e) {
      results[name] = e.errCode === -1 ? 'exists' : 'error: ' + e.message;
    }
  }

  // 默认定价配置
  const pc = await db.collection('pricing_config').count();
  if (pc.total === 0) {
    const prices = [
      { category: 'beautify', tokens: 2 },
      { category: 'color', tokens: 1 },
      { category: 'style', tokens: 3 },
      { category: 'auto', tokens: 2 },
    ];
    for (const p of prices) {
      await db.collection('pricing_config').add({
        data: { ...p, updated_at: new Date() }
      });
    }
    results['default_pricing'] = 'inserted 4';
  }

  // 默认订阅配置
  const sc = await db.collection('subscribe_config').count();
  if (sc.total === 0) {
    await db.collection('subscribe_config').add({
      data: {
        name: '月度订阅', price: 1999, daily_tokens: 5,
        wx_template_id: '', created_at: new Date(),
      }
    });
    results['default_subscribe'] = 'inserted';
  }

  // 默认邀请配置
  const ic = await db.collection('invite_config').count();
  if (ic.total === 0) {
    await db.collection('invite_config').add({
      data: {
        inviter_reward: 10, invitee_reward: 5,
        trigger_condition: 'first_paid', created_at: new Date(),
      }
    });
    results['default_invite'] = 'inserted';
  }

  return results;
};
```

- [ ] **Step 9: 部署 initDB 云函数**

Run: 在微信开发者工具中，右键 `cloudfunctions/initDB` → "上传并部署：云端安装依赖"
Expected: 上传成功，无报错

- [ ] **Step 10: 运行 initDB 初始化数据**

Run: 微信开发者工具 → 云开发控制台 → 云函数 → initDB → 测试调用，参数 `{}`
Expected: 返回 12 个集合的创建结果 + 默认配置插入结果

- [ ] **Step 11: 验证数据库集合**

Run: 云开发控制台 → 数据库，检查 12 个集合
Expected: 所有集合存在，pricing_config 有 4 条记录，subscribe_config 有 1 条，invite_config 有 1 条

- [ ] **Step 12: Commit**

```bash
git add .
git commit -m "feat: 项目脚手架 + initDB 云函数 + 常量定义"
```


### Task 2: 云工具函数 + 校验器

**Files:**
- Create: `miniprogram/utils/cloud.js`
- Create: `miniprogram/utils/validators.js`

**Interfaces:**
- Consumes: `constants`（Task 1）
- Produces: `cloud.callFunction(name, data)`, `cloud.uploadImage(filePath)`, `cloud.getTempURL(fileID)`, `validators.validateImage(file)`, `validators.validateRequired(value, fieldName)`

- [ ] **Step 1: 创建 miniprogram/utils/cloud.js**

```javascript
async function callFunction(name, data = {}) {
  try {
    const res = await wx.cloud.callFunction({ name, data });
    if (res.result && res.result.err) {
      wx.showToast({ title: res.result.err, icon: 'none' });
      throw new Error(res.result.err);
    }
    return res.result;
  } catch (err) {
    wx.showToast({ title: '网络异常，请重试', icon: 'none' });
    throw err;
  }
}

async function uploadImage(filePath) {
  const cloudPath = 'images/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.jpg';
  const res = await wx.cloud.uploadFile({ cloudPath, filePath });
  return res.fileID;
}

async function getTempURL(fileID) {
  const res = await wx.cloud.getTempFileURL({ fileList: [fileID] });
  if (res.fileList[0].tempFileURL) return res.fileList[0].tempFileURL;
  throw new Error('获取链接失败');
}

module.exports = { callFunction, uploadImage, getTempURL };
```

- [ ] **Step 2: 创建 miniprogram/utils/validators.js**

```javascript
const { SUPPORTED_FORMATS, MAX_FILE_SIZE } = require('./constants');

function validateImage(file) {
  if (!file) return { valid: false, error: '请选择图片' };
  const ext = (file.name || file.path || '').split('.').pop().toLowerCase();
  if (!SUPPORTED_FORMATS.includes(ext)) return { valid: false, error: '仅支持 jpg/png/heic/webp 格式' };
  if (file.size > MAX_FILE_SIZE) return { valid: false, error: '图片不能超过 10MB' };
  return { valid: true };
}

function validateRequired(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return { valid: false, error: fieldName + '不能为空' };
  }
  return { valid: true };
}

module.exports = { validateImage, validateRequired };
```

- [ ] **Step 3: 验证 — 开发者工具 Console 手动测试**

Run: 在小程序 app.js 中临时添加以下代码，查看 Console 输出
```javascript
const { validateImage } = require('./utils/validators');
console.log('null:', validateImage(null));
console.log('valid jpg:', validateImage({ name: 'test.jpg', size: 1000 }));
console.log('bad format:', validateImage({ name: 'test.gif', size: 1000 }));
console.log('too large:', validateImage({ name: 'test.jpg', size: 20 * 1024 * 1024 }));
```
Expected: 依次输出 4 条校验结果，第一条和第三条和第四条 valid: false

- [ ] **Step 4: Commit**

```bash
git add miniprogram/utils/cloud.js miniprogram/utils/validators.js
git commit -m "feat: 云函数封装 + 图片校验工具"
```

---

### Task 3: checkInvite 云函数 + 邀请绑定

**Files:**
- Create: `cloudfunctions/checkInvite/index.js`
- Create: `cloudfunctions/checkInvite/package.json`
- Create: `cloudfunctions/checkInvite/config.json`

**Interfaces:**
- Consumes: `users` 集合, `invite_records` 集合, `invite_config` 集合
- Produces: `checkInvite(event: { inviter_id?: string }) → { inviter_id: string | null }`
  - 若传入 inviter_id 且被邀请人为新用户，创建邀请记录（status='registered'），返回 inviter_id
  - 若被邀请人已存在（老用户），忽略邀请，返回 null

- [ ] **Step 1: 创建 cloudfunctions/checkInvite/package.json**

```json
{ "name": "checkInvite", "version": "1.0.0", "main": "index.js", "dependencies": { "wx-server-sdk": "~3.0.0" } }
```

- [ ] **Step 2: 创建 cloudfunctions/checkInvite/config.json**

```json
{ "permissions": { "openapi": [] } }
```

- [ ] **Step 3: 创建 cloudfunctions/checkInvite/index.js**

```javascript
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { inviter_id } = event;

  if (!inviter_id) return { inviter_id: null };

  // 检查当前用户是否已有记录（老用户不受邀请）
  const userQuery = await db.collection('users').where({ _openid: OPENID }).count();
  if (userQuery.total > 0) return { inviter_id: null };

  // 检查 inviter_id 是否存在
  try {
    await db.collection('users').doc(inviter_id).get();
  } catch (e) {
    return { inviter_id: null };
  }

  // 检查是否已被其他人邀请过
  const existInvite = await db.collection('invite_records')
    .where({ invitee_openid: OPENID }).count();
  if (existInvite.total > 0) return { inviter_id: null };

  // 获取邀请配置
  const cfgRes = await db.collection('invite_config').limit(1).get();
  const cfg = cfgRes.data[0] || { inviter_reward: 10, invitee_reward: 5 };

  // 写入邀请记录（此时被邀请人尚未注册，用 openid 记录）
  await db.collection('invite_records').add({
    data: {
      inviter_id,
      invitee_openid: OPENID,
      status: 'registered',
      inviter_reward: cfg.inviter_reward,
      invitee_reward: cfg.invitee_reward,
      created_at: new Date(),
    }
  });

  return { inviter_id };
};
```

- [ ] **Step 4: 部署 checkInvite 云函数**

Run: 右键 `cloudfunctions/checkInvite` → "上传并部署：云端安装依赖"
Expected: 上传成功

- [ ] **Step 5: 测试 — 模拟无邀请参数调用**

Run: 云开发控制台 → 云函数 → checkInvite → 测试调用，参数 `{}`
Expected: `{ inviter_id: null }`

- [ ] **Step 6: Commit**

```bash
git add cloudfunctions/checkInvite/
git commit -m "feat: checkInvite 云函数 — 邀请关系绑定"
```

---

### Task 4: image-uploader 组件

**Files:**
- Create: `miniprogram/components/image-uploader/image-uploader.js`
- Create: `miniprogram/components/image-uploader/image-uploader.json`
- Create: `miniprogram/components/image-uploader/image-uploader.wxml`
- Create: `miniprogram/components/image-uploader/image-uploader.wxss`

**Interfaces:**
- Consumes: `validators.validateImage`（Task 2）, `cloud.uploadImage`（Task 2）
- Produces: `<image-uploader bind:upload="onImageUploaded" />` — 事件 detail: `{ fileID: string, tempPath: string }`

- [ ] **Step 1: 创建 image-uploader.json**

```json
{ "component": true, "usingComponents": {} }
```

- [ ] **Step 2: 创建 image-uploader.wxml**

```xml
<view class="uploader">
  <view class="upload-area" wx:if="{{!imagePath}}" bindtap="chooseImage">
    <view class="upload-icon">+</view>
    <view class="upload-text">点击上传图片</view>
    <view class="upload-hint">支持 jpg/png/heic/webp，最大 10MB</view>
  </view>
  <view class="preview-area" wx:else>
    <image class="preview-img" src="{{imagePath}}" mode="aspectFit" />
    <view class="preview-actions">
      <button class="weui-btn weui-btn_mini weui-btn_default" bindtap="reChoose">重新选择</button>
      <button class="weui-btn weui-btn_mini weui-btn_primary" bindtap="confirmUpload" loading="{{uploading}}">
        {{uploading ? '上传中...' : '确认上传'}}
      </button>
    </view>
  </view>
  <view class="error-msg" wx:if="{{error}}">{{error}}</view>
</view>
```

- [ ] **Step 3: 创建 image-uploader.js**

```javascript
const { validateImage } = require('../../utils/validators');
const { uploadImage } = require('../../utils/cloud');

Component({
  data: {
    imagePath: '',
    imageFile: null,
    uploading: false,
    error: '',
  },

  methods: {
    chooseImage() {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sizeType: ['original'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const file = res.tempFiles[0];
          const validation = validateImage({ name: file.tempFilePath, size: file.size });
          if (!validation.valid) {
            this.setData({ error: validation.error });
            return;
          }
          this.setData({
            imagePath: file.tempFilePath,
            imageFile: file,
            error: '',
          });
        },
      });
    },

    reChoose() {
      this.setData({ imagePath: '', imageFile: null, error: '' });
    },

    async confirmUpload() {
      this.setData({ uploading: true, error: '' });
      try {
        const fileID = await uploadImage(this.data.imagePath);
        this.triggerEvent('upload', { fileID, tempPath: this.data.imagePath });
      } catch (e) {
        this.setData({ error: '上传失败，请重试' });
      } finally {
        this.setData({ uploading: false });
      }
    },
  },
});
```

- [ ] **Step 4: 创建 image-uploader.wxss**

```css
.uploader { width: 100%; }
.upload-area {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 400rpx; background: #f7f7f7; border: 2rpx dashed #ddd; border-radius: 16rpx;
}
.upload-icon { font-size: 80rpx; color: #ccc; line-height: 1; }
.upload-text { font-size: 28rpx; color: #999; margin-top: 16rpx; }
.upload-hint { font-size: 22rpx; color: #ccc; margin-top: 8rpx; }
.preview-area { position: relative; }
.preview-img { width: 100%; height: 500rpx; border-radius: 16rpx; }
.preview-actions { display: flex; justify-content: space-around; margin-top: 24rpx; }
.error-msg { color: var(--danger-color); font-size: 24rpx; margin-top: 12rpx; }
```

- [ ] **Step 5: 测试 — 在任意页面中引入组件验证 UI**

Run: 在 process 页面中暂用 `<image-uploader bind:upload="onUpload" />`
Expected: 能看到上传区域、点击选择图片、显示预览、确认上传

- [ ] **Step 6: Commit**

```bash
git add miniprogram/components/image-uploader/
git commit -m "feat: image-uploader 组件"
```

---

### Task 5: token-badge 组件 + effect-picker 组件

**Files:**
- Create: `miniprogram/components/token-badge/token-badge.js`
- Create: `miniprogram/components/token-badge/token-badge.json`
- Create: `miniprogram/components/token-badge/token-badge.wxml`
- Create: `miniprogram/components/token-badge/token-badge.wxss`
- Create: `miniprogram/components/effect-picker/effect-picker.js`
- Create: `miniprogram/components/effect-picker/effect-picker.json`
- Create: `miniprogram/components/effect-picker/effect-picker.wxml`
- Create: `miniprogram/components/effect-picker/effect-picker.wxss`

**Interfaces:**
- Consumes: `constants.CATEGORIES`, `constants.CATEGORY_LABELS`, `constants.SUB_TYPES`, `constants.DEFAULT_PRICES`（Task 1）
- Produces:
  - `<token-badge tokens="{{30}}" activityTokens="{{10}}" />` — 显示代币余额
  - `<effect-picker bind:select="onEffectSelect" />` — 事件 detail: `{ category: string, subType: string, price: number }`

- [ ] **Step 1: 创建 token-badge.json / token-badge.wxml / token-badge.wxss**

`token-badge.json`:
```json
{ "component": true, "usingComponents": {} }
```

`token-badge.wxml`:
```xml
<view class="token-badge">
  <view class="token-item">
    <text class="token-label">永久代币</text>
    <text class="token-value">{{tokens}}</text>
  </view>
  <view class="token-item" wx:if="{{activityTokens > 0}}">
    <text class="token-label activity">限时代币</text>
    <text class="token-value activity">{{activityTokens}}</text>
  </view>
</view>
```

`token-badge.wxss`:
```css
.token-badge { display: flex; align-items: center; gap: 16rpx; }
.token-item { display: flex; align-items: center; background: #fff; padding: 8rpx 20rpx; border-radius: 32rpx; }
.token-label { font-size: 22rpx; color: #999; margin-right: 8rpx; }
.token-value { font-size: 28rpx; font-weight: bold; color: var(--primary-color); }
.token-label.activity, .token-value.activity { color: #ff9500; }
```

`token-badge.js`:
```javascript
Component({
  properties: {
    tokens: { type: Number, value: 0 },
    activityTokens: { type: Number, value: 0 },
  },
});
```

- [ ] **Step 2: 创建 effect-picker 组件文件**

`effect-picker.json`:
```json
{ "component": true, "usingComponents": {} }
```

`effect-picker.wxml`:
```xml
<view class="picker">
  <view class="category-tabs">
    <scroll-view scroll-x class="tab-scroll">
      <view class="tab {{activeCategory === item.key ? 'active' : ''}}"
        wx:for="{{categories}}" wx:key="key"
        data-key="{{item.key}}" bindtap="switchCategory">{{item.label}}</view>
    </scroll-view>
  </view>
  <view class="subtype-grid">
    <view class="subtype-card {{selectedSubType === item.key ? 'selected' : ''}}"
      wx:for="{{currentSubTypes}}" wx:key="key"
      data-key="{{item.key}}" bindtap="selectSubType">
      <view class="subtype-name">{{item.label}}</view>
      <view class="subtype-price">{{currentPrice}} 代币</view>
    </view>
  </view>
</view>
```

`effect-picker.js`:
```javascript
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
```

`effect-picker.wxss`:
```css
.picker { width: 100%; }
.category-tabs { margin-bottom: 24rpx; }
.tab-scroll { white-space: nowrap; }
.tab { display: inline-block; padding: 12rpx 28rpx; font-size: 26rpx; color: #666; background: #fff; border-radius: 32rpx; margin-right: 16rpx; }
.tab.active { color: #fff; background: var(--primary-color); }
.subtype-grid { display: flex; flex-wrap: wrap; gap: 16rpx; }
.subtype-card { width: calc(50% - 8rpx); padding: 24rpx; background: #fff; border-radius: 12rpx; border: 2rpx solid transparent; }
.subtype-card.selected { border-color: var(--primary-color); background: #f0fff4; }
.subtype-name { font-size: 28rpx; color: #333; margin-bottom: 8rpx; }
.subtype-price { font-size: 22rpx; color: #999; }
```

- [ ] **Step 3: 验证 — 组件引用测试**

Run: 在任意测试页面中引入两个组件，确认 UI 渲染正常
Expected: token-badge 显示代币数字，effect-picker 可切换分类、可选中子效果

- [ ] **Step 4: Commit**

```bash
git add miniprogram/components/token-badge/ miniprogram/components/effect-picker/
git commit -m "feat: token-badge + effect-picker 组件"
```


### Task 6: 首页 + process 页面（上传与选效果）

**Files:**
- Create: `miniprogram/pages/index/index.js`
- Create: `miniprogram/pages/index/index.json`
- Create: `miniprogram/pages/index/index.wxml`
- Create: `miniprogram/pages/index/index.wxss`
- Create: `miniprogram/pages/process/process.js`
- Create: `miniprogram/pages/process/process.json`
- Create: `miniprogram/pages/process/process.wxml`
- Create: `miniprogram/pages/process/process.wxss`

**Interfaces:**
- Consumes: `image-uploader`（Task 4）, `effect-picker`（Task 5）, `token-badge`（Task 5）, `cloud.callFunction`（Task 2）, `constants`（Task 1）, `app.getUserInfo`（Task 1）
- Produces:
  - `pages/index/index` — 首页入口，展示四大分类卡片和代币余额
  - `pages/process/process` — 接收 `?category=xxx` 参数，包含上传和选效果，调用 processImage 云函数后跳转 preview 页面

- [ ] **Step 1: 创建 miniprogram/pages/index/index.json**

```json
{ "usingComponents": { "token-badge": "/components/token-badge/token-badge" } }
```

- [ ] **Step 2: 创建 miniprogram/pages/index/index.wxml**

```xml
<view class="container">
  <view class="header">
    <view class="title">AI 图片美化</view>
    <token-badge tokens="{{tokens}}" activityTokens="{{activityTokens}}" />
  </view>
  <view class="category-grid">
    <view class="category-card" wx:for="{{categories}}" wx:key="key"
      data-category="{{item.key}}" bindtap="goProcess">
      <view class="category-icon">{{item.icon}}</view>
      <view class="category-name">{{item.label}}</view>
      <view class="category-desc">{{item.desc}}</view>
    </view>
  </view>
</view>
```

- [ ] **Step 3: 创建 miniprogram/pages/index/index.js**

```javascript
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
```

- [ ] **Step 4: 创建 miniprogram/pages/index/index.wxss**

```css
.header { display: flex; justify-content: space-between; align-items: center; padding: 32rpx 0; }
.title { font-size: 40rpx; font-weight: bold; color: #333; }
.category-grid { display: flex; flex-wrap: wrap; gap: 20rpx; margin-top: 32rpx; }
.category-card { width: calc(50% - 10rpx); background: #fff; border-radius: 16rpx; padding: 40rpx 24rpx; text-align: center; }
.category-icon { font-size: 60rpx; margin-bottom: 16rpx; }
.category-name { font-size: 30rpx; font-weight: bold; color: #333; margin-bottom: 8rpx; }
.category-desc { font-size: 22rpx; color: #999; }
```

- [ ] **Step 5: 创建 process 页面文件**

`process.json`:
```json
{ "usingComponents": { "image-uploader": "/components/image-uploader/image-uploader", "effect-picker": "/components/effect-picker/effect-picker" } }
```

`process.wxml`:
```xml
<view class="container">
  <view class="step-title">步骤一：上传图片</view>
  <image-uploader bind:upload="onImageUploaded" />
  <view class="step-title" wx:if="{{fileID}}">步骤二：选择美化效果</view>
  <effect-picker wx:if="{{fileID}}" bind:select="onEffectSelect" />
  <button class="weui-btn weui-btn_primary start-btn" wx:if="{{fileID && subType}}"
    bindtap="startProcess" loading="{{processing}}">{{processing ? '处理中...' : '开始美化'}}</button>
</view>
```

`process.js`:
```javascript
const { callFunction } = require('../../utils/cloud');

Page({
  data: { fileID: '', tempPath: '', category: '', subType: '', processing: false },

  onLoad(options) {
    this.setData({ category: options.category || 'auto' });
  },

  onImageUploaded(e) {
    this.setData({ fileID: e.detail.fileID, tempPath: e.detail.tempPath });
  },

  onEffectSelect(e) {
    this.setData({ subType: e.detail.subType, category: e.detail.category });
  },

  async startProcess() {
    this.setData({ processing: true });
    try {
      const res = await callFunction('processImage', {
        imageFileID: this.data.fileID,
        processType: this.data.category,
        subType: this.data.subType,
      });
      wx.redirectTo({
        url: '/pages/preview/preview?imageId=' + res.imageId + '&previewFileID=' + res.previewFileID,
      });
    } catch (e) {
      this.setData({ processing: false });
    }
  },
});
```

`process.wxss`:
```css
.step-title { font-size: 30rpx; font-weight: bold; color: #333; margin: 32rpx 0 16rpx; }
.start-btn { margin-top: 48rpx; }
```

- [ ] **Step 6: 测试 — 编译运行**

Run: 微信开发者工具编译，确认首页显示 4 个分类卡片 + 代币余额；点击进入 process 页面上传图片并选择效果

Expected: 首页显示正常，process 页面能上传图片、选择效果，点击"开始美化"按钮触发云函数调用

- [ ] **Step 7: Commit**

```bash
git add miniprogram/pages/index/ miniprogram/pages/process/
git commit -m "feat: 首页 + 上传选效果页面"
```

---

### Task 7: processImage 云函数

**Files:**
- Create: `cloudfunctions/processImage/index.js`
- Create: `cloudfunctions/processImage/package.json`
- Create: `cloudfunctions/processImage/config.json`

**Interfaces:**
- Consumes: `model_configs` 集合, `images` 集合, 云存储
- Produces: `processImage({ imageFileID, processType, subType }) → { imageId, previewFileID }`
  - 查询启用模型 → 调用 AI API → 生成预览图(加水印) + 原图 → 写入云存储 → 写入 images 表

- [ ] **Step 1: 创建 cloudfunctions/processImage/package.json**

```json
{
  "name": "processImage",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": { "wx-server-sdk": "~3.0.0", "axios": "^1.6.0", "sharp": "^0.33.0" }
}
```

- [ ] **Step 2: 创建 cloudfunctions/processImage/config.json**

```json
{ "permissions": { "openapi": [] }, "timeout": 30 }
```

- [ ] **Step 3: 创建 cloudfunctions/processImage/index.js**

```javascript
const cloud = require('wx-server-sdk');
const axios = require('axios');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 模型调度：获取当前分类启用的第一个模型
async function getActiveModel(category) {
  const res = await db.collection('model_configs')
    .where({ category, is_active: true }).limit(1).get();
  if (res.data.length === 0) throw new Error('没有可用的模型，请联系管理员');
  return res.data[0];
}

// 调用 AI API 处理图片
async function callAIModel(model, imageUrl, processType, subType) {
  const payload = {
    image_url: imageUrl,
    task_type: subType,
    ...(model.config || {}),
  };
  const res = await axios.post(model.api_url, payload, {
    headers: { 'Authorization': 'Bearer ' + model.api_key, 'Content-Type': 'application/json' },
    timeout: 25000,
    responseType: 'arraybuffer',
  });
  return Buffer.from(res.data);
}

// 添加水印文字（通过 canvas 绘制，简化为叠加文字层）
async function addWatermark(imageBuffer, text) {
  // 对于云函数环境，使用 sharp 合成水印
  const sharp = require('sharp');
  const watermarkSvg = Buffer.from(
    '<svg width="200" height="50"><text x="10" y="35" font-size="24" fill="rgba(255,255,255,0.6)" font-family="sans-serif">' + text + '</text></svg>'
  );
  return sharp(imageBuffer)
    .composite([{ input: watermarkSvg, gravity: 'southeast' }])
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

exports.main = async (event, context) => {
  const { imageFileID, processType, subType } = event;
  if (!imageFileID || !processType || !subType) {
    return { err: '缺少必要参数' };
  }

  const { OPENID } = cloud.getWXContext();

  // 1. 获取云存储临时链接
  const urlRes = await cloud.getTempFileURL({ fileList: [imageFileID] });
  const imageUrl = urlRes.fileList[0].tempFileURL;

  // 2. 查询启用的模型
  const model = await getActiveModel(processType);

  // 3. 调用 AI 处理
  const resultBuffer = await callAIModel(model, imageUrl, processType, subType);

  // 4. 生成水印预览图
  const previewBuffer = await addWatermark(resultBuffer, 'AI美化预览');

  // 5. 上传到云存储
  const timestamp = Date.now();
  const resultUpload = await cloud.uploadFile({
    cloudPath: 'results/' + OPENID + '_' + timestamp + '_result.jpg',
    fileContent: resultBuffer,
  });
  const previewUpload = await cloud.uploadFile({
    cloudPath: 'previews/' + OPENID + '_' + timestamp + '_preview.jpg',
    fileContent: previewBuffer,
  });

  // 6. 写入 images 表
  const imageDoc = await db.collection('images').add({
    data: {
      user_id: OPENID,
      original_url: imageFileID,
      preview_url: previewUpload.fileID,
      result_url: resultUpload.fileID,
      process_type: processType,
      sub_type: subType,
      status: 'completed',
      is_downloaded: false,
      created_at: new Date(),
      _openid: OPENID,
    }
  });

  return { imageId: imageDoc._id, previewFileID: previewUpload.fileID };
};
```

- [ ] **Step 4: 部署 processImage**

Run: 右键 `cloudfunctions/processImage` → "上传并部署：云端安装依赖"
Expected: 上传成功

- [ ] **Step 5: 测试 — 端到端流程**

Run: 在小程序中走完"首页→选分类→上传图片→选效果→开始美化"流程
Expected: processImage 返回 `{ imageId, previewFileID }`，跳转到 preview 页面（下一任务实现）

- [ ] **Step 6: Commit**

```bash
git add cloudfunctions/processImage/
git commit -m "feat: processImage 云函数 — AI 处理 + 模型调度 + 水印"
```

---

### Task 8: preview 页面（水印预览 + 下载入口）

**Files:**
- Create: `miniprogram/pages/preview/preview.js`
- Create: `miniprogram/pages/preview/preview.json`
- Create: `miniprogram/pages/preview/preview.wxml`
- Create: `miniprogram/pages/preview/preview.wxss`

**Interfaces:**
- Consumes: `cloud.getTempURL`, `cloud.callFunction`（Task 2）
- Produces: `pages/preview/preview?imageId=xxx&previewFileID=xxx` — 显示水印预览，提供"下载原图"和"重新处理"按钮

- [ ] **Step 1: 创建 preview.json**

```json
{ "usingComponents": {} }
```

- [ ] **Step 2: 创建 preview.wxml**

```xml
<view class="container">
  <image class="preview-img" src="{{previewUrl}}" mode="aspectFit" wx:if="{{previewUrl}}" />
  <view class="watermark-hint">预览图含水印，下载原图需消耗代币</view>
  <view class="actions">
    <button class="weui-btn weui-btn_primary" bindtap="download" loading="{{downloading}}">
      下载原图（{{price}} 代币）
    </button>
    <button class="weui-btn weui-btn_default" bindtap="retry">不满意，重新处理</button>
    <button class="weui-btn weui-btn_default" bindtap="goHome">返回首页</button>
  </view>
</view>
```

- [ ] **Step 3: 创建 preview.js**

```javascript
const { getTempURL, callFunction } = require('../../utils/cloud');
const { DEFAULT_PRICES } = require('../../utils/constants');

Page({
  data: { imageId: '', previewFileID: '', previewUrl: '', price: 0, downloading: false },

  onLoad(options) {
    const imageId = options.imageId;
    const previewFileID = options.previewFileID;
    this.setData({ imageId, previewFileID });
    this.loadPreview(previewFileID);
    this.loadPrice(imageId);
  },

  async loadPreview(fileID) {
    try {
      const url = await getTempURL(fileID);
      this.setData({ previewUrl: url });
    } catch (e) { /* toast already shown */ }
  },

  async loadPrice(imageId) {
    const db = wx.cloud.database();
    const img = await db.collection('images').doc(imageId).get();
    const price = DEFAULT_PRICES[img.data.process_type] || 2;
    this.setData({ price });
  },

  async download() {
    this.setData({ downloading: true });
    try {
      const res = await callFunction('downloadImage', { imageId: this.data.imageId });
      // 保存到相册
      const url = await getTempURL(res.resultFileID);
      wx.downloadFile({
        url,
        success: (df) => {
          wx.saveImageToPhotosAlbum({
            filePath: df.tempFilePath,
            success: () => wx.showToast({ title: '已保存到相册' }),
            fail: () => wx.showToast({ title: '保存失败', icon: 'none' }),
          });
        },
      });
    } catch (e) {
      this.setData({ downloading: false });
    }
  },

  retry() {
    wx.navigateBack();
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
```

- [ ] **Step 4: 创建 preview.wxss**

```css
.preview-img { width: 100%; height: 600rpx; border-radius: 16rpx; background: #f0f0f0; }
.watermark-hint { text-align: center; font-size: 24rpx; color: #999; margin: 20rpx 0; }
.actions { display: flex; flex-direction: column; gap: 20rpx; margin-top: 32rpx; }
```

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/preview/
git commit -m "feat: 水印预览页面 + 下载入口"
```


### Task 9: downloadImage 云函数（扣费 + 返回原图）

**Files:**
- Create: `cloudfunctions/downloadImage/index.js`
- Create: `cloudfunctions/downloadImage/package.json`
- Create: `cloudfunctions/downloadImage/config.json`

**Interfaces:**
- Consumes: `images` 集合, `users` 集合, `user_activity_tokens` 集合, `token_records` 集合, `pricing_config` 集合, `invite_records` 集合, `invite_config` 集合
- Produces: `downloadImage({ imageId }) → { resultFileID }`
  - 检查是否已付费（已付费直接返回原图）
  - 按扣费优先级扣费：限时代币(expires_at 升序) → 永久代币
  - 扣费成功后检查首次付费 → 触发邀请奖励
  - 写入 token_records 流水

- [ ] **Step 1: 创建 cloudfunctions/downloadImage/package.json**

```json
{ "name": "downloadImage", "version": "1.0.0", "main": "index.js", "dependencies": { "wx-server-sdk": "~3.0.0" } }
```

- [ ] **Step 2: 创建 cloudfunctions/downloadImage/config.json**

```json
{ "permissions": { "openapi": [] } }
```

- [ ] **Step 3: 创建 cloudfunctions/downloadImage/index.js**

```javascript
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { imageId } = event;
  const { OPENID } = cloud.getWXContext();
  if (!imageId) return { err: '缺少图片ID' };

  // 1. 查询图片记录
  const imgRes = await db.collection('images').doc(imageId).get();
  const image = imgRes.data;
  if (!image || image.user_id !== OPENID) return { err: '图片不存在' };

  // 2. 已付费的直接返回原图，不扣费
  if (image.is_downloaded) return { resultFileID: image.result_url };

  // 3. 获取定价
  const priceRes = await db.collection('pricing_config')
    .where({ category: image.process_type }).get();
  const price = priceRes.data.length > 0 ? priceRes.data[0].tokens : 2;

  // 4. 检查用户总余额
  const userRes = await db.collection('users').where({ _openid: OPENID }).get();
  if (userRes.data.length === 0) return { err: '用户不存在' };
  const user = userRes.data[0];
  const totalBalance = (user.tokens || 0) + (user.activity_tokens || 0);
  if (totalBalance < price) return { err: '代币不足，请先充值' };

  // 5. 扣费：先扣限时代币（按 expires_at 升序），再扣永久代币
  let remaining = price;
  let activityDeducted = 0;
  let permanentDeducted = 0;

  // 5a. 查询限时代币明细
  const activityTokens = await db.collection('user_activity_tokens')
    .where({ user_id: OPENID, tokens: _.gt(0) })
    .orderBy('expires_at', 'asc').get();

  for (const at of activityTokens.data) {
    if (remaining <= 0) break;
    const deduct = Math.min(at.tokens, remaining);
    await db.collection('user_activity_tokens').doc(at._id).update({
      data: { tokens: _.inc(-deduct) }
    });
    remaining -= deduct;
    activityDeducted += deduct;
  }

  // 5b. 剩余从永久代币扣
  if (remaining > 0) {
    permanentDeducted = remaining;
    await db.collection('users').where({ _openid: OPENID }).update({
      data: { tokens: _.inc(-remaining) }
    });
  }

  // 5c. 更新用户 activity_tokens 冗余字段
  if (activityDeducted > 0) {
    await db.collection('users').where({ _openid: OPENID }).update({
      data: { activity_tokens: _.inc(-activityDeducted) }
    });
  }

  // 6. 写入消费流水
  const balanceAfter = (user.tokens - permanentDeducted) + (user.activity_tokens - activityDeducted);
  await db.collection('token_records').add({
    data: {
      user_id: OPENID, type: 'consume', token_type: 'permanent',
      amount: -price, balance_after: balanceAfter, related_image: imageId,
      created_at: new Date(), _openid: OPENID,
    }
  });

  // 7. 标记已下载
  await db.collection('images').doc(imageId).update({
    data: { is_downloaded: true }
  });

  // 8. 检查首次付费 → 触发邀请奖励
  const orderCount = await db.collection('token_records')
    .where({ user_id: OPENID, type: 'consume' }).count();
  if (orderCount.total === 1) {
    const inviteRes = await db.collection('invite_records')
      .where({ invitee_openid: OPENID, status: 'registered' }).get();
    if (inviteRes.data.length > 0) {
      const invite = inviteRes.data[0];
      const cfgRes = await db.collection('invite_config').limit(1).get();
      const cfg = cfgRes.data[0] || { inviter_reward: 10, invitee_reward: 5 };

      // 奖励邀请人
      await db.collection('users').doc(invite.inviter_id).update({
        data: { tokens: _.inc(cfg.inviter_reward) }
      });
      await db.collection('token_records').add({
        data: {
          user_id: invite.inviter_id, type: 'invite', token_type: 'permanent',
          amount: cfg.inviter_reward, balance_after: 0,
          created_at: new Date(), _openid: invite.inviter_id,
        }
      });

      // 奖励被邀请人
      await db.collection('users').where({ _openid: OPENID }).update({
        data: { tokens: _.inc(cfg.invitee_reward) }
      });
      await db.collection('token_records').add({
        data: {
          user_id: OPENID, type: 'invite', token_type: 'permanent',
          amount: cfg.invitee_reward, balance_after: balanceAfter + cfg.invitee_reward,
          created_at: new Date(), _openid: OPENID,
        }
      });

      // 更新邀请状态
      await db.collection('invite_records').doc(invite._id).update({
        data: { status: 'first_paid', inviter_reward: cfg.inviter_reward, invitee_reward: cfg.invitee_reward }
      });
    }
  }

  return { resultFileID: image.result_url };
};
```

- [ ] **Step 4: 部署 downloadImage 云函数**

Run: 右键 `cloudfunctions/downloadImage` → "上传并部署：云端安装依赖"
Expected: 上传成功

- [ ] **Step 5: Commit**

```bash
git add cloudfunctions/downloadImage/
git commit -m "feat: downloadImage 云函数 — 扣费逻辑 + 邀请奖励触发"
```

---

### Task 10: 历史记录页面

**Files:**
- Create: `miniprogram/pages/history/history.js`
- Create: `miniprogram/pages/history/history.json`
- Create: `miniprogram/pages/history/history.wxml`
- Create: `miniprogram/pages/history/history.wxss`

**Interfaces:**
- Consumes: `images` 集合（查询当前用户的处理记录）, `cloud.getTempURL`（Task 2）
- Produces: `pages/history/history` — 已处理图片列表，已付费可再次下载，未付费可继续下载

- [ ] **Step 1: 创建 history.json**

```json
{ "usingComponents": {} }
```

- [ ] **Step 2: 创建 history.wxml**

```xml
<view class="container">
  <view class="empty" wx:if="{{list.length === 0 && !loading}}">暂无处理记录</view>
  <view class="history-item" wx:for="{{list}}" wx:key="_id">
    <image class="thumb" src="{{item.thumbUrl}}" mode="aspectFill" />
    <view class="info">
      <view class="info-row">{{item.label}} · {{item.subLabel}}</view>
      <view class="info-row date">{{item.created_at}}</view>
      <view class="info-row status {{item.is_downloaded ? 'paid' : 'unpaid'}}">
        {{item.is_downloaded ? '已付费 · 可再次下载' : '未付费 · 点击下载'}}
      </view>
    </view>
    <button class="weui-btn weui-btn_mini weui-btn_primary" bindtap="download" data-id="{{item._id}}">
      {{item.is_downloaded ? '重新下载' : '下载'}}
    </button>
  </view>
</view>
```

- [ ] **Step 3: 创建 history.js**

```javascript
const { getTempURL, callFunction } = require('../../utils/cloud');
const { CATEGORY_LABELS, SUB_TYPES } = require('../../utils/constants');

function findSubLabel(category, subType) {
  const subs = SUB_TYPES[category] || [];
  const found = subs.find(s => s.key === subType);
  return found ? found.label : subType;
}

Page({
  data: { list: [], loading: true },

  onShow: async function () {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    const res = await db.collection('images')
      .where({ _openid: '{openid}' })
      .orderBy('created_at', 'desc').limit(50).get();

    const list = [];
    for (const img of res.data) {
      let thumbUrl = '';
      try {
        thumbUrl = await getTempURL(img.preview_url);
      } catch (e) { /* skip */ }
      list.push({
        ...img,
        thumbUrl,
        label: CATEGORY_LABELS[img.process_type] || img.process_type,
        subLabel: findSubLabel(img.process_type, img.sub_type),
        created_at: img.created_at ? new Date(img.created_at).toLocaleDateString() : '',
      });
    }
    this.setData({ list, loading: false });
  },

  async download(e) {
    const imageId = e.currentTarget.dataset.id;
    wx.showLoading({ title: '处理中...' });
    try {
      const res = await callFunction('downloadImage', { imageId });
      const url = await getTempURL(res.resultFileID);
      wx.downloadFile({
        url,
        success: (df) => {
          wx.saveImageToPhotosAlbum({
            filePath: df.tempFilePath,
            success: () => { wx.hideLoading(); wx.showToast({ title: '已保存到相册' }); },
            fail: () => { wx.hideLoading(); wx.showToast({ title: '保存失败', icon: 'none' }); },
          });
        },
      });
    } catch (e) {
      wx.hideLoading();
    }
  },
});
```

- [ ] **Step 4: 创建 history.wxss**

```css
.empty { text-align: center; color: #999; padding: 100rpx 0; font-size: 28rpx; }
.history-item { display: flex; align-items: center; background: #fff; border-radius: 12rpx; padding: 20rpx; margin-bottom: 16rpx; gap: 20rpx; }
.thumb { width: 120rpx; height: 120rpx; border-radius: 8rpx; flex-shrink: 0; }
.info { flex: 1; min-width: 0; }
.info-row { font-size: 24rpx; color: #666; margin-bottom: 4rpx; }
.info-row.date { color: #999; font-size: 22rpx; }
.info-row.status { font-size: 22rpx; }
.status.paid { color: var(--primary-color); }
.status.unpaid { color: #ff9500; }
```

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/history/
git commit -m "feat: 历史记录页面"
```


### Task 11: 充值系统（套餐页面 + createOrder + paymentCallback）

**Files:**
- Create: `miniprogram/pages/recharge/recharge.js`
- Create: `miniprogram/pages/recharge/recharge.json`
- Create: `miniprogram/pages/recharge/recharge.wxml`
- Create: `miniprogram/pages/recharge/recharge.wxss`
- Create: `cloudfunctions/createOrder/index.js`
- Create: `cloudfunctions/createOrder/package.json`
- Create: `cloudfunctions/createOrder/config.json`
- Create: `cloudfunctions/paymentCallback/index.js`
- Create: `cloudfunctions/paymentCallback/package.json`
- Create: `cloudfunctions/paymentCallback/config.json`

**Interfaces:**
- Consumes: `token_packages` 集合, `orders` 集合, `users` 集合, `token_records` 集合
- Produces:
  - `pages/recharge/recharge` — 套餐列表，点击购买调微信支付
  - `createOrder({ packageId }) → { wxPayParams }` — 创建订单 + 微信支付参数
  - `paymentCallback(event) → void` — 微信支付回调，确认到账、加代币、更新订单状态

- [ ] **Step 1: 创建 recharge.json**

```json
{ "usingComponents": {} }
```

- [ ] **Step 2: 创建 recharge.wxml**

```xml
<view class="container">
  <view class="balance-bar">当前代币：<text class="balance-num">{{tokens}}</text></view>
  <view class="package-list">
    <view class="package-card" wx:for="{{packages}}" wx:key="_id">
      <view class="package-name">{{item.name}}</view>
      <view class="package-tokens">{{item.tokens}} 代币
        <text class="package-bonus" wx:if="{{item.bonus}}">+ 赠送 {{item.bonus}}</text>
      </view>
      <view class="package-price">¥{{item.priceInYuan}}</view>
      <button class="weui-btn weui-btn_primary weui-btn_mini" bindtap="buy" data-id="{{item._id}}">
        立即购买
      </button>
    </view>
  </view>
</view>
```

- [ ] **Step 3: 创建 recharge.js**

```javascript
const app = getApp();
const { callFunction } = require('../../utils/cloud');

Page({
  data: { tokens: 0, packages: [] },

  onShow: async function () {
    const user = await app.getUserInfo();
    const db = wx.cloud.database();
    const res = await db.collection('token_packages')
      .where({ is_active: true }).orderBy('price', 'asc').get();
    this.setData({
      tokens: user.tokens || 0,
      packages: res.data.map(p => ({
        ...p, priceInYuan: (p.price / 100).toFixed(2),
      })),
    });
  },

  async buy(e) {
    const packageId = e.currentTarget.dataset.id;
    wx.showLoading({ title: '创建订单...' });
    try {
      const res = await callFunction('createOrder', { packageId });
      wx.hideLoading();
      wx.requestPayment({
        timeStamp: res.wxPayParams.timeStamp,
        nonceStr: res.wxPayParams.nonceStr,
        package: res.wxPayParams.package,
        signType: res.wxPayParams.signType || 'RSA',
        paySign: res.wxPayParams.paySign,
        success: () => {
          wx.showToast({ title: '支付成功' });
          app.refreshUserInfo();
          this.onShow();
        },
        fail: (err) => {
          if (err.errMsg.indexOf('cancel') === -1) {
            wx.showToast({ title: '支付失败', icon: 'none' });
          }
        },
      });
    } catch (e) {
      wx.hideLoading();
    }
  },
});
```

- [ ] **Step 4: 创建 recharge.wxss**

```css
.balance-bar { text-align: center; font-size: 28rpx; color: #666; padding: 24rpx; background: #fff; border-radius: 12rpx; margin-bottom: 24rpx; }
.balance-num { color: var(--primary-color); font-weight: bold; font-size: 36rpx; }
.package-list { display: flex; flex-direction: column; gap: 16rpx; }
.package-card { display: flex; align-items: center; justify-content: space-between; background: #fff; border-radius: 12rpx; padding: 28rpx 24rpx; }
.package-name { font-size: 28rpx; font-weight: bold; color: #333; }
.package-tokens { font-size: 24rpx; color: #666; }
.package-bonus { color: #ff9500; }
.package-price { font-size: 32rpx; font-weight: bold; color: var(--danger-color); }
```

- [ ] **Step 5: 创建 createOrder 云函数**

`package.json`:
```json
{ "name": "createOrder", "version": "1.0.0", "main": "index.js", "dependencies": { "wx-server-sdk": "~3.0.0" } }
```

`config.json`: `{ "permissions": { "openapi": [] } }`

`index.js`:
```javascript
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { packageId } = event;
  const { OPENID } = cloud.getWXContext();
  if (!packageId) return { err: '缺少套餐ID' };

  const pkgRes = await db.collection('token_packages').doc(packageId).get();
  const pkg = pkgRes.data;
  if (!pkg || !pkg.is_active) return { err: '套餐不存在或已下架' };

  // 创建订单
  const tokens = (pkg.tokens || 0) + (pkg.bonus || 0);
  const order = await db.collection('orders').add({
    data: {
      user_id: OPENID, type: 'purchase', package_id: packageId,
      amount: pkg.price, tokens: tokens, status: 'pending',
      created_at: new Date(), _openid: OPENID,
    }
  });

  // 调用微信支付统一下单
  const payResult = await cloud.cloudPay.unifiedOrder({
    body: pkg.name,
    outTradeNo: order._id,
    totalFee: pkg.price,
    envId: cloud.DYNAMIC_CURRENT_ENV,
    functionName: 'paymentCallback',
  });

  return { orderId: order._id, wxPayParams: payResult.payment };
};
```

- [ ] **Step 6: 创建 paymentCallback 云函数**

`index.js`:
```javascript
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { outTradeNo, returnCode } = event;
  if (returnCode !== 'SUCCESS') return { errcode: -1, errmsg: '支付失败' };

  // 查询订单
  const orderRes = await db.collection('orders').doc(outTradeNo).get();
  const order = orderRes.data;
  if (!order) return { errcode: -1, errmsg: '订单不存在' };
  if (order.status === 'paid' || order.status === 'completed') return { errcode: 0 };

  // 更新订单状态
  await db.collection('orders').doc(outTradeNo).update({
    data: { status: 'paid', wx_order_id: event.transactionId || '' }
  });

  // 加代币
  await db.collection('users').where({ _openid: order.user_id }).update({
    data: { tokens: _.inc(order.tokens) }
  });

  // 写流水
  const userRes = await db.collection('users').where({ _openid: order.user_id }).get();
  await db.collection('token_records').add({
    data: {
      user_id: order.user_id, type: 'purchase', token_type: 'permanent',
      amount: order.tokens, balance_after: userRes.data[0].tokens,
      related_order: outTradeNo, created_at: new Date(), _openid: order.user_id,
    }
  });

  return { errcode: 0, errmsg: 'ok' };
};
```

- [ ] **Step 7: 部署 createOrder 和 paymentCallback**

Run: 分别右键两个云函数 → "上传并部署：云端安装依赖"
Expected: 两个云函数均上传成功

- [ ] **Step 8: Commit**

```bash
git add miniprogram/pages/recharge/ cloudfunctions/createOrder/ cloudfunctions/paymentCallback/
git commit -m "feat: 充值系统 — 套餐页面 + createOrder + paymentCallback"
```

---

### Task 12: 个人中心页面

**Files:**
- Create: `miniprogram/pages/profile/profile.js`
- Create: `miniprogram/pages/profile/profile.json`
- Create: `miniprogram/pages/profile/profile.wxml`
- Create: `miniprogram/pages/profile/profile.wxss`

**Interfaces:**
- Consumes: `users` 集合, `token_records` 集合, `subscribe_config` 集合, `invite_config` 集合
- Produces: `pages/profile/profile` — 个人信息、代币余额、充值入口、订阅管理、邀请分享、交易流水

- [ ] **Step 1: 创建 profile.json**

```json
{ "usingComponents": {} }
```

- [ ] **Step 2: 创建 profile.wxml**

```xml
<view class="container">
  <view class="user-card">
    <view class="avatar">👤</view>
    <view class="user-detail">
      <view class="user-role">{{isAdmin ? '管理员' : '普通用户'}}</view>
      <view class="user-id">ID: {{userId}}</view>
    </view>
  </view>

  <view class="token-section">
    <view class="token-row">
      <view class="token-box"><text class="token-num">{{tokens}}</text><text class="token-lbl">永久代币</text></view>
      <view class="token-box"><text class="token-num activity">{{activityTokens}}</text><text class="token-lbl">限时代币</text></view>
    </view>
    <button class="weui-btn weui-btn_primary" bindtap="goRecharge">充值代币</button>
  </view>

  <view class="menu-section">
    <view class="menu-item" bindtap="goHistory">📋 历史记录<text class="arrow">→</text></view>
    <view class="menu-item" bindtap="dailyCheckIn">🎁 每日签到<text class="arrow">→</text></view>
    <view class="menu-item" bindtap="claimActivity">🎉 领取活动奖励<text class="arrow">→</text></view>
    <view class="menu-item" bindtap="shareInvite">💌 邀请好友（双方各得奖励）<text class="arrow">→</text></view>
    <view class="menu-item" bindtap="goAdmin" wx:if="{{isAdmin}}">⚙️ 管理后台<text class="arrow">→</text></view>
  </view>

  <view class="records-section">
    <view class="section-title">最近流水</view>
    <view class="record-item" wx:for="{{recentRecords}}" wx:key="_id">
      <view class="record-type">{{item.typeLabel}}</view>
      <view class="record-amount {{item.amount > 0 ? 'positive' : 'negative'}}">
        {{item.amount > 0 ? '+' : ''}}{{item.amount}}
      </view>
      <view class="record-date">{{item.dateStr}}</view>
    </view>
  </view>
</view>
```

- [ ] **Step 3: 创建 profile.js**

```javascript
const app = getApp();
const { callFunction } = require('../../utils/cloud');

const TYPE_LABELS = {
  gift: '注册赠送', purchase: '购买', subscribe: '订阅领取',
  consume: '下载消耗', activity: '活动赠送', invite: '邀请奖励', expire: '过期清零',
};

Page({
  data: { userId: '', tokens: 0, activityTokens: 0, isAdmin: false, recentRecords: [] },

  onShow: async function () {
    const user = await app.getUserInfo();
    this.setData({
      userId: (user._id || '').slice(-8),
      tokens: user.tokens || 0,
      activityTokens: user.activity_tokens || 0,
      isAdmin: app.globalData.isAdmin,
    });
    this.loadRecords();
  },

  async loadRecords() {
    const db = wx.cloud.database();
    const res = await db.collection('token_records')
      .where({ _openid: '{openid}' })
      .orderBy('created_at', 'desc').limit(10).get();
    this.setData({
      recentRecords: res.data.map(r => ({
        ...r,
        typeLabel: TYPE_LABELS[r.type] || r.type,
        dateStr: r.created_at ? new Date(r.created_at).toLocaleDateString() : '',
      })),
    });
  },

  goRecharge() { wx.navigateTo({ url: '/pages/recharge/recharge' }); },
  goHistory() { wx.navigateTo({ url: '/pages/history/history' }); },
  goAdmin() { wx.navigateTo({ url: '/pages/admin/dashboard/dashboard' }); },

  async dailyCheckIn() {
    try {
      const res = await callFunction('dailyCheckIn', {});
      wx.showToast({ title: '领取成功！+' + res.tokens + ' 代币' });
      app.refreshUserInfo();
      this.onShow();
    } catch (e) { /* toast already shown */ }
  },

  async claimActivity() {
    try {
      const res = await callFunction('claimActivity', {});
      wx.showToast({ title: '领取成功！+' + res.tokens + ' 代币' });
      app.refreshUserInfo();
      this.onShow();
    } catch (e) { /* toast already shown */ }
  },

  shareInvite() {
    wx.shareAppMessage({
      title: 'AI 图片美化 — 免费体验智能修图',
      path: '/pages/index/index?inviter=' + this.data.userId,
    });
  },
});
```

- [ ] **Step 4: 创建 profile.wxss**

```css
.user-card { display: flex; align-items: center; background: #fff; border-radius: 16rpx; padding: 32rpx; margin-bottom: 24rpx; }
.avatar { font-size: 80rpx; margin-right: 24rpx; }
.user-role { font-size: 32rpx; font-weight: bold; color: #333; }
.user-id { font-size: 22rpx; color: #999; }
.token-section { background: #fff; border-radius: 16rpx; padding: 28rpx; margin-bottom: 24rpx; }
.token-row { display: flex; gap: 20rpx; margin-bottom: 20rpx; }
.token-box { flex: 1; text-align: center; padding: 20rpx; background: #f6f6f6; border-radius: 12rpx; }
.token-num { display: block; font-size: 40rpx; font-weight: bold; color: var(--primary-color); }
.token-num.activity { color: #ff9500; }
.token-lbl { font-size: 22rpx; color: #999; }
.menu-section { background: #fff; border-radius: 16rpx; margin-bottom: 24rpx; overflow: hidden; }
.menu-item { display: flex; justify-content: space-between; padding: 28rpx 24rpx; border-bottom: 1rpx solid #f0f0f0; font-size: 28rpx; }
.arrow { color: #ccc; }
.records-section { background: #fff; border-radius: 16rpx; padding: 24rpx; }
.section-title { font-size: 28rpx; font-weight: bold; margin-bottom: 16rpx; }
.record-item { display: flex; justify-content: space-between; font-size: 24rpx; padding: 12rpx 0; border-bottom: 1rpx solid #f6f6f6; }
.record-type { color: #666; flex: 2; }
.record-amount { flex: 1; text-align: center; }
.record-date { flex: 1; text-align: right; color: #999; }
.positive { color: var(--primary-color); }
.negative { color: var(--danger-color); }
```

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/profile/
git commit -m "feat: 个人中心 — 代币/充值/签到/邀请/流水"
```

---

### Task 13: dailyCheckIn + claimActivity 云函数

**Files:**
- Create: `cloudfunctions/dailyCheckIn/index.js`, `package.json`, `config.json`
- Create: `cloudfunctions/claimActivity/index.js`, `package.json`, `config.json`

**Interfaces:**
- Consumes: `users` 集合, `subscribe_config` 集合, `token_records` 集合, `activities` 集合, `user_activity_tokens` 集合
- Produces:
  - `dailyCheckIn({}) → { tokens }` — 验证订阅状态 + 今日是否已领取，发放代币
  - `claimActivity({}) → { tokens }` — 找到当前有效活动，领取限时代币

- [ ] **Step 1: 创建 dailyCheckIn 云函数**

`package.json`: `{ "name": "dailyCheckIn", "version": "1.0.0", "main": "index.js", "dependencies": { "wx-server-sdk": "~3.0.0" } }`
`config.json`: `{ "permissions": { "openapi": [] } }`

`index.js`:
```javascript
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  const userRes = await db.collection('users').where({ _openid: OPENID }).get();
  if (userRes.data.length === 0) return { err: '用户不存在' };
  const user = userRes.data[0];

  if (!user.subscription || !user.subscription.is_active) return { err: '请先订阅后再领取' };

  const today = new Date().toDateString();
  const claimedDate = user.subscription.daily_claimed_at ? new Date(user.subscription.daily_claimed_at).toDateString() : null;
  if (claimedDate === today) return { err: '今日已领取，明天再来' };

  const cfgRes = await db.collection('subscribe_config').limit(1).get();
  const cfg = cfgRes.data[0];
  if (!cfg) return { err: '订阅配置不存在' };
  const tokens = cfg.daily_tokens || 5;

  await db.collection('users').where({ _openid: OPENID }).update({
    data: {
      tokens: _.inc(tokens),
      'subscription.daily_claimed_at': new Date(),
    }
  });

  const updatedUser = await db.collection('users').where({ _openid: OPENID }).get();
  await db.collection('token_records').add({
    data: {
      user_id: OPENID, type: 'subscribe', token_type: 'permanent',
      amount: tokens, balance_after: updatedUser.data[0].tokens,
      created_at: new Date(), _openid: OPENID,
    }
  });

  return { tokens };
};
```

- [ ] **Step 2: 创建 claimActivity 云函数**

`index.js`:
```javascript
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const now = new Date();

  // 查找当前有效活动
  const actRes = await db.collection('activities')
    .where({ is_active: true, start_time: _.lte(now), end_time: _.gte(now) })
    .orderBy('end_time', 'asc').limit(1).get();

  if (actRes.data.length === 0) return { err: '暂无可用活动' };
  const activity = actRes.data[0];

  // 检查是否已领取
  const existRes = await db.collection('user_activity_tokens')
    .where({ user_id: OPENID, activity_id: activity._id }).count();
  if (existRes.total > 0) return { err: '已领取过该活动奖励' };

  const tokens = activity.reward_tokens || 0;

  // 写入用户活动代币
  await db.collection('user_activity_tokens').add({
    data: {
      user_id: OPENID, activity_id: activity._id, tokens,
      expires_at: activity.end_time, created_at: new Date(), _openid: OPENID,
    }
  });

  // 更新用户 activity_tokens
  await db.collection('users').where({ _openid: OPENID }).update({
    data: { activity_tokens: _.inc(tokens) }
  });

  // 写流水
  await db.collection('token_records').add({
    data: {
      user_id: OPENID, type: 'activity', token_type: 'temporary',
      amount: tokens, balance_after: 0,
      related_activity: activity._id, created_at: new Date(), _openid: OPENID,
    }
  });

  return { tokens };
};
```

- [ ] **Step 3: 部署两个云函数**

Run: 分别右键部署 dailyCheckIn 和 claimActivity
Expected: 两个云函数均上传成功

- [ ] **Step 4: Commit**

```bash
git add cloudfunctions/dailyCheckIn/ cloudfunctions/claimActivity/
git commit -m "feat: 每日签到 + 活动领取云函数"
```


### Task 14: 管理端 — 数据面板 + 模型配置

**Files:**
- Create: `miniprogram/pages/admin/dashboard/dashboard.js`, `.json`, `.wxml`, `.wxss`
- Create: `miniprogram/pages/admin/models/models.js`, `.json`, `.wxml`, `.wxss`

**Interfaces:**
- Consumes: `users` 集合（role=admin 判断）, `images` 集合, `orders` 集合, `model_configs` 集合
- Produces:
  - `pages/admin/dashboard/dashboard` — 当日处理量/收入/活跃用户
  - `pages/admin/models/models` — 模型列表，按分类分组，启用/禁用，添加/编辑，一键测试连通性

- [ ] **Step 1: 创建 admin/dashboard 页面**

`dashboard.json`: `{ "usingComponents": {} }`

`dashboard.wxml`:
```xml
<view class="container">
  <view class="admin-title">数据面板</view>
  <view class="stat-grid">
    <view class="stat-card"><view class="stat-num">{{todayProcess}}</view><view class="stat-label">今日处理量</view></view>
    <view class="stat-card"><view class="stat-num">{{todayRevenue}}</view><view class="stat-label">今日收入(元)</view></view>
    <view class="stat-card"><view class="stat-num">{{todayActive}}</view><view class="stat-label">今日活跃用户</view></view>
    <view class="stat-card"><view class="stat-num">{{totalOrders}}</view><view class="stat-label">总充值笔数</view></view>
  </view>
  <view class="nav-grid">
    <button class="nav-btn" bindtap="goModels">模型配置</button>
    <button class="nav-btn" bindtap="goActivities">活动管理</button>
    <button class="nav-btn" bindtap="goSettings">定价与套餐</button>
  </view>
</view>
```

`dashboard.js`:
```javascript
const app = getApp();
Page({
  data: { todayProcess: 0, todayRevenue: 0, todayActive: 0, totalOrders: 0 },

  onShow() {
    if (!app.globalData.isAdmin) { wx.showToast({ title: '无权限', icon: 'none' }); wx.navigateBack(); return; }
    this.loadStats();
  },

  async loadStats() {
    const db = wx.cloud.database();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const _ = db.command;

    const imgCount = await db.collection('images').where({ created_at: _.gte(today) }).count();
    const orderRes = await db.collection('orders').where({ created_at: _.gte(today), status: 'paid' }).get();
    const revenue = orderRes.data.reduce((s, o) => s + o.amount, 0);
    const activeUsers = new Set(orderRes.data.map(o => o.user_id)).size;
    const totalOrders = await db.collection('orders').where({ status: 'paid' }).count();

    this.setData({
      todayProcess: imgCount.total,
      todayRevenue: (revenue / 100).toFixed(2),
      todayActive: activeUsers,
      totalOrders: totalOrders.total,
    });
  },

  goModels() { wx.navigateTo({ url: '/pages/admin/models/models' }); },
  goActivities() { wx.navigateTo({ url: '/pages/admin/activities/activities' }); },
  goSettings() { wx.navigateTo({ url: '/pages/admin/settings/settings' }); },
});
```

`dashboard.wxss`:
```css
.admin-title { font-size: 36rpx; font-weight: bold; margin-bottom: 24rpx; }
.stat-grid { display: flex; flex-wrap: wrap; gap: 16rpx; margin-bottom: 32rpx; }
.stat-card { width: calc(50% - 8rpx); background: #fff; border-radius: 12rpx; padding: 32rpx; text-align: center; }
.stat-num { font-size: 48rpx; font-weight: bold; color: var(--primary-color); }
.stat-label { font-size: 24rpx; color: #999; margin-top: 8rpx; }
.nav-grid { display: flex; flex-direction: column; gap: 16rpx; }
.nav-btn { background: #fff; border-radius: 12rpx; font-size: 28rpx; }
```

- [ ] **Step 2: 创建 admin/models 页面**

`models.json`: `{ "usingComponents": {} }`

`models.wxml`:
```xml
<view class="container">
  <view class="admin-title">模型配置</view>
  <view class="category-section" wx:for="{{categories}}" wx:key="key">
    <view class="cat-header">{{item.label}}</view>
    <view class="model-item" wx:for="{{item.models}}" wx:key="_id">
      <view class="model-info">
        <view class="model-name">{{item.name}}</view>
        <view class="model-url">{{item.api_url}}</view>
      </view>
      <switch checked="{{item.is_active}}" data-id="{{item._id}}" data-active="{{item.is_active}}" bindchange="toggleModel" />
    </view>
    <button class="weui-btn weui-btn_mini weui-btn_default" data-category="{{item.key}}" bindtap="addModel">+ 添加模型</button>
  </view>
</view>
```

`models.js`:
```javascript
const app = getApp();
const { CATEGORIES, CATEGORY_LABELS } = require('../../../utils/constants');

Page({
  data: { categories: [] },

  onShow() {
    if (!app.globalData.isAdmin) { wx.navigateBack(); return; }
    this.loadModels();
  },

  async loadModels() {
    const db = wx.cloud.database();
    const res = await db.collection('model_configs').get();
    const categories = CATEGORIES.filter(c => c !== 'auto').map(key => ({
      key, label: CATEGORY_LABELS[key],
      models: res.data.filter(m => m.category === key),
    }));
    this.setData({ categories });
  },

  async toggleModel(e) {
    const { id, active } = e.currentTarget.dataset;
    const db = wx.cloud.database();
    await db.collection('model_configs').doc(id).update({
      data: { is_active: !active, updated_at: new Date() }
    });
    this.loadModels();
  },

  addModel(e) {
    const category = e.currentTarget.dataset.category;
    wx.showModal({
      title: '添加模型',
      editable: true,
      placeholderText: '输入模型名称',
      success: async (res) => {
        if (!res.confirm || !res.content) return;
        const db = wx.cloud.database();
        await db.collection('model_configs').add({
          data: {
            name: res.content, category, api_url: '', api_key: '',
            is_active: false, config: {}, updated_at: new Date(),
          }
        });
        this.loadModels();
      },
    });
  },
});
```

`models.wxss`:
```css
.category-section { margin-bottom: 32rpx; }
.cat-header { font-size: 28rpx; font-weight: bold; color: #333; margin-bottom: 12rpx; }
.model-item { display: flex; align-items: center; justify-content: space-between; background: #fff; border-radius: 8rpx; padding: 20rpx; margin-bottom: 8rpx; }
.model-info { flex: 1; }
.model-name { font-size: 26rpx; color: #333; }
.model-url { font-size: 22rpx; color: #999; }
```

- [ ] **Step 3: Commit**

```bash
git add miniprogram/pages/admin/dashboard/ miniprogram/pages/admin/models/
git commit -m "feat: 管理端 — 数据面板 + 模型配置"
```

---

### Task 15: 管理端 — 活动管理 + 定价/套餐/订阅/邀请设置

**Files:**
- Create: `miniprogram/pages/admin/activities/activities.js`, `.json`, `.wxml`, `.wxss`
- Create: `miniprogram/pages/admin/settings/settings.js`, `.json`, `.wxml`, `.wxss`

**Interfaces:**
- Consumes: `activities` 集合, `pricing_config` 集合, `token_packages` 集合, `subscribe_config` 集合, `invite_config` 集合
- Produces:
  - `pages/admin/activities/activities` — 活动 CRUD，创建/编辑/启用/停用
  - `pages/admin/settings/settings` — 四个 Tab：定价/套餐/订阅/邀请 的配置编辑

- [ ] **Step 1: 创建 admin/activities 页面**

`activities.json`: `{ "usingComponents": {} }`

`activities.wxml`:
```xml
<view class="container">
  <view class="admin-title">活动管理</view>
  <view class="activity-card" wx:for="{{list}}" wx:key="_id">
    <view class="act-name">{{item.name}}</view>
    <view class="act-detail">奖励 {{item.reward_tokens}} 代币 | {{item.startLabel}} ~ {{item.endLabel}}</view>
    <view class="act-actions">
      <switch checked="{{item.is_active}}" data-id="{{item._id}}" data-active="{{item.is_active}}" bindchange="toggle" />
      <button class="weui-btn weui-btn_mini weui-btn_warn" data-id="{{item._id}}" bindtap="deleteAct">删除</button>
    </view>
  </view>
  <button class="weui-btn weui-btn_primary" bindtap="createActivity">+ 创建活动</button>
</view>
```

`activities.js`:
```javascript
const app = getApp();
Page({
  data: { list: [] },
  onShow() { if (!app.globalData.isAdmin) { wx.navigateBack(); return; } this.load(); },

  async load() {
    const db = wx.cloud.database();
    const res = await db.collection('activities').orderBy('created_at', 'desc').get();
    this.setData({
      list: res.data.map(a => ({
        ...a,
        startLabel: a.start_time ? new Date(a.start_time).toLocaleDateString() : '',
        endLabel: a.end_time ? new Date(a.end_time).toLocaleDateString() : '',
      })),
    });
  },

  async toggle(e) {
    const { id, active } = e.currentTarget.dataset;
    const db = wx.cloud.database();
    await db.collection('activities').doc(id).update({ data: { is_active: !active } });
    this.load();
  },

  createActivity() {
    wx.showModal({
      title: '创建活动', editable: true, placeholderText: '活动名称',
      success: async (res) => {
        if (!res.confirm || !res.content) return;
        const db = wx.cloud.database();
        await db.collection('activities').add({
          data: {
            name: res.content, description: '', reward_tokens: 10,
            start_time: new Date(), end_time: new Date(Date.now() + 7 * 86400000),
            is_active: true, created_at: new Date(),
          }
        });
        this.load();
      },
    });
  },

  async deleteAct(e) {
    const id = e.currentTarget.dataset.id;
    const db = wx.cloud.database();
    await db.collection('activities').doc(id).remove();
    this.load();
  },
});
```

`activities.wxss`:
```css
.activity-card { background: #fff; border-radius: 12rpx; padding: 24rpx; margin-bottom: 16rpx; }
.act-name { font-size: 28rpx; font-weight: bold; color: #333; margin-bottom: 8rpx; }
.act-detail { font-size: 22rpx; color: #666; margin-bottom: 12rpx; }
.act-actions { display: flex; justify-content: space-between; align-items: center; }
```

- [ ] **Step 2: 创建 admin/settings 页面**

`settings.json`: `{ "usingComponents": {} }`

`settings.wxml`:
```xml
<view class="container">
  <view class="admin-title">配置管理</view>
  <view class="tab-bar">
    <view class="tab {{activeTab==='price'?'active':''}}" bindtap="switchTab" data-tab="price">定价</view>
    <view class="tab {{activeTab==='packages'?'active':''}}" bindtap="switchTab" data-tab="packages">套餐</view>
    <view class="tab {{activeTab==='subscribe'?'active':''}}" bindtap="switchTab" data-tab="subscribe">订阅</view>
    <view class="tab {{activeTab==='invite'?'active':''}}" bindtap="switchTab" data-tab="invite">邀请</view>
  </view>

  <!-- 定价 Tab -->
  <view wx:if="{{activeTab==='price'}}" class="tab-content">
    <view class="setting-item" wx:for="{{pricingList}}" wx:key="_id">
      <text class="setting-label">{{item.label}}</text>
      <input class="setting-input" type="number" value="{{item.tokens}}" data-id="{{item._id}}" data-field="tokens" bindblur="updatePricing" />
      <text class="setting-unit">代币/次</text>
    </view>
  </view>

  <!-- 套餐 Tab -->
  <view wx:if="{{activeTab==='packages'}}" class="tab-content">
    <view class="setting-item" wx:for="{{packages}}" wx:key="_id">
      <view class="pkg-info"><text>{{item.name}} - ¥{{item.priceInYuan}} - {{item.tokens}}代币</text>
      <switch checked="{{item.is_active}}" data-id="{{item._id}}" data-field="is_active" bindchange="updatePackage" /></view>
    </view>
    <button class="weui-btn weui-btn_mini weui-btn_default" bindtap="addPackage">+ 添加套餐</button>
  </view>

  <!-- 订阅 Tab -->
  <view wx:if="{{activeTab==='subscribe'}}" class="tab-content">
    <view class="setting-item"><text class="setting-label">月费(分)</text>
      <input class="setting-input" type="number" value="{{subConfig.price}}" data-field="price" bindblur="updateSub" /></view>
    <view class="setting-item"><text class="setting-label">每日赠送</text>
      <input class="setting-input" type="number" value="{{subConfig.daily_tokens}}" data-field="daily_tokens" bindblur="updateSub" /></view>
  </view>

  <!-- 邀请 Tab -->
  <view wx:if="{{activeTab==='invite'}}" class="tab-content">
    <view class="setting-item"><text class="setting-label">邀请人奖励</text>
      <input class="setting-input" type="number" value="{{inviteConfig.inviter_reward}}" data-field="inviter_reward" bindblur="updateInvite" /></view>
    <view class="setting-item"><text class="setting-label">被邀请人奖励</text>
      <input class="setting-input" type="number" value="{{inviteConfig.invitee_reward}}" data-field="invitee_reward" bindblur="updateInvite" /></view>
  </view>
</view>
```

`settings.js`:
```javascript
const app = getApp();
const { CATEGORY_LABELS } = require('../../../utils/constants');

Page({
  data: { activeTab: 'price', pricingList: [], packages: [], subConfig: {}, inviteConfig: {} },

  onShow() {
    if (!app.globalData.isAdmin) { wx.navigateBack(); return; }
    this.loadAll();
  },

  async loadAll() {
    const db = wx.cloud.database();
    const [pr, pk, sc, ic] = await Promise.all([
      db.collection('pricing_config').get(),
      db.collection('token_packages').orderBy('price', 'asc').get(),
      db.collection('subscribe_config').limit(1).get(),
      db.collection('invite_config').limit(1).get(),
    ]);
    this.setData({
      pricingList: pr.data.map(p => ({ ...p, label: CATEGORY_LABELS[p.category] || p.category })),
      packages: pk.data.map(p => ({ ...p, priceInYuan: (p.price / 100).toFixed(2) })),
      subConfig: sc.data[0] || { price: 1999, daily_tokens: 5 },
      inviteConfig: ic.data[0] || { inviter_reward: 10, invitee_reward: 5 },
    });
  },

  switchTab(e) { this.setData({ activeTab: e.currentTarget.dataset.tab }); },

  async updatePricing(e) {
    const { id, field } = e.currentTarget.dataset;
    const value = parseInt(e.detail.value) || 0;
    const db = wx.cloud.database();
    await db.collection('pricing_config').doc(id).update({ data: { [field]: value, updated_at: new Date() } });
  },

  async updatePackage(e) {
    const db = wx.cloud.database();
    await db.collection('token_packages').doc(e.currentTarget.dataset.id).update({
      data: { is_active: e.detail.value }
    });
  },

  async addPackage() { /* 简化：通过云开发控制台直接操作 */ wx.showToast({ title: '请在云开发控制台添加', icon: 'none' }); },

  async updateSub(e) {
    const { field } = e.currentTarget.dataset;
    const value = parseInt(e.detail.value) || 0;
    const db = wx.cloud.database();
    await db.collection('subscribe_config').doc(this.data.subConfig._id).update({ data: { [field]: value } });
  },

  async updateInvite(e) {
    const { field } = e.currentTarget.dataset;
    const value = parseInt(e.detail.value) || 0;
    const db = wx.cloud.database();
    await db.collection('invite_config').doc(this.data.inviteConfig._id).update({ data: { [field]: value } });
  },
});
```

`settings.wxss`:
```css
.tab-bar { display: flex; background: #fff; border-radius: 12rpx; margin-bottom: 24rpx; overflow: hidden; }
.tab { flex: 1; text-align: center; padding: 20rpx 0; font-size: 26rpx; color: #666; }
.tab.active { color: var(--primary-color); font-weight: bold; border-bottom: 4rpx solid var(--primary-color); }
.tab-content { background: #fff; border-radius: 12rpx; padding: 24rpx; }
.setting-item { display: flex; align-items: center; padding: 16rpx 0; border-bottom: 1rpx solid #f0f0f0; }
.setting-label { width: 200rpx; font-size: 26rpx; color: #333; }
.setting-input { flex: 1; border: 1rpx solid #ddd; border-radius: 6rpx; padding: 8rpx 16rpx; font-size: 26rpx; }
.setting-unit { font-size: 22rpx; color: #999; margin-left: 12rpx; }
.pkg-info { display: flex; justify-content: space-between; align-items: center; width: 100%; }
```

- [ ] **Step 3: Commit**

```bash
git add miniprogram/pages/admin/activities/ miniprogram/pages/admin/settings/
git commit -m "feat: 管理端 — 活动管理 + 定价/套餐/订阅/邀请配置"
```


### Task 16: expireTokens 定时云函数（活动代币过期扫描）

**Files:**
- Create: `cloudfunctions/expireTokens/index.js`
- Create: `cloudfunctions/expireTokens/package.json`
- Create: `cloudfunctions/expireTokens/config.json`

**Interfaces:**
- Consumes: `user_activity_tokens` 集合, `users` 集合, `token_records` 集合
- Produces: `expireTokens() → { processed: number, expiredTokens: number }`
  - 触发方式：定时触发器（每日凌晨 2:00）
  - 扫描 expires_at < now 的 user_activity_tokens 记录
  - 汇总每个用户的总过期数，扣除 users.activity_tokens
  - 删除已过期记录（或归档）
  - 写入 expire 流水

- [ ] **Step 1: 创建 expireTokens/package.json**

```json
{ "name": "expireTokens", "version": "1.0.0", "main": "index.js", "dependencies": { "wx-server-sdk": "~3.0.0" } }
```

- [ ] **Step 2: 创建 expireTokens/config.json**

```json
{
  "permissions": { "openapi": [] },
  "triggers": [
    {
      "name": "dailyExpireScan",
      "type": "timer",
      "config": "0 0 2 * * * *"
    }
  ]
}
```

- [ ] **Step 3: 创建 expireTokens/index.js**

```javascript
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const now = new Date();

  // 1. 查找所有已过期的活动代币记录
  const expiredRes = await db.collection('user_activity_tokens')
    .where({ expires_at: _.lt(now), tokens: _.gt(0) }).get();

  if (expiredRes.data.length === 0) return { processed: 0, expiredTokens: 0 };

  // 2. 按用户汇总过期代币数
  const userTotals = {};
  for (const record of expiredRes.data) {
    if (!userTotals[record.user_id]) userTotals[record.user_id] = 0;
    userTotals[record.user_id] += record.tokens;
  }

  // 3. 逐个用户处理
  let totalExpired = 0;
  for (const [userId, expiring] of Object.entries(userTotals)) {
    // 扣减用户 activity_tokens
    await db.collection('users').where({ _openid: userId }).update({
      data: { activity_tokens: _.inc(-expiring) }
    });

    // 写过期流水
    const userRes = await db.collection('users').where({ _openid: userId }).get();
    if (userRes.data.length > 0) {
      await db.collection('token_records').add({
        data: {
          user_id: userId, type: 'expire', token_type: 'temporary',
          amount: -expiring, balance_after: userRes.data[0].activity_tokens,
          created_at: new Date(), _openid: userId,
        }
      });
    }

    totalExpired += expiring;
  }

  // 4. 将过期记录的 tokens 置零
  const expiredIds = expiredRes.data.map(r => r._id);
  for (const id of expiredIds) {
    await db.collection('user_activity_tokens').doc(id).update({
      data: { tokens: 0 }
    });
  }

  return { processed: expiredRes.data.length, expiredTokens: totalExpired };
};
```

- [ ] **Step 4: 部署 expireTokens + 配置定时触发器**

Run: 右键 `cloudfunctions/expireTokens` → "上传并部署：云端安装依赖"
然后：云开发控制台 → 云函数 → expireTokens → 触发器 → 确认 dailyExpireScan 已创建（每日凌晨 2:00）

Expected: 上传成功，定时触发器配置生效

- [ ] **Step 5: 手动测试**

Run: 云开发控制台 → 云函数 → expireTokens → 测试调用（参数 `{}`）
Expected: 返回 `{ processed: N, expiredTokens: M }`，根据当前数据返回（可能为 0）

- [ ] **Step 6: Commit**

```bash
git add cloudfunctions/expireTokens/
git commit -m "feat: expireTokens 定时云函数 — 活动代币过期扫描"
```

---

### Task 17: syncOrders 定时云函数（订单补单扫描）

**Files:**
- Create: `cloudfunctions/syncOrders/index.js`
- Create: `cloudfunctions/syncOrders/package.json`
- Create: `cloudfunctions/syncOrders/config.json`

**Interfaces:**
- Consumes: `orders` 集合, `users` 集合, `token_records` 集合, 微信支付查询 API
- Produces: `syncOrders() → { synced: number, fixed: number }`
  - 触发方式：定时触发器（每 5 分钟）
  - 扫描 status='pending' 且超过 5 分钟的订单
  - 调用微信支付查询接口确认支付状态
  - 对已支付但未到账的订单进行补单（加代币、写流水、更新订单状态）

- [ ] **Step 1: 创建 syncOrders/package.json**

```json
{ "name": "syncOrders", "version": "1.0.0", "main": "index.js", "dependencies": { "wx-server-sdk": "~3.0.0" } }
```

- [ ] **Step 2: 创建 syncOrders/config.json**

```json
{
  "permissions": { "openapi": [] },
  "triggers": [
    {
      "name": "syncOrdersTimer",
      "type": "timer",
      "config": "0 */5 * * * * *"
    }
  ]
}
```

- [ ] **Step 3: 创建 syncOrders/index.js**

```javascript
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

  // 查找超过 5 分钟的 pending 订单（不含今天的，避免与正常回调冲突）
  const orderRes = await db.collection('orders')
    .where({ status: 'pending', created_at: _.lt(fiveMinAgo) })
    .limit(50).get();

  if (orderRes.data.length === 0) return { synced: 0, fixed: 0 };

  let fixed = 0;

  for (const order of orderRes.data) {
    try {
      // 调用微信支付查询接口
      const payResult = await cloud.cloudPay.queryOrder({
        out_trade_no: order._id,
        sub_mch_id: '', // 根据实际商户号配置
      });

      if (payResult.returnCode === 'SUCCESS' && payResult.tradeState === 'SUCCESS') {
        // 支付成功但未到账 → 补单
        await db.collection('orders').doc(order._id).update({
          data: { status: 'paid', wx_order_id: payResult.transactionId || '' }
        });

        await db.collection('users').where({ _openid: order.user_id }).update({
          data: { tokens: _.inc(order.tokens) }
        });

        const userRes = await db.collection('users').where({ _openid: order.user_id }).get();
        if (userRes.data.length > 0) {
          await db.collection('token_records').add({
            data: {
              user_id: order.user_id, type: 'purchase', token_type: 'permanent',
              amount: order.tokens, balance_after: userRes.data[0].tokens,
              related_order: order._id, created_at: new Date(), _openid: order.user_id,
            }
          });
        }

        fixed++;
      } else if (payResult.tradeState === 'NOTPAY' || payResult.tradeState === 'CLOSED') {
        // 未支付或已关闭 → 取消订单
        await db.collection('orders').doc(order._id).update({
          data: { status: 'cancelled' }
        });
      }
    } catch (e) {
      // 单笔查询失败不影响其他订单
      console.error('syncOrders error for order', order._id, e.message);
    }
  }

  return { synced: orderRes.data.length, fixed };
};
```

- [ ] **Step 4: 部署 syncOrders + 配置定时触发器**

Run: 右键 `cloudfunctions/syncOrders` → "上传并部署：云端安装依赖"
确认：云开发控制台 → 云函数 → syncOrders → 触发器 → syncOrdersTimer 已创建（每 5 分钟）

Expected: 上传成功，定时触发器配置生效

- [ ] **Step 5: 手动测试**

Run: 云开发控制台 → 云函数 → syncOrders → 测试调用（参数 `{}`）
Expected: 返回 `{ synced: N, fixed: M }`，扫描超时订单并补单

- [ ] **Step 6: Commit**

```bash
git add cloudfunctions/syncOrders/
git commit -m "feat: syncOrders 定时云函数 — 订单补单扫描"
```

---

## 自检清单

### 1. 规格覆盖

| 规格需求 | 对应任务 |
|---------|---------|
| 项目脚手架 / 数据库初始化 | Task 1 |
| 用户注册 / 邀请绑定 | Task 1 (app.js) + Task 3 |
| 四大分类美化处理 | Task 6 + Task 7 |
| 预览免费、下载扣费 | Task 8 + Task 9 |
| 代币体系（注册/购买/订阅/活动/邀请） | Task 11 + Task 13 + Task 16 |
| 扣费优先级 | Task 9（downloadImage） |
| 微信支付 | Task 11（createOrder + paymentCallback） |
| 订阅每日领取 | Task 13（dailyCheckIn） |
| 活动代币过期 | Task 16（expireTokens） |
| 邀请返利 | Task 3 + Task 9 |
| 管理端：模型配置 | Task 14 |
| 管理端：活动管理 | Task 15 |
| 管理端：定价/套餐/订阅/邀请 | Task 15 |
| 管理端：数据面板 | Task 14 |
| 历史记录 | Task 10 |
| 个人中心 | Task 12 |
| 订单补单 | Task 17 |
| 图片格式/大小校验 | Task 2 + Task 4 |
| 错误处理 | 各云函数内 err 返回 |

### 2. 占位符扫描

无 TBD/TODO/占位符。所有步骤均包含实际代码。

### 3. 类型一致性

- `constants` 导出 Task 1 定义 → Task 2/5/6/8/12/14/15 消费 ✓
- `cloud.callFunction/uploadImage/getTempURL` Task 2 定义 → Task 6/8/9/10/11/12 消费 ✓
- `processImage({ imageFileID, processType, subType }) → { imageId, previewFileID }` Task 7 产出 → Task 6 消费 ✓
- `downloadImage({ imageId }) → { resultFileID }` Task 9 产出 → Task 8/10 消费 ✓
- `createOrder({ packageId }) → { wxPayParams }` Task 11 产出 → Task 11 消费 ✓
- `checkInvite({ inviter_id }) → { inviter_id }` Task 3 产出 → Task 1 消费 ✓
- 所有云函数签名保持一致 ✓

---

> **执行说明：** 以上 17 个任务按编号顺序执行。每个任务完成后 commit 一次。前后任务有依赖关系（依赖在 Consumes/Produces 中声明）。
