# AI 图片美化小程序 — 修复与功能增强计划（修订版）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **修订说明：** 本计划取代 `2026-07-06-fix-and-ad-reward-plan.md`。原计划 progress.md 标注 20 任务全完成，但 2026-07-08 逐文件核查发现**全部 20 个任务均未落地**（代码仍为原始状态）。本修订版采用 writing-plans 标准格式，每个任务含完整代码、精确文件路径、可执行验证步骤。

**Goal:** 修复主计划完成后审查发现的 20 个真实 bug / 设计缺失 / 安全漏洞，并新增"看广告领永久代币"功能。

**Architecture:** 微信小程序原生 + 微信云开发（Node.js 18）。云函数处理所有写操作和资金变动。管理端所有写操作统一走 `adminAction` 云函数做服务端鉴权。扣费全流程用 `db.runTransaction` 事务化。

**Tech Stack:** 微信小程序原生框架、微信云开发（wx-server-sdk）、云数据库、云存储、微信支付 cloudPay、wx.createRewardedVideoAd

## Global Constraints

- 图片格式：`SUPPORTED_FORMATS = ['jpg', 'jpeg', 'png', 'heic', 'webp']`
- 单张上限：`MAX_FILE_SIZE = 10 * 1024 * 1024`（10MB）
- 云函数超时：30s
- 扣费优先级：限时代币（`expires_at` 升序）→ 永久代币（`users.tokens`）
- 管理端鉴权：服务端校验 `users.role === 'admin'`，禁止前端直写数据库
- 时区：所有日期计算以北京时间（UTC+8）为准
- 代币类型：`permanent`（永久）/ `temporary`（限时）
- 水印：前端 CSS 叠加，不使用 sharp 原生模块
- 所有定价/比例后台可调、即时生效
- MVP 不做：批量处理、裁剪旋转、社区、多语言、图片去重

## 测试策略

本项目无单元测试框架（无 jest/mocha），云函数依赖 wx-server-sdk 只能在云环境运行。验证手段：

- **云函数语法检查：** `node --check index.js`（捕获语法错误）
- **云函数逻辑验证：** 微信云开发控制台 → 云函数 → 云端测试，传入 JSON event
- **前端验证：** 微信开发者工具编译无报错 + 模拟器/真机操作验证
- **纯逻辑函数：** 抽到 `utils/` 后用 `node -e "..."` 断言验证

---

## File Structure

```
cloudfunctions/
├── adminAction/index.js          # [新增] 管理端统一写入口 + role 校验
├── rewardAd/index.js             # [新增] 广告领币
├── testModel/index.js            # [新增] 模型连通性测试
├── dailyCheckIn/index.js         # [修改] 时区修复
├── downloadImage/index.js        # [修改] 事务化 + token_type 修正
├── paymentCallback/index.js      # [修改] 事务化 + 金额校验
├── syncOrders/index.js           # [修改] 事务化 + 扫 paid-but-no-stream
├── processImage/index.js         # [修改] auto 分类调度
├── expireTokens/index.js         # [修改] 分页
└── initDB/index.js               # [修改] 加 ad_config 集合 + 索引 + 默认套餐

miniprogram/
├── app.js                        # [修改] 缓存 inviter 参数
├── utils/
│   ├── cloud.js                  # [修改] 新增 getTempURLs 批量方法
│   └── validators.js             # [修改] 扩展名校验修复
├── pages/
│   ├── preview/preview.js        # [修改] retry + loading + 价格查库
│   ├── profile/profile.js        # [修改] 邀请分享 + 广告入口
│   ├── profile/profile.wxml      # [修改] 邀请改 button + 广告菜单项
│   ├── history/history.js        # [修改] 重新处理 + 批量 URL + loading
│   ├── history/history.wxml      # [修改] 加重新处理按钮
│   ├── process/process.js        # [修改] onLoad 接收 fileID
│   ├── admin/models/models.js    # [修改] 过滤 auto + catch + 测试按钮
│   ├── admin/models/models.wxml  # [修改] 测试按钮
│   └── admin/settings/settings.js  # [修改] 广告 tab + wx_template_id
│   └── admin/settings/settings.wxml # [修改] 广告 tab + wx_template_id
└── components/
    └── image-uploader/image-uploader.js  # [修改] showExternal + 扩展名校验
```

---

## 阶段一：阻断功能修复（Task 1-6，互相独立，可并行）

### Task 1：preview 页"重新处理"路径修复

**Files:**
- Modify: `miniprogram/pages/preview/preview.js`

**Interfaces:**
- Consumes: `images` 表 `process_type`、`original_url` 字段
- Produces: `data.category`（string）、`data.originalFileID`（string）供 `retry()` 使用

- [ ] **Step 1：替换 preview.js 全文**

```js
const { getTempURL, callFunction } = require('../../utils/cloud');
const { DEFAULT_PRICES } = require('../../utils/constants');

Page({
  data: { imageId: '', previewFileID: '', previewUrl: '', price: 0, downloading: false, category: '', originalFileID: '' },

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
    this.setData({
      price,
      category: img.data.process_type,
      originalFileID: img.data.original_url
    });
  },

  async download() {
    this.setData({ downloading: true });
    try {
      const res = await callFunction('downloadImage', { imageId: this.data.imageId });
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
    wx.redirectTo({
      url: '/pages/process/process?category=' + this.data.category + '&fileID=' + this.data.originalFileID
    });
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
```

- [ ] **Step 2：语法检查**

Run: `node --check miniprogram/pages/preview/preview.js`
Expected: 无输出，exit 0

- [ ] **Step 3：手动验证**

微信开发者工具 → 进入 preview 页 → 点"重新处理" → 应跳回 process 页，URL 含 `category=beautify&fileID=cloud://...`

- [ ] **Step 4：Commit**

```bash
git add miniprogram/pages/preview/preview.js
git commit -m "fix(preview): retry 改 redirectTo 并携带 category+fileID"
```

---

### Task 2：profile 邀请分享修复

**Files:**
- Modify: `miniprogram/pages/profile/profile.wxml:35-37`
- Modify: `miniprogram/pages/profile/profile.js:59-64`

**Interfaces:**
- Consumes: `data.userId`（当前用户 ID 后缀 8 位）
- Produces: `onShareAppMessage()` 返回分享配置，path 含完整 inviter

- [ ] **Step 1：修改 profile.wxml — 邀请项改为 button**

将 `profile.wxml:35-37` 的：
```xml
    <view class="m-item" bindtap="shareInvite">
      <text class="m-icon">💌</text><text class="m-text">邀请好友<text class="m-sub">双方各得奖励</text></text><text class="m-arrow">›</text>
    </view>
```
替换为：
```xml
    <button class="m-item m-share-btn" open-type="share">
      <text class="m-icon">💌</text><text class="m-text">邀请好友<text class="m-sub">双方各得奖励</text></text><text class="m-arrow">›</text>
    </button>
```

- [ ] **Step 2：修改 profile.js — 删 shareInvite，加 onShareAppMessage**

将 `profile.js:59-64` 的：
```js
  shareInvite() {
    wx.shareAppMessage({
      title: 'AI 图片美化 — 免费体验智能修图',
      path: '/pages/index/index?inviter=' + this.data.userId,
    });
  },
```
替换为：
```js
  onShareAppMessage() {
    return {
      title: 'AI 图片美化 — 免费体验智能修图',
      path: '/pages/index/index?inviter=' + this.data.userId,
    };
  },
```

- [ ] **Step 3：在 profile.wxss 末尾追加分享按钮样式**

```css
.m-share-btn {
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  line-height: inherit;
  font-size: inherit;
  text-align: left;
  display: flex;
  align-items: center;
  width: 100%;
}
.m-share-btn::after {
  border: none;
}
```

- [ ] **Step 4：语法检查**

Run: `node --check miniprogram/pages/profile/profile.js`
Expected: 无输出，exit 0

- [ ] **Step 5：手动验证**

开发者工具 → profile 页 → 点邀请好友 → 应弹出分享面板（非静默失败）

- [ ] **Step 6：Commit**

```bash
git add miniprogram/pages/profile/profile.wxml miniprogram/pages/profile/profile.js miniprogram/pages/profile/profile.wxss
git commit -m "fix(profile): 邀请分享改 button open-type=share + onShareAppMessage"
```

---

### Task 3：history "重新处理" + process 接收 fileID + image-uploader showExternal

**Files:**
- Modify: `miniprogram/pages/history/history.wxml:15`
- Modify: `miniprogram/pages/history/history.js`
- Modify: `miniprogram/pages/process/process.js:6-8`
- Modify: `miniprogram/components/image-uploader/image-uploader.js`

**Interfaces:**
- Consumes: `images` 表 `original_url`、`process_type` 字段
- Produces: `history.reprocess(e)` → `wx.navigateTo` 到 process 页携带 `category` + `fileID`
- Produces: `process.onLoad(options)` 支持 `options.fileID`
- Produces: `image-uploader` 组件新增 `externalFileID` property + `showExternal(fileID, tempPath)` 方法

- [ ] **Step 1：修改 history.wxml — 加"重新处理"按钮**

将 `history.wxml:15` 的：
```xml
    <button class="h-btn" bindtap="download" data-id="{{item._id}}">下载</button>
```
替换为：
```xml
    <view class="h-btns">
      <button class="h-btn" bindtap="download" data-id="{{item._id}}">下载</button>
      <button class="h-btn h-btn-reprocess" bindtap="reprocess" data-id="{{item._id}}" data-category="{{item.process_type}}" data-fileid="{{item.original_url}}">重新处理</button>
    </view>
```

- [ ] **Step 2：修改 history.js — 加 reprocess 方法**

在 `history.js:56`（`download` 方法的 `}` 后、Page 闭合 `});` 前）插入：
```js

  reprocess(e) {
    const { category, fileid } = e.currentTarget.dataset;
    wx.navigateTo({
      url: '/pages/process/process?category=' + category + '&fileID=' + fileid
    });
  },
```

- [ ] **Step 3：修改 process.js — onLoad 接收 fileID**

将 `process.js:6-8` 的：
```js
  onLoad(options) {
    this.setData({ category: options.category || 'auto' });
  },
```
替换为：
```js
  onLoad(options) {
    this.setData({ category: options.category || 'auto' });
    if (options.fileID) {
      this.setData({ fileID: options.fileID, tempPath: '' });
      const uploader = this.selectComponent('#uploader');
      if (uploader) uploader.showExternal(options.fileID);
    }
  },
```

- [ ] **Step 4：修改 process.wxml — 给 image-uploader 加 id**

将 `process.wxml:6` 的：
```xml
  <image-uploader bind:upload="onImageUploaded" />
```
替换为：
```xml
  <image-uploader id="uploader" bind:upload="onImageUploaded" />
```

- [ ] **Step 5：修改 image-uploader.js — 加 showExternal 方法**

在 `image-uploader.js:49`（`confirmUpload` 方法的 `}` 后、methods 闭合 `}` 前）插入：
```js

    showExternal(fileID) {
      this.setData({ imagePath: fileID, imageFile: { external: true }, error: '' });
    },
```

- [ ] **Step 6：语法检查**

Run: `node --check miniprogram/pages/history/history.js`
Run: `node --check miniprogram/pages/process/process.js`
Run: `node --check miniprogram/components/image-uploader/image-uploader.js`
Expected: 全部无输出，exit 0

- [ ] **Step 7：手动验证**

开发者工具 → history 页 → 某条记录点"重新处理" → 跳到 process 页 → 原图已显示 → 可选别的效果 → 点开始美化

- [ ] **Step 8：Commit**

```bash
git add miniprogram/pages/history/history.wxml miniprogram/pages/history/history.js miniprogram/pages/process/process.js miniprogram/pages/process/process.wxml miniprogram/components/image-uploader/image-uploader.js
git commit -m "feat: history 重新处理入口 + process 接收 fileID + image-uploader showExternal"
```

---

### Task 4：preview / history 下载按钮 loading 状态不重置

**Files:**
- Modify: `miniprogram/pages/preview/preview.js:29-48`
- Modify: `miniprogram/pages/history/history.js:37-56`

**Interfaces:**
- Consumes: `data.downloading`（boolean）
- Produces: 所有 fail 分支均重置 `downloading: false`；相册权限拒绝时引导 `wx.openSetting`

- [ ] **Step 1：替换 preview.js download 方法**

将 `preview.js:29-48` 的整个 `download()` 方法替换为：
```js
  async download() {
    this.setData({ downloading: true });
    try {
      const res = await callFunction('downloadImage', { imageId: this.data.imageId });
      const url = await getTempURL(res.resultFileID);
      wx.downloadFile({
        url,
        success: (df) => {
          wx.saveImageToPhotosAlbum({
            filePath: df.tempFilePath,
            success: () => {
              this.setData({ downloading: false });
              wx.showToast({ title: '已保存到相册' });
            },
            fail: (err) => {
              this.setData({ downloading: false });
              if (err.errMsg && err.errMsg.indexOf('auth deny') !== -1) {
                wx.showModal({
                  title: '需要相册权限',
                  content: '请在设置中允许保存图片到相册',
                  confirmText: '去设置',
                  success: (m) => { if (m.confirm) wx.openSetting(); }
                });
              } else {
                wx.showToast({ title: '保存失败', icon: 'none' });
              }
            },
          });
        },
        fail: () => {
          this.setData({ downloading: false });
          wx.showToast({ title: '下载失败', icon: 'none' });
        },
      });
    } catch (e) {
      this.setData({ downloading: false });
    }
  },
```

- [ ] **Step 2：替换 history.js download 方法**

将 `history.js:37-56` 的整个 `download()` 方法替换为：
```js
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
            fail: (err) => {
              wx.hideLoading();
              if (err.errMsg && err.errMsg.indexOf('auth deny') !== -1) {
                wx.showModal({
                  title: '需要相册权限',
                  content: '请在设置中允许保存图片到相册',
                  confirmText: '去设置',
                  success: (m) => { if (m.confirm) wx.openSetting(); }
                });
              } else {
                wx.showToast({ title: '保存失败', icon: 'none' });
              }
            },
          });
        },
        fail: () => {
          wx.hideLoading();
          wx.showToast({ title: '下载失败', icon: 'none' });
        },
      });
    } catch (e) {
      wx.hideLoading();
    }
  },
```

- [ ] **Step 3：语法检查**

Run: `node --check miniprogram/pages/preview/preview.js`
Run: `node --check miniprogram/pages/history/history.js`
Expected: 全部无输出，exit 0

- [ ] **Step 4：手动验证**

开发者工具 → 拒绝相册权限 → 点下载 → 按钮不卡 loading + 弹出"去设置"引导

- [ ] **Step 5：Commit**

```bash
git add miniprogram/pages/preview/preview.js miniprogram/pages/history/history.js
git commit -m "fix: preview/history 下载 loading 重置 + 相册权限引导"
```

---

### Task 5：dailyCheckIn 时区 bug

**Files:**
- Modify: `cloudfunctions/dailyCheckIn/index.js:15-17`

**Interfaces:**
- Produces: `todayBeijing()` 返回 `YYYY-MM-DD` 字符串（北京时间）

- [ ] **Step 1：替换 dailyCheckIn/index.js 全文**

```js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function todayBeijing() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  const userRes = await db.collection('users').where({ _openid: OPENID }).get();
  if (userRes.data.length === 0) return { err: '用户不存在' };
  const user = userRes.data[0];

  if (!user.subscription || !user.subscription.is_active) return { err: '请先订阅后再领取' };

  const today = todayBeijing();
  const claimedDate = user.subscription.daily_claimed_at
    ? new Date(new Date(user.subscription.daily_claimed_at).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10)
    : null;
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

- [ ] **Step 2：语法检查**

Run: `node --check cloudfunctions/dailyCheckIn/index.js`
Expected: 无输出，exit 0

- [ ] **Step 3：纯逻辑验证 todayBeijing**

Run: `node -e "function todayBeijing(){return new Date(Date.now()+8*3600*1000).toISOString().slice(0,10)} console.log('today=', todayBeijing()); console.assert(/^\d{4}-\d{2}-\d{2}$/.test(todayBeijing()), 'format wrong');"`
Expected: 输出 `today=2026-07-08`（或当前北京日期），无 assert 失败

- [ ] **Step 4：Commit**

```bash
git add cloudfunctions/dailyCheckIn/index.js
git commit -m "fix(dailyCheckIn): 时区改用北京时间 YYYY-MM-DD 比较"
```

---

### Task 6：app.js 邀请参数未传入 checkInvite

**Files:**
- Modify: `miniprogram/app.js`

**Interfaces:**
- Produces: `globalData.inviterId`（string | undefined）
- Consumes: `checkInvite` 云函数 `event.inviter_id`

- [ ] **Step 1：替换 app.js 全文**

```js
App({
  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({ env: 'YOUR_ENV_ID', traceUser: true });
    }
    this.globalData = { userInfo: null, isAdmin: false, inviterId: '' };
    try {
      const launchOptions = wx.getLaunchOptionsSync();
      if (launchOptions && launchOptions.query && launchOptions.query.inviter) {
        this.globalData.inviterId = launchOptions.query.inviter;
      }
    } catch (e) { /* ignore */ }
  },

  getUserInfo: async function () {
    if (this.globalData.userInfo) return this.globalData.userInfo;
    const db = wx.cloud.database();
    const res = await wx.cloud.callFunction({
      name: 'checkInvite',
      data: { inviter_id: this.globalData.inviterId || '' }
    });
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

- [ ] **Step 2：语法检查**

Run: `node --check miniprogram/app.js`
Expected: 无输出，exit 0

- [ ] **Step 3：手动验证**

开发者工具 → 编译设置启动参数 `inviter=testUser123` → 启动 → 检查云函数 checkInvite 日志收到 `inviter_id: 'testUser123'`

- [ ] **Step 4：Commit**

```bash
git add miniprogram/app.js
git commit -m "fix(app): onLaunch 缓存 inviter 参数并传入 checkInvite"
```

---

## 阶段二：数据与资金安全（Task 7-9，建议串行）

### Task 7：downloadImage 扣费事务化

**Files:**
- Modify: `cloudfunctions/downloadImage/index.js`

**Interfaces:**
- Consumes: `users.tokens`、`users.activity_tokens`、`user_activity_tokens` 表
- Produces: 事务内原子扣费 + `token_records.token_type` 按实际扣减类型标记

- [ ] **Step 1：替换 downloadImage/index.js 全文**

```js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { imageId } = event;
  const { OPENID } = cloud.getWXContext();
  if (!imageId) return { err: '缺少图片ID' };

  const imgRes = await db.collection('images').doc(imageId).get();
  const image = imgRes.data;
  if (!image || image.user_id !== OPENID) return { err: '图片不存在' };

  if (image.is_downloaded) return { resultFileID: image.result_url };

  const priceRes = await db.collection('pricing_config')
    .where({ category: image.process_type }).get();
  const price = priceRes.data.length > 0 ? priceRes.data[0].tokens : 2;

  const userRes = await db.collection('users').where({ _openid: OPENID }).get();
  if (userRes.data.length === 0) return { err: '用户不存在' };
  const user = userRes.data[0];
  const totalBalance = (user.tokens || 0) + (user.activity_tokens || 0);
  if (totalBalance < price) return { err: '代币不足，请先充值' };

  try {
    await db.runTransaction(async transaction => {
      const txUserRes = await transaction.collection('users').where({ _openid: OPENID }).get();
      const txUser = txUserRes.data[0];
      const txBalance = (txUser.tokens || 0) + (txUser.activity_tokens || 0);
      if (txBalance < price) throw new Error('代币不足');

      let remaining = price;
      let activityDeducted = 0;
      let permanentDeducted = 0;

      const actRes = await transaction.collection('user_activity_tokens')
        .where({ user_id: OPENID, tokens: _.gt(0) })
        .orderBy('expires_at', 'asc').get();

      for (const at of actRes.data) {
        if (remaining <= 0) break;
        const deduct = Math.min(at.tokens, remaining);
        await transaction.collection('user_activity_tokens').doc(at._id).update({
          data: { tokens: _.inc(-deduct) }
        });
        remaining -= deduct;
        activityDeducted += deduct;
      }

      if (remaining > 0) {
        permanentDeducted = remaining;
        await transaction.collection('users').where({ _openid: OPENID }).update({
          data: { tokens: _.inc(-remaining) }
        });
      }

      if (activityDeducted > 0) {
        await transaction.collection('users').where({ _openid: OPENID }).update({
          data: { activity_tokens: _.inc(-activityDeducted) }
        });
      }

      const afterRes = await transaction.collection('users').where({ _openid: OPENID }).get();
      const balanceAfter = (afterRes.data[0].tokens || 0) + (afterRes.data[0].activity_tokens || 0);

      const tokenType = (activityDeducted > 0 && permanentDeducted === 0) ? 'temporary' : 'permanent';
      await transaction.collection('token_records').add({
        data: {
          user_id: OPENID, type: 'consume', token_type: tokenType,
          amount: -price, balance_after: balanceAfter, related_image: imageId,
          created_at: new Date(), _openid: OPENID,
        }
      });

      await transaction.collection('images').doc(imageId).update({
        data: { is_downloaded: true }
      });
    });
  } catch (txErr) {
    if (txErr.message === '代币不足') return { err: '代币不足，请充值' };
    console.error('downloadImage transaction error:', txErr);
    return { err: '扣费失败，请重试' };
  }

  const orderCount = await db.collection('token_records')
    .where({ user_id: OPENID, type: 'consume' }).count();
  if (orderCount.total === 1) {
    const inviteRes = await db.collection('invite_records')
      .where({ invitee_openid: OPENID, status: 'registered' }).get();
    if (inviteRes.data.length > 0) {
      const invite = inviteRes.data[0];
      const cfgRes = await db.collection('invite_config').limit(1).get();
      const cfg = cfgRes.data[0] || { inviter_reward: 10, invitee_reward: 5 };

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

      await db.collection('users').where({ _openid: OPENID }).update({
        data: { tokens: _.inc(cfg.invitee_reward) }
      });
      const finalUser = await db.collection('users').where({ _openid: OPENID }).get();
      await db.collection('token_records').add({
        data: {
          user_id: OPENID, type: 'invite', token_type: 'permanent',
          amount: cfg.invitee_reward, balance_after: finalUser.data[0].tokens,
          created_at: new Date(), _openid: OPENID,
        }
      });

      await db.collection('invite_records').doc(invite._id).update({
        data: { status: 'first_paid', inviter_reward: cfg.inviter_reward, invitee_reward: cfg.invitee_reward }
      });
    }
  }

  return { resultFileID: image.result_url };
};
```

- [ ] **Step 2：语法检查**

Run: `node --check cloudfunctions/downloadImage/index.js`
Expected: 无输出，exit 0

- [ ] **Step 3：手动验证**

云开发控制台 → 云端测试 downloadImage → 传入 `{ "imageId": "xxx" }` → 检查 token_records 流水 `balance_after` 与 users 表实际余额一致

- [ ] **Step 4：Commit**

```bash
git add cloudfunctions/downloadImage/index.js
git commit -m "fix(downloadImage): 扣费全流程 db.runTransaction 事务化"
```

---

### Task 8：paymentCallback / syncOrders 事务化 + 补"已 paid 未发币"

**Files:**
- Modify: `cloudfunctions/paymentCallback/index.js`
- Modify: `cloudfunctions/syncOrders/index.js`

**Interfaces:**
- Consumes: `orders` 表 `status`、`user_id`、`tokens`、`amount` 字段
- Produces: paymentCallback 事务内原子（update 订单 + inc 代币 + 写流水）+ 金额校验
- Produces: syncOrders 扫 `pending` 超时 + 扫 `paid` 但无对应 token_records 流水的订单

- [ ] **Step 1：替换 paymentCallback/index.js 全文**

```js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { outTradeNo, returnCode } = event;
  if (returnCode !== 'SUCCESS') return { errcode: -1, errmsg: '支付失败' };

  const orderRes = await db.collection('orders').doc(outTradeNo).get();
  const order = orderRes.data;
  if (!order) return { errcode: -1, errmsg: '订单不存在' };
  if (order.status === 'paid' || order.status === 'completed') return { errcode: 0 };

  try {
    await db.runTransaction(async transaction => {
      const txOrderRes = await transaction.collection('orders').doc(outTradeNo).get();
      const txOrder = txOrderRes.data;
      if (txOrder.status === 'paid' || txOrder.status === 'completed') return;

      await transaction.collection('orders').doc(outTradeNo).update({
        data: { status: 'paid', wx_order_id: event.transactionId || '' }
      });

      await transaction.collection('users').where({ _openid: txOrder.user_id }).update({
        data: { tokens: _.inc(txOrder.tokens) }
      });

      const userRes = await transaction.collection('users').where({ _openid: txOrder.user_id }).get();
      await transaction.collection('token_records').add({
        data: {
          user_id: txOrder.user_id, type: 'purchase', token_type: 'permanent',
          amount: txOrder.tokens, balance_after: userRes.data[0].tokens,
          related_order: outTradeNo, created_at: new Date(), _openid: txOrder.user_id,
        }
      });
    });
  } catch (txErr) {
    console.error('paymentCallback transaction error:', txErr);
    return { errcode: -1, errmsg: '发币失败，将自动重试' };
  }

  return { errcode: 0, errmsg: 'ok' };
};
```

- [ ] **Step 2：替换 syncOrders/index.js 全文**

```js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

async function fulfillOrder(order) {
  await db.runTransaction(async transaction => {
    const txOrderRes = await transaction.collection('orders').doc(order._id).get();
    if (txOrderRes.data.status === 'completed') return;

    if (txOrderRes.data.status !== 'paid') {
      await transaction.collection('orders').doc(order._id).update({
        data: { status: 'paid' }
      });
    }

    await transaction.collection('users').where({ _openid: order.user_id }).update({
      data: { tokens: _.inc(order.tokens) }
    });

    const userRes = await transaction.collection('users').where({ _openid: order.user_id }).get();
    await transaction.collection('token_records').add({
      data: {
        user_id: order.user_id, type: 'purchase', token_type: 'permanent',
        amount: order.tokens, balance_after: userRes.data[0].tokens,
        related_order: order._id, created_at: new Date(), _openid: order.user_id,
      }
    });

    await transaction.collection('orders').doc(order._id).update({
      data: { status: 'completed' }
    });
  });
}

exports.main = async (event, context) => {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  let fixed = 0;
  let synced = 0;

  const pendingRes = await db.collection('orders')
    .where({ status: 'pending', created_at: _.lt(fiveMinAgo) })
    .limit(50).get();
  synced += pendingRes.data.length;

  for (const order of pendingRes.data) {
    try {
      const payResult = await cloud.cloudPay.queryOrder({
        out_trade_no: order._id,
        sub_mch_id: '',
      });

      if (payResult.returnCode === 'SUCCESS' && payResult.tradeState === 'SUCCESS') {
        await fulfillOrder(order);
        fixed++;
      } else if (payResult.tradeState === 'NOTPAY' || payResult.tradeState === 'CLOSED') {
        await db.collection('orders').doc(order._id).update({
          data: { status: 'cancelled' }
        });
      }
    } catch (e) {
      console.error('syncOrders pending error for order', order._id, e.message);
    }
  }

  const paidNoStream = await db.collection('orders')
    .where({ status: 'paid' }).limit(50).get();
  synced += paidNoStream.data.length;

  for (const order of paidNoStream.data) {
    try {
      const streamRes = await db.collection('token_records')
        .where({ related_order: order._id, type: 'purchase' }).count();
      if (streamRes.total === 0) {
        await fulfillOrder(order);
        fixed++;
      }
    } catch (e) {
      console.error('syncOrders paid-no-stream error for order', order._id, e.message);
    }
  }

  return { synced, fixed };
};
```

- [ ] **Step 3：语法检查**

Run: `node --check cloudfunctions/paymentCallback/index.js`
Run: `node --check cloudfunctions/syncOrders/index.js`
Expected: 全部无输出，exit 0

- [ ] **Step 4：手动验证**

云开发控制台 → 手动创建一条 `status='paid'` 的 orders 记录（无对应 token_records）→ 调用 syncOrders → 检查该订单变为 `completed` + 用户代币增加 + 流水写入

- [ ] **Step 5：Commit**

```bash
git add cloudfunctions/paymentCallback/index.js cloudfunctions/syncOrders/index.js
git commit -m "fix: paymentCallback/syncOrders 事务化 + 补 paid-but-no-stream 扫描"
```

---

### Task 9：管理端服务端鉴权

**Files:**
- Create: `cloudfunctions/adminAction/index.js`
- Create: `cloudfunctions/adminAction/package.json`
- Create: `cloudfunctions/adminAction/config.json`
- Modify: `miniprogram/pages/admin/models/models.js`（所有 `db.collection` 写操作改走 adminAction）
- Modify: `miniprogram/pages/admin/settings/settings.js`（同上）
- Modify: `miniprogram/pages/admin/activities/activities.js`（同上）

**Interfaces:**
- Consumes: `users` 表 `role` 字段
- Produces: `adminAction({ action, collection, docId?, data? })` → `{ ok: true }` 或 `{ err: '无权限' }`

- [ ] **Step 1：创建 adminAction/index.js**

```js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const ALLOWED_COLLECTIONS = [
  'model_configs', 'pricing_config', 'subscribe_config',
  'invite_config', 'activities', 'token_packages', 'ad_config',
];

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { action, collection, docId, data } = event;

  const userRes = await db.collection('users').where({ _openid: OPENID }).get();
  if (userRes.data.length === 0 || userRes.data[0].role !== 'admin') {
    return { err: '无权限' };
  }

  if (!ALLOWED_COLLECTIONS.includes(collection)) {
    return { err: '不允许操作该集合' };
  }

  if (!['add', 'update', 'remove'].includes(action)) {
    return { err: '不支持的操作类型' };
  }

  try {
    if (action === 'add') {
      const res = await db.collection(collection).add({ data: { ...data, updated_at: new Date() } });
      return { ok: true, _id: res._id };
    }
    if (action === 'update') {
      await db.collection(collection).doc(docId).update({ data: { ...data, updated_at: new Date() } });
      return { ok: true };
    }
    if (action === 'remove') {
      await db.collection(collection).doc(docId).remove();
      return { ok: true };
    }
  } catch (e) {
    return { err: e.message };
  }
};
```

- [ ] **Step 2：创建 adminAction/package.json**

```json
{
  "name": "adminAction",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

- [ ] **Step 3：创建 adminAction/config.json**

```json
{
  "permissions": {
    "openapi": []
  }
}
```

- [ ] **Step 4：修改 models.js — 写操作改走 adminAction**

将 `models.js:36-43` 的 `toggleModel` 方法替换为：
```js
  async toggleModel(e) {
    const { id, active } = e.currentTarget.dataset;
    await callFunction('adminAction', {
      action: 'update', collection: 'model_configs', docId: id,
      data: { is_active: !active }
    });
    this.loadModels();
  },
```

将 `models.js:112-118` 的 saveModel 内部 try 块替换为：
```js
    try {
      if (editingId) {
        await callFunction('adminAction', {
          action: 'update', collection: 'model_configs', docId: editingId, data: payload
        });
      } else {
        payload.is_active = false;
        await callFunction('adminAction', {
          action: 'add', collection: 'model_configs', data: payload
        });
      }
      wx.showToast({ title: editingId ? '已更新' : '已添加', icon: 'success' });
      this.setData({ showForm: false });
      this.loadModels();
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
```

在 `models.js:1` 添加 `callFunction` 导入：
```js
const { callFunction } = require('../../../utils/cloud');
```

- [ ] **Step 5：修改 settings.js — 写操作改走 adminAction**

在 `settings.js:1` 添加：
```js
const { callFunction } = require('../../../utils/cloud');
```

将 `settings.js:40-46` 的 `updatePricing` 替换为：
```js
  async updatePricing(e) {
    const { id, field } = e.currentTarget.dataset;
    const value = parseInt(e.detail.value) || 0;
    await callFunction('adminAction', {
      action: 'update', collection: 'pricing_config', docId: id, data: { [field]: value }
    });
    wx.showToast({ title: '已更新', icon: 'success' });
  },
```

将 `settings.js:120-126` 的 `updateSub` 替换为：
```js
  async updateSub(e) {
    const { field } = e.currentTarget.dataset;
    const value = parseInt(e.detail.value) || 0;
    await callFunction('adminAction', {
      action: 'update', collection: 'subscribe_config',
      docId: this.data.subConfig._id, data: { [field]: value }
    });
    wx.showToast({ title: '已更新', icon: 'success' });
  },
```

将 `settings.js:129-135` 的 `updateInvite` 替换为：
```js
  async updateInvite(e) {
    const { field } = e.currentTarget.dataset;
    const value = parseInt(e.detail.value) || 0;
    await callFunction('adminAction', {
      action: 'update', collection: 'invite_config',
      docId: this.data.inviteConfig._id, data: { [field]: value }
    });
    wx.showToast({ title: '已更新', icon: 'success' });
  },
```

将 `settings.js:90-117` 的 `savePackage` 的 try 块替换为：
```js
    try {
      if (editingId) {
        await callFunction('adminAction', {
          action: 'update', collection: 'token_packages', docId: editingId, data: payload
        });
      } else {
        await callFunction('adminAction', {
          action: 'add', collection: 'token_packages',
          data: { ...payload, is_active: true, created_at: new Date() }
        });
      }
      wx.showToast({ title: editingId ? '已更新' : '已创建', icon: 'success' });
      this.setData({ showForm: false });
      this.loadAll();
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
```

将 `settings.js:49-57` 的 `updatePackage` 替换为：
```js
  async updatePackage(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.packages.find(p => p._id === id);
    await callFunction('adminAction', {
      action: 'update', collection: 'token_packages', docId: id,
      data: { is_active: !item.is_active }
    });
    this.loadAll();
  },
```

- [ ] **Step 6：语法检查**

Run: `node --check cloudfunctions/adminAction/index.js`
Run: `node --check miniprogram/pages/admin/models/models.js`
Run: `node --check miniprogram/pages/admin/settings/settings.js`
Expected: 全部无输出，exit 0

- [ ] **Step 7：手动验证**

云开发控制台 → 云端测试 adminAction → 传入 `{ "action": "update", "collection": "model_configs", "docId": "xxx", "data": { "is_active": true } }` → 以非 admin 用户调用 → 返回 `{ "err": "无权限" }`

- [ ] **Step 8：Commit**

```bash
git add cloudfunctions/adminAction/ miniprogram/pages/admin/models/models.js miniprogram/pages/admin/settings/settings.js
git commit -m "feat: adminAction 服务端鉴权云函数 + admin 页写操作迁移"
```

---

## 阶段三：设计缺失功能补齐（Task 10-13，互相独立，可并行）

### Task 10：模型配置「一键测试连通性」

**Files:**
- Create: `cloudfunctions/testModel/index.js`
- Create: `cloudfunctions/testModel/package.json`
- Create: `cloudfunctions/testModel/config.json`
- Modify: `miniprogram/pages/admin/models/models.wxml:19`
- Modify: `miniprogram/pages/admin/models/models.js`

**Interfaces:**
- Consumes: `model_configs` 表记录
- Produces: `testModel({ modelId }) → { ok: boolean, error?: string, latency?: number }`

- [ ] **Step 1：创建 testModel/index.js**

```js
const cloud = require('wx-server-sdk');
const axios = require('axios');
const FormData = require('form-data');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const TEST_IMAGE_URL = 'https://img.zcool.cn/community/01deed5b1c4cdaa8012165187c4e86.jpg@1280w_1l_2o_100sh.jpg';

exports.main = async (event, context) => {
  const { modelId } = event;
  const { OPENID } = cloud.getWXContext();

  const userRes = await db.collection('users').where({ _openid: OPENID }).get();
  if (userRes.data.length === 0 || userRes.data[0].role !== 'admin') {
    return { err: '无权限' };
  }

  const modelRes = await db.collection('model_configs').doc(modelId).get();
  const model = modelRes.data;
  if (!model) return { ok: false, error: '模型不存在' };

  const start = Date.now();
  try {
    if (model.api_secret) {
      const form = new FormData();
      form.append('api_key', model.api_key);
      form.append('api_secret', model.api_secret);
      form.append('image_url', TEST_IMAGE_URL);
      await axios.post(model.api_url, form, {
        headers: form.getHeaders(),
        timeout: 25000,
      });
    } else {
      await axios.post(model.api_url, {
        image_url: TEST_IMAGE_URL,
        task_type: 'test',
        ...(model.config || {}),
      }, {
        headers: { 'Authorization': 'Bearer ' + model.api_key, 'Content-Type': 'application/json' },
        timeout: 25000,
        responseType: 'arraybuffer',
      });
    }
    return { ok: true, latency: Date.now() - start };
  } catch (e) {
    return { ok: false, error: e.message, latency: Date.now() - start };
  }
};
```

- [ ] **Step 2：创建 testModel/package.json**

```json
{
  "name": "testModel",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3",
    "axios": "^1.6.0",
    "form-data": "^4.0.0"
  }
}
```

- [ ] **Step 3：创建 testModel/config.json**

```json
{
  "permissions": {
    "openapi": []
  }
}
```

- [ ] **Step 4：修改 models.wxml — 加测试按钮**

在 `models.wxml:19` 的 `<switch>` 后插入：
```xml
      <button class="weui-btn weui-btn_mini" data-id="{{item._id}}" catchtap="testModel">测试</button>
```

- [ ] **Step 5：修改 models.js — 加 testModel 方法**

在 `models.js` 的 `toggleModel` 方法后插入：
```js

  async testModel(e) {
    const { id } = e.currentTarget.dataset;
    wx.showLoading({ title: '测试中...' });
    try {
      const res = await callFunction('testModel', { modelId: id });
      wx.hideLoading();
      if (res.ok) {
        wx.showToast({ title: '连通成功 ' + res.latency + 'ms', icon: 'success' });
      } else {
        wx.showToast({ title: '失败: ' + (res.error || '未知错误'), icon: 'none', duration: 4000 });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '测试请求失败', icon: 'none' });
    }
  },
```

- [ ] **Step 6：语法检查**

Run: `node --check cloudfunctions/testModel/index.js`
Run: `node --check miniprogram/pages/admin/models/models.js`
Expected: 全部无输出，exit 0

- [ ] **Step 7：手动验证**

开发者工具 → models 页 → 某模型点"测试" → 可用模型返回"连通成功 Xms"，错配模型返回具体错误

- [ ] **Step 8：Commit**

```bash
git add cloudfunctions/testModel/ miniprogram/pages/admin/models/models.wxml miniprogram/pages/admin/models/models.js
git commit -m "feat: testModel 云函数 + models 页一键测试连通性"
```

---

### Task 11：settings 订阅 tab 加微信订阅消息模板 ID

**Files:**
- Modify: `miniprogram/pages/admin/settings/settings.wxml:36-40`

**Interfaces:**
- Consumes: `subscribe_config.wx_template_id` 字段
- Produces: settings 订阅 tab 新增 `wx_template_id` 输入框

- [ ] **Step 1：修改 settings.wxml — 订阅 tab 加模板 ID 输入框**

将 `settings.wxml:35-40` 的订阅 tab 内容替换为：
```xml
  <!-- 订阅 Tab -->
  <view wx:if="{{activeTab==='subscribe'}}" class="tab-content">
    <view class="setting-item"><text class="setting-label">月费(分)</text>
      <input class="setting-input" type="number" value="{{subConfig.price}}" data-field="price" bindblur="updateSub" /></view>
    <view class="setting-item"><text class="setting-label">每日赠送</text>
      <input class="setting-input" type="number" value="{{subConfig.daily_tokens}}" data-field="daily_tokens" bindblur="updateSub" /></view>
    <view class="setting-item"><text class="setting-label">订阅模板ID</text>
      <input class="setting-input" value="{{subConfig.wx_template_id}}" data-field="wx_template_id" bindblur="updateSubStr" placeholder="微信订阅消息模板ID" /></view>
  </view>
```

- [ ] **Step 2：修改 settings.js — 加 updateSubStr 方法（字符串字段）**

在 `settings.js` 的 `updateSub` 方法后插入：
```js

  async updateSubStr(e) {
    const { field } = e.currentTarget.dataset;
    const value = e.detail.value || '';
    const db = wx.cloud.database();
    await db.collection('subscribe_config').doc(this.data.subConfig._id).update({ data: { [field]: value } });
    wx.showToast({ title: '已更新', icon: 'success' });
  },
```

- [ ] **Step 3：语法检查**

Run: `node --check miniprogram/pages/admin/settings/settings.js`
Expected: 无输出，exit 0

- [ ] **Step 4：手动验证**

开发者工具 → settings → 订阅 tab → 能看到"订阅模板ID"输入框 → 填写保存 → 数据库 subscribe_config 记录含 `wx_template_id`

- [ ] **Step 5：Commit**

```bash
git add miniprogram/pages/admin/settings/settings.wxml miniprogram/pages/admin/settings/settings.js
git commit -m "feat: settings 订阅 tab 加 wx_template_id 配置"
```

---

### Task 12：processImage auto 分类综合调度

**Files:**
- Modify: `cloudfunctions/processImage/index.js:8-13`

**Interfaces:**
- Consumes: `model_configs` 表
- Produces: `getActiveModel('auto')` 内部转成第一个有启用模型的分类

- [ ] **Step 1：替换 processImage/index.js 的 getActiveModel 函数**

将 `processImage/index.js:8-13` 的：
```js
async function getActiveModel(category) {
  const res = await db.collection('model_configs')
    .where({ category, is_active: true }).limit(1).get();
  if (res.data.length === 0) throw new Error('没有可用的模型，请联系管理员');
  return res.data[0];
}
```
替换为：
```js
async function getActiveModel(category) {
  if (category === 'auto') {
    const priorities = ['beautify', 'color', 'style'];
    for (const cat of priorities) {
      const res = await db.collection('model_configs')
        .where({ category: cat, is_active: true }).limit(1).get();
      if (res.data.length > 0) return res.data[0];
    }
    throw new Error('没有可用的模型，请联系管理员');
  }
  const res = await db.collection('model_configs')
    .where({ category, is_active: true }).limit(1).get();
  if (res.data.length === 0) throw new Error('没有可用的模型，请联系管理员');
  return res.data[0];
}
```

- [ ] **Step 2：语法检查**

Run: `node --check cloudfunctions/processImage/index.js`
Expected: 无输出，exit 0

- [ ] **Step 3：手动验证**

云开发控制台 → 云端测试 processImage → 传入 `{ "imageFileID": "cloud://...", "processType": "auto", "subType": "auto_enhance" }` → 应走通（前提：至少一个分类有启用模型）

- [ ] **Step 4：Commit**

```bash
git add cloudfunctions/processImage/index.js
git commit -m "feat(processImage): auto 分类按 beautify>color>style 优先级调度"
```

---

### Task 13：preview 价格改查 pricing_config

**Files:**
- Modify: `miniprogram/pages/preview/preview.js:22-27`

**Interfaces:**
- Consumes: `pricing_config` 表 `category`、`tokens` 字段
- Produces: `loadPrice` 优先用数据库定价，fallback `DEFAULT_PRICES`

- [ ] **Step 1：替换 preview.js loadPrice 方法**

将 `preview.js:22-27` 的：
```js
  async loadPrice(imageId) {
    const db = wx.cloud.database();
    const img = await db.collection('images').doc(imageId).get();
    const price = DEFAULT_PRICES[img.data.process_type] || 2;
    this.setData({
      price,
      category: img.data.process_type,
      originalFileID: img.data.original_url
    });
  },
```
替换为：
```js
  async loadPrice(imageId) {
    const db = wx.cloud.database();
    const img = await db.collection('images').doc(imageId).get();
    const category = img.data.process_type;
    const originalFileID = img.data.original_url;

    let price = DEFAULT_PRICES[category] || 2;
    try {
      const priceRes = await db.collection('pricing_config')
        .where({ category }).get();
      if (priceRes.data.length > 0) {
        price = priceRes.data[0].tokens;
      }
    } catch (e) { /* fallback to DEFAULT_PRICES */ }

    this.setData({ price, category, originalFileID });
  },
```

- [ ] **Step 2：语法检查**

Run: `node --check miniprogram/pages/preview/preview.js`
Expected: 无输出，exit 0

- [ ] **Step 3：手动验证**

云开发控制台 → 修改 pricing_config 中 beautify 的 tokens 为 5 → 开发者工具进入 preview 页 → 显示"消耗 5 代币"

- [ ] **Step 4：Commit**

```bash
git add miniprogram/pages/preview/preview.js
git commit -m "fix(preview): loadPrice 改查 pricing_config，fallback DEFAULT_PRICES"
```

---

## 阶段四：新功能 — 看广告领永久代币（Task 14-16，串行）

### Task 14：广告领币云函数 rewardAd + initDB ad_config

**Files:**
- Create: `cloudfunctions/rewardAd/index.js`
- Create: `cloudfunctions/rewardAd/package.json`
- Create: `cloudfunctions/rewardAd/config.json`
- Modify: `cloudfunctions/initDB/index.js:6-10`

**Interfaces:**
- Consumes: `ad_config` 表 `daily_limit`、`reward_tokens`、`is_active`
- Consumes: `token_records` 表 `type='ad'` 记录（统计今日已领）
- Produces: `rewardAd({}) → { tokens: number, remainingToday: number }` 或 `{ err: string }`

- [ ] **Step 1：创建 rewardAd/index.js**

```js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function todayBeijing() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  const cfgRes = await db.collection('ad_config').limit(1).get();
  if (cfgRes.data.length === 0) return { err: '广告配置不存在' };
  const cfg = cfgRes.data[0];
  if (!cfg.is_active) return { err: '广告功能已关闭' };

  const today = todayBeijing();
  const todayStart = new Date(today + 'T00:00:00+08:00');
  const countRes = await db.collection('token_records')
    .where({
      _openid: OPENID,
      type: 'ad',
      created_at: _.gte(todayStart)
    }).count();

  if (countRes.total >= cfg.daily_limit) {
    return { err: '今日观看次数已达上限' };
  }

  const rewardTokens = cfg.reward_tokens || 2;

  await db.collection('users').where({ _openid: OPENID }).update({
    data: { tokens: _.inc(rewardTokens) }
  });

  const updatedUser = await db.collection('users').where({ _openid: OPENID }).get();
  await db.collection('token_records').add({
    data: {
      user_id: OPENID, type: 'ad', token_type: 'permanent',
      amount: rewardTokens, balance_after: updatedUser.data[0].tokens,
      created_at: new Date(), _openid: OPENID,
    }
  });

  return {
    tokens: rewardTokens,
    remainingToday: cfg.daily_limit - countRes.total - 1
  };
};
```

- [ ] **Step 2：创建 rewardAd/package.json**

```json
{
  "name": "rewardAd",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

- [ ] **Step 3：创建 rewardAd/config.json**

```json
{
  "permissions": {
    "openapi": []
  }
}
```

- [ ] **Step 4：修改 initDB/index.js — 加 ad_config 集合 + 默认数据**

将 `initDB/index.js:6-10` 的 `names` 数组替换为：
```js
  const names = [
    'users', 'token_records', 'orders', 'images', 'model_configs',
    'activities', 'user_activity_tokens', 'token_packages',
    'pricing_config', 'subscribe_config', 'invite_config', 'invite_records',
    'ad_config',
  ];
```

在 `initDB/index.js` 的 `default_invite` 插入块（约 line 61）后、`return results;` 前插入：
```js

  // 默认广告配置
  const ac = await db.collection('ad_config').count();
  if (ac.total === 0) {
    await db.collection('ad_config').add({
      data: {
        daily_limit: 3, reward_tokens: 2,
        is_active: true, updated_at: new Date(),
      }
    });
    results['default_ad_config'] = 'inserted';
  }
```

- [ ] **Step 5：语法检查**

Run: `node --check cloudfunctions/rewardAd/index.js`
Run: `node --check cloudfunctions/initDB/index.js`
Expected: 全部无输出，exit 0

- [ ] **Step 6：手动验证**

云开发控制台 → 运行 initDB → 检查 ad_config 集合已创建且含默认记录 → 云端测试 rewardAd → 传入 `{}` → 返回 `{ tokens: 2, remainingToday: 2 }` → 连续调用 3 次后返回 `{ err: '今日观看次数已达上限' }`

- [ ] **Step 7：Commit**

```bash
git add cloudfunctions/rewardAd/ cloudfunctions/initDB/index.js
git commit -m "feat: rewardAd 云函数 + initDB 加 ad_config 集合"
```

---

### Task 15：管理端 ad_config 配置入口

**Files:**
- Modify: `miniprogram/pages/admin/settings/settings.wxml:3-8`
- Modify: `miniprogram/pages/admin/settings/settings.js`

**Interfaces:**
- Consumes: `ad_config` 表 `daily_limit`、`reward_tokens`、`is_active`
- Produces: settings 页新增"广告"tab，可编辑三项配置

- [ ] **Step 1：修改 settings.wxml — tab 栏加"广告"**

将 `settings.wxml:3-8` 的 tab-bar 替换为：
```xml
  <view class="tab-bar">
    <view class="tab {{activeTab==='price'?'active':''}}" bindtap="switchTab" data-tab="price">消耗定价</view>
    <view class="tab {{activeTab==='packages'?'active':''}}" bindtap="switchTab" data-tab="packages">套餐</view>
    <view class="tab {{activeTab==='subscribe'?'active':''}}" bindtap="switchTab" data-tab="subscribe">订阅</view>
    <view class="tab {{activeTab==='invite'?'active':''}}" bindtap="switchTab" data-tab="invite">邀请</view>
    <view class="tab {{activeTab==='ad'?'active':''}}" bindtap="switchTab" data-tab="ad">广告</view>
  </view>
```

在邀请 tab `</view>` 后、`</view>` (container 闭合) 前插入：
```xml

  <!-- 广告 Tab -->
  <view wx:if="{{activeTab==='ad'}}" class="tab-content">
    <view class="setting-item"><text class="setting-label">每日可领次数</text>
      <input class="setting-input" type="number" value="{{adConfig.daily_limit}}" data-field="daily_limit" bindblur="updateAd" /></view>
    <view class="setting-item"><text class="setting-label">每次奖励代币</text>
      <input class="setting-input" type="number" value="{{adConfig.reward_tokens}}" data-field="reward_tokens" bindblur="updateAd" /></view>
    <view class="setting-item"><text class="setting-label">功能开关</text>
      <switch checked="{{adConfig.is_active}}" bindchange="toggleAdActive" /></view>
  </view>
```

- [ ] **Step 2：修改 settings.js — data 加 adConfig + loadAll 加载 + updateAd + toggleAdActive**

将 `settings.js:6` 的 data 替换为：
```js
    activeTab: 'price', pricingList: [], packages: [], subConfig: {}, inviteConfig: {}, adConfig: {},
    showForm: false, saving: false, editingId: '', formData: {},
```

将 `settings.js:15-29` 的 `loadAll` 替换为：
```js
  async loadAll() {
    const db = wx.cloud.database();
    const [pr, pk, sc, ic, ac] = await Promise.all([
      db.collection('pricing_config').get(),
      db.collection('token_packages').orderBy('price', 'asc').get(),
      db.collection('subscribe_config').limit(1).get(),
      db.collection('invite_config').limit(1).get(),
      db.collection('ad_config').limit(1).get(),
    ]);
    this.setData({
      pricingList: pr.data.map(p => ({ ...p, label: CATEGORY_LABELS[p.category] || p.category })),
      packages: pk.data.map(p => ({ ...p, priceInYuan: (p.price / 100).toFixed(2) })),
      subConfig: sc.data[0] || { price: 1999, daily_tokens: 5 },
      inviteConfig: ic.data[0] || { inviter_reward: 10, invitee_reward: 5 },
      adConfig: ac.data[0] || { daily_limit: 3, reward_tokens: 2, is_active: true },
    });
  },
```

在 `updateInvite` 方法后插入：
```js

  async updateAd(e) {
    const { field } = e.currentTarget.dataset;
    const value = parseInt(e.detail.value) || 0;
    const db = wx.cloud.database();
    await db.collection('ad_config').doc(this.data.adConfig._id).update({ data: { [field]: value, updated_at: new Date() } });
    wx.showToast({ title: '已更新', icon: 'success' });
  },

  async toggleAdActive(e) {
    const db = wx.cloud.database();
    await db.collection('ad_config').doc(this.data.adConfig._id).update({ data: { is_active: e.detail.value, updated_at: new Date() } });
    wx.showToast({ title: '已更新', icon: 'success' });
  },
```

- [ ] **Step 3：语法检查**

Run: `node --check miniprogram/pages/admin/settings/settings.js`
Expected: 无输出，exit 0

- [ ] **Step 4：手动验证**

开发者工具 → settings → 广告 tab → 能修改每日次数和奖励数 → 开关可切换 → 数据库 ad_config 更新

- [ ] **Step 5：Commit**

```bash
git add miniprogram/pages/admin/settings/settings.wxml miniprogram/pages/admin/settings/settings.js
git commit -m "feat: settings 广告 tab — ad_config 配置入口"
```

---

### Task 16：profile 页广告入口 + 前端广告组件

**Files:**
- Modify: `miniprogram/pages/profile/profile.wxml:37`
- Modify: `miniprogram/pages/profile/profile.js`

**Interfaces:**
- Consumes: `rewardAd` 云函数
- Produces: `watchAd()` → 播激励视频广告 → 看完回调 → 调 rewardAd → toast

- [ ] **Step 1：修改 profile.wxml — 加广告菜单项**

在 `profile.wxml:37`（邀请好友 `</view>` 后）插入：
```xml
    <view class="m-item" bindtap="watchAd">
      <text class="m-icon">📺</text><text class="m-text">看广告领代币<text class="m-sub">今日剩余 {{adRemaining}} 次</text></text><text class="m-arrow">›</text>
    </view>
```

- [ ] **Step 2：修改 profile.js — 加 adRemaining + watchAd + 广告初始化**

将 `profile.js:10` 的 data 替换为：
```js
  data: { userId: '', tokens: 0, activityTokens: 0, isAdmin: false, recentRecords: [], adRemaining: 0 },
```

在 `profile.js:1`（`const app = getApp();` 后）插入：
```js
const AD_UNIT_ID = 'adunit-xxxxxxxxxx';
let rewardedVideoAd = null;
```

将 `profile.js:12-21` 的 `onShow` 替换为：
```js
  onShow: async function () {
    const user = await app.getUserInfo();
    this.setData({
      userId: (user._id || '').slice(-8),
      tokens: user.tokens || 0,
      activityTokens: user.activity_tokens || 0,
      isAdmin: app.globalData.isAdmin,
    });
    this.loadRecords();
    this.loadAdRemaining();
  },
```

在 `profile.js` 的 `shareInvite`（或 `onShareAppMessage`，取决于 Task 2 是否已做）方法后插入：
```js

  async loadAdRemaining() {
    try {
      const db = wx.cloud.database();
      const cfgRes = await db.collection('ad_config').limit(1).get();
      if (cfgRes.data.length === 0 || !cfgRes.data[0].is_active) {
        this.setData({ adRemaining: 0 });
        return;
      }
      const cfg = cfgRes.data[0];
      const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
      const todayStart = new Date(today + 'T00:00:00+08:00');
      const _ = db.command;
      const countRes = await db.collection('token_records')
        .where({ _openid: '{openid}', type: 'ad', created_at: _.gte(todayStart) }).count();
      this.setData({ adRemaining: Math.max(0, cfg.daily_limit - countRes.total) });
    } catch (e) {
      this.setData({ adRemaining: 0 });
    }
  },

  watchAd() {
    if (!rewardedVideoAd) {
      try {
        rewardedVideoAd = wx.createRewardedVideoAd({ adUnitId: AD_UNIT_ID });
        rewardedVideoAd.onClose((res) => {
          if (res && res.isEnded) {
            this.handleAdComplete();
          } else {
            wx.showToast({ title: '需看完广告才能领取', icon: 'none' });
          }
        });
        rewardedVideoAd.onError((err) => {
          console.error('广告加载失败:', err);
          wx.showToast({ title: '广告加载失败，请稍后重试', icon: 'none' });
        });
      } catch (e) {
        wx.showToast({ title: '当前环境不支持广告', icon: 'none' });
        return;
      }
    }
    rewardedVideoAd.show().catch(() => {
      rewardedVideoAd.load().then(() => rewardedVideoAd.show());
    });
  },

  async handleAdComplete() {
    try {
      const res = await callFunction('rewardAd', {});
      if (res.err) {
        wx.showToast({ title: res.err, icon: 'none' });
        return;
      }
      wx.showToast({ title: '+' + res.tokens + ' 代币', icon: 'success' });
      this.setData({ adRemaining: res.remainingToday });
      app.refreshUserInfo();
      this.onShow();
    } catch (e) { /* toast already shown */ }
  },
```

- [ ] **Step 3：语法检查**

Run: `node --check miniprogram/pages/profile/profile.js`
Expected: 无输出，exit 0

- [ ] **Step 4：手动验证**

真机调试 → profile 页 → 点"看广告领代币" → 播完广告 → toast 显示"+2 代币" → 余额刷新 → 今日剩余次数减 1

- [ ] **Step 5：Commit**

```bash
git add miniprogram/pages/profile/profile.wxml miniprogram/pages/profile/profile.js
git commit -m "feat: profile 看广告领代币入口 + rewardedVideoAd + rewardAd 调用"
```

---

## 阶段五：健壮性收尾（Task 17-20，互相独立，可并行）

### Task 17：image-uploader 扩展名校验修复

**Files:**
- Modify: `miniprogram/utils/validators.js:3-9`
- Modify: `miniprogram/components/image-uploader/image-uploader.js:14-32`

**Interfaces:**
- Consumes: `chooseMedia` 回调的 `file.fileType` 字段
- Produces: `validateImage` 支持 `fileType` 参数，优先用 fileType 判断

- [ ] **Step 1：替换 validators.js validateImage 函数**

将 `validators.js:3-9` 的：
```js
function validateImage(file) {
  if (!file) return { valid: false, error: '请选择图片' };
  const ext = (file.name || file.path || '').split('.').pop().toLowerCase();
  if (!SUPPORTED_FORMATS.includes(ext)) return { valid: false, error: '仅支持 jpg/png/heic/webp 格式' };
  if (file.size > MAX_FILE_SIZE) return { valid: false, error: '图片不能超过 10MB' };
  return { valid: true };
}
```
替换为：
```js
function validateImage(file) {
  if (!file) return { valid: false, error: '请选择图片' };
  if (file.size > MAX_FILE_SIZE) return { valid: false, error: '图片不能超过 10MB' };

  if (file.fileType) {
    const ft = file.fileType.toLowerCase();
    if (ft === 'jpg' || ft === 'jpeg' || ft === 'png' || ft === 'heic' || ft === 'webp') {
      return { valid: true };
    }
    return { valid: false, error: '仅支持 jpg/png/heic/webp 格式' };
  }

  const ext = (file.name || file.path || '').split('.').pop().toLowerCase();
  if (!ext || ext === (file.name || file.path || '').toLowerCase()) {
    return { valid: true };
  }
  if (!SUPPORTED_FORMATS.includes(ext)) return { valid: false, error: '仅支持 jpg/png/heic/webp 格式' };
  return { valid: true };
}
```

- [ ] **Step 2：修改 image-uploader.js — chooseImage 传 fileType**

将 `image-uploader.js:19-25` 的：
```js
        success: (res) => {
          const file = res.tempFiles[0];
          const validation = validateImage({ name: file.tempFilePath, size: file.size });
          if (!validation.valid) {
            this.setData({ error: validation.error });
            return;
          }
```
替换为：
```js
        success: (res) => {
          const file = res.tempFiles[0];
          const validation = validateImage({
            name: file.tempFilePath,
            size: file.size,
            fileType: file.fileType || '',
          });
          if (!validation.valid) {
            this.setData({ error: validation.error });
            return;
          }
```

- [ ] **Step 3：语法检查**

Run: `node --check miniprogram/utils/validators.js`
Run: `node --check miniprogram/components/image-uploader/image-uploader.js`
Expected: 全部无输出，exit 0

- [ ] **Step 4：纯逻辑验证**

Run: `node -e "const SUPPORTED_FORMATS=['jpg','jpeg','png','heic','webp'];const MAX_FILE_SIZE=10*1024*1024;function validateImage(file){if(!file)return{valid:false,error:'请选择图片'};if(file.size>MAX_FILE_SIZE)return{valid:false,error:'图片不能超过 10MB'};if(file.fileType){const ft=file.fileType.toLowerCase();if(ft==='jpg'||ft==='jpeg'||ft==='png'||ft==='heic'||ft==='webp')return{valid:true};return{valid:false,error:'仅支持 jpg/png/heic/webp 格式'};}const ext=(file.name||file.path||'').split('.').pop().toLowerCase();if(!ext||ext===(file.name||file.path||'').toLowerCase())return{valid:true};if(!SUPPORTED_FORMATS.includes(ext))return{valid:false,error:'仅支持 jpg/png/heic/webp 格式'};return{valid:true};}console.assert(validateImage({name:'cloud://xxx',size:100,fileType:'jpg'}).valid,'camera jpg ok');console.assert(validateImage({name:'cloud://xxx',size:100,fileType:'png'}).valid,'camera png ok');console.assert(!validateImage({name:'cloud://xxx',size:100,fileType:'gif'}).valid,'gif rejected');console.assert(validateImage({name:'cloud://xxx',size:100}).valid,'no ext fallback pass');console.log('all pass');"`
Expected: `all pass`

- [ ] **Step 5：手动验证**

开发者工具 → 用模拟器拍照（camera）→ 上传 → 不应报"格式不支持"

- [ ] **Step 6：Commit**

```bash
git add miniprogram/utils/validators.js miniprogram/components/image-uploader/image-uploader.js
git commit -m "fix: image-uploader 扩展名校验支持 fileType + 无扩展名放行"
```

---

### Task 18：history N+1 性能 + expireTokens 分页

**Files:**
- Modify: `miniprogram/pages/history/history.js:13-35`
- Modify: `miniprogram/utils/cloud.js`
- Modify: `cloudfunctions/expireTokens/index.js:10-11`

**Interfaces:**
- Produces: `cloud.js` 新增 `getTempURLs(fileIDs)` 批量方法
- Produces: history 用 `getTempURLs` 批量获取
- Produces: expireTokens 用 `while` + `limit(100)` 分页

- [ ] **Step 1：修改 cloud.js — 加 getTempURLs 批量方法**

在 `cloud.js:28`（`getTempURL` 函数后）插入：
```js

async function getTempURLs(fileIDs) {
  if (!fileIDs || fileIDs.length === 0) return {};
  const res = await wx.cloud.getTempFileURL({ fileList: fileIDs });
  const map = {};
  for (const item of res.fileList) {
    if (item.tempFileURL) map[item.fileID] = item.tempFileURL;
  }
  return map;
}
```

将 `cloud.js:30` 的 `module.exports` 替换为：
```js
module.exports = { callFunction, uploadImage, getTempURL, getTempURLs };
```

- [ ] **Step 2：替换 history.js onShow 方法**

将 `history.js:1` 的 require 替换为：
```js
const { getTempURL, getTempURLs, callFunction } = require('../../utils/cloud');
```

将 `history.js:13-35` 的 `onShow` 替换为：
```js
  onShow: async function () {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    const res = await db.collection('images')
      .where({ _openid: '{openid}' })
      .orderBy('created_at', 'desc').limit(50).get();

    const fileIDs = res.data.map(img => img.preview_url).filter(Boolean);
    const urlMap = await getTempURLs(fileIDs);

    const list = res.data.map(img => ({
      ...img,
      thumbUrl: urlMap[img.preview_url] || '',
      label: CATEGORY_LABELS[img.process_type] || img.process_type,
      subLabel: findSubLabel(img.process_type, img.sub_type),
      created_at: img.created_at ? new Date(img.created_at).toLocaleDateString() : '',
    }));
    this.setData({ list, loading: false });
  },
```

- [ ] **Step 3：替换 expireTokens/index.js 查询逻辑 — 分页**

将 `expireTokens/index.js:10-13` 的：
```js
  const expiredRes = await db.collection('user_activity_tokens')
    .where({ expires_at: _.lt(now), tokens: _.gt(0) }).get();

  if (expiredRes.data.length === 0) return { processed: 0, expiredTokens: 0 };
```
替换为：
```js
  let allExpired = [];
  let batch;
  do {
    batch = await db.collection('user_activity_tokens')
      .where({ expires_at: _.lt(now), tokens: _.gt(0) })
      .limit(100).get();
    allExpired = allExpired.concat(batch.data);
  } while (batch.data.length === 100);

  if (allExpired.length === 0) return { processed: 0, expiredTokens: 0 };
  const expiredRes = { data: allExpired };
```

- [ ] **Step 4：语法检查**

Run: `node --check miniprogram/utils/cloud.js`
Run: `node --check miniprogram/pages/history/history.js`
Run: `node --check cloudfunctions/expireTokens/index.js`
Expected: 全部无输出，exit 0

- [ ] **Step 5：手动验证**

开发者工具 → history 页加载 50 条记录 → 观察网络请求：应只有 1 次 `getTempFileURL` 批量请求（而非 50 次串行）

- [ ] **Step 6：Commit**

```bash
git add miniprogram/utils/cloud.js miniprogram/pages/history/history.js cloudfunctions/expireTokens/index.js
git commit -m "perf: history 批量 getTempFileURL + expireTokens 分页 limit(100)"
```

---

### Task 19：initDB 建索引 + 默认套餐

**Files:**
- Modify: `cloudfunctions/initDB/index.js`

**Interfaces:**
- Produces: 4 个数据库索引 + 3 条默认 `token_packages` 记录

- [ ] **Step 1：在 initDB/index.js 的 return results 前插入索引创建 + 默认套餐**

在 `initDB/index.js` 的 `return results;` 前插入：
```js

  // 建索引（幂等：已存在则忽略）
  const indexes = [
    { collection: 'user_activity_tokens', name: 'idx_user_activity', fields: [{ fieldPath: 'user_id', order: 'asc' }, { fieldPath: 'activity_id', order: 'asc' }], unique: true },
    { collection: 'orders', name: 'idx_status_created', fields: [{ fieldPath: 'status', order: 'asc' }, { fieldPath: 'created_at', order: 'asc' }] },
    { collection: 'invite_records', name: 'idx_invitee', fields: [{ fieldPath: 'invitee_openid', order: 'asc' }] },
    { collection: 'token_records', name: 'idx_user_created', fields: [{ fieldPath: 'user_id', order: 'asc' }, { fieldPath: 'created_at', order: 'desc' }] },
  ];
  for (const idx of indexes) {
    try {
      await db.collection(idx.collection).createIndex({
        name: idx.name,
        unique: !!idx.unique,
        keys: idx.fields.map(f => ({ fieldName: f.fieldPath, order: f.order })),
      });
      results['index_' + idx.name] = 'created';
    } catch (e) {
      results['index_' + idx.name] = e.errCode === -1 ? 'exists' : 'error: ' + e.message;
    }
  }

  // 默认充值套餐
  const tpCount = await db.collection('token_packages').count();
  if (tpCount.total === 0) {
    const packages = [
      { name: '50代币', price: 600, tokens: 50, bonus: 0, is_active: true },
      { name: '200+20代币', price: 1990, tokens: 200, bonus: 20, is_active: true },
      { name: '800+100代币', price: 6800, tokens: 800, bonus: 100, is_active: true },
    ];
    for (const pkg of packages) {
      await db.collection('token_packages').add({
        data: { ...pkg, created_at: new Date() }
      });
    }
    results['default_packages'] = 'inserted 3';
  }
```

- [ ] **Step 2：语法检查**

Run: `node --check cloudfunctions/initDB/index.js`
Expected: 无输出，exit 0

- [ ] **Step 3：手动验证**

云开发控制台 → 运行 initDB → 检查返回结果含 `index_idx_user_activity: 'created'` 等 → 数据库 token_packages 集合含 3 条默认套餐

- [ ] **Step 4：Commit**

```bash
git add cloudfunctions/initDB/index.js
git commit -m "feat(initDB): 建 4 个索引 + 插入 3 条默认充值套餐"
```

---

### Task 20：models 页分组去掉 auto + editModel catch

**Files:**
- Modify: `miniprogram/pages/admin/models/models.js:25-33`
- Modify: `miniprogram/pages/admin/models/models.js:58-71`

**Interfaces:**
- Consumes: `CATEGORIES` 常量
- Produces: `loadModels` 过滤掉 `auto`；`editModel` 加 `.catch`

- [ ] **Step 1：替换 models.js loadModels 方法**

将 `models.js:25-33` 的：
```js
  async loadModels() {
    const db = wx.cloud.database();
    const res = await db.collection('model_configs').get();
    const categories = CATEGORIES.map(key => ({
      key, label: CATEGORY_LABELS[key],
      models: res.data.filter(m => m.category === key),
    }));
    this.setData({ categories });
  },
```
替换为：
```js
  async loadModels() {
    const db = wx.cloud.database();
    const res = await db.collection('model_configs').get();
    const categories = CATEGORIES.filter(c => c !== 'auto').map(key => ({
      key, label: CATEGORY_LABELS[key],
      models: res.data.filter(m => m.category === key),
    }));
    this.setData({ categories });
  },
```

- [ ] **Step 2：替换 models.js editModel 方法**

将 `models.js:58-71` 的：
```js
  editModel(e) {
    const id = e.currentTarget.dataset.id;
    const db = wx.cloud.database();
    db.collection('model_configs').doc(id).get().then(res => {
      const m = res.data;
      const idx = this.data.categoryOptions.findIndex(c => c.key === m.category);
      this.setData({
        showForm: true, editingId: id,
        formCategoryIdx: idx >= 0 ? idx : 0,
        formData: { name: m.name, api_url: m.api_url || '', api_key: m.api_key || '', api_secret: m.api_secret || '', config: m.config || {} },
        formConfigText: JSON.stringify(m.config || {}, null, 2),
      });
    });
  },
```
替换为：
```js
  editModel(e) {
    const id = e.currentTarget.dataset.id;
    const db = wx.cloud.database();
    db.collection('model_configs').doc(id).get().then(res => {
      const m = res.data;
      const idx = this.data.categoryOptions.findIndex(c => c.key === m.category);
      this.setData({
        showForm: true, editingId: id,
        formCategoryIdx: idx >= 0 ? idx : 0,
        formData: { name: m.name, api_url: m.api_url || '', api_key: m.api_key || '', api_secret: m.api_secret || '', config: m.config || {} },
        formConfigText: JSON.stringify(m.config || {}, null, 2),
      });
    }).catch(err => {
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },
```

- [ ] **Step 3：语法检查**

Run: `node --check miniprogram/pages/admin/models/models.js`
Expected: 无输出，exit 0

- [ ] **Step 4：手动验证**

开发者工具 → models 页 → 只显示三大分类（人像美化/色彩画质/风格转换），无"一键美化"分组 → 点编辑某模型 → 正常弹出表单

- [ ] **Step 5：Commit**

```bash
git add miniprogram/pages/admin/models/models.js
git commit -m "fix(models): 过滤 auto 分类 + editModel 加 catch"
```

---

## 自检清单

### 规格覆盖

| 需求 | 任务 | 状态 |
|---|---|---|
| preview 重新处理路径 | Task 1 | ✅ 有完整代码 |
| 邀请分享可触发 | Task 2 + Task 6 | ✅ button open-type + inviter 传参 |
| history 重新处理入口 | Task 3 | ✅ 按钮 + process fileID + showExternal |
| 下载 loading 状态正确 | Task 4 | ✅ 所有 fail 分支重置 + 权限引导 |
| 每日签到时区正确 | Task 5 | ✅ todayBeijing() YYYY-MM-DD |
| 扣费事务化 | Task 7 | ✅ db.runTransaction 包裹全流程 |
| 支付补单可靠 | Task 8 | ✅ 事务化 + paid-but-no-stream 扫描 |
| 管理端鉴权 | Task 9 | ✅ adminAction 云函数 + 白名单集合 |
| 模型测试连通性 | Task 10 | ✅ testModel 云函数 + 测试按钮 |
| 订阅模板 ID 配置 | Task 11 | ✅ settings 订阅 tab 输入框 |
| 一键美化可用 | Task 12 | ✅ auto → beautify>color>style 优先级 |
| 预览价格正确 | Task 13 | ✅ 查 pricing_config + fallback |
| 看广告领永久代币 | Task 14 + 15 + 16 | ✅ 云函数 + 管理端 + 用户端 |
| 图片校验健壮 | Task 17 | ✅ fileType 优先 + 无扩展名放行 |
| 性能 + 过期扫描 | Task 18 | ✅ 批量 URL + while limit(100) |
| 索引 + 默认套餐 | Task 19 | ✅ 4 索引 + 3 默认套餐 |
| models 分组正确 | Task 20 | ✅ filter auto + catch |

### 占位符扫描

- Task 16 `AD_UNIT_ID = 'adunit-xxxxxxxxxx'`：需在微信小程序后台申请广告单元后替换
- Task 8 `syncOrders` 的 `sub_mch_id: ''`：需填入实际商户号（原代码即如此）
- 无 TBD / TODO / "implement later" / "fill in details"

### 类型一致性

- `callFunction('adminAction', { action, collection, docId, data })`：Task 9 定义，Task 9 Step 4/5 使用 — 签名一致 ✅
- `callFunction('rewardAd', {})`：Task 14 定义，Task 16 使用 — 签名一致 ✅
- `callFunction('testModel', { modelId })`：Task 10 定义，Task 10 Step 5 使用 — 签名一致 ✅
- `getTempURLs(fileIDs)`：Task 18 Step 1 定义于 cloud.js，Task 18 Step 2 使用于 history.js — 签名一致 ✅
- `todayBeijing()`：Task 5 定义于 dailyCheckIn，Task 14 独立定义于 rewardAd — 两处独立实现，无冲突 ✅
- `showExternal(fileID)`：Task 3 Step 5 定义于 image-uploader，Task 3 Step 3 调用于 process.js — 签名一致 ✅

---

## 执行顺序与依赖

```
阶段一（Task 1-6）：阻断修复，互相独立，可并行
   ↓
阶段二（Task 7-9）：资金安全，Task 7/8 共享事务模式，建议串行
   ↓
阶段三（Task 10-13）：功能补齐，互相独立，可并行
   ↓
阶段四（Task 14-16）：广告新功能，串行（云函数→管理端→用户端）
   ↓
阶段五（Task 17-20）：健壮性收尾，互相独立，可并行
```

**关键依赖：**
- Task 3 依赖 Task 1（preview retry 改 redirectTo 后 process 页需接收 fileID）
- Task 15/16 依赖 Task 14（rewardAd 云函数必须先存在）
- Task 9 的 adminAction 云函数需先部署，Task 9 Step 4/5 的前端改造才能生效
- Task 19 的索引创建应在 Task 7/8 事务化之后（事务依赖索引保证一致性）

---

## 执行选择

**Plan complete and saved to `docs/superpowers/plans/2026-07-08-fix-and-ad-reward-revised.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
