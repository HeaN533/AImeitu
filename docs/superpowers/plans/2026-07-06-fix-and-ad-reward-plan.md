# AI 图片美化小程序 — 修复与功能增强计划

> 创建日期：2026-07-06
> 状态：待执行
> 基线：通读审查报告（2026-07-06）+ processImage sharp 崩溃修复已完成
> 执行方式：按任务顺序逐个实现，每个任务完成后 commit

## 背景

通读审查发现项目整体约 75% 完成，核心流程可跑通但存在多个真实 bug、2 个设计明确要求的功能缺失、若干并发/事务/安全缺陷。同时产品方新增需求：**用户观看广告可领取永久代币**。本计划整合"修复优先级建议"与"广告领币新功能"，分阶段执行。

## 前置已完成项（本次会话已做）

- ✅ `cloudfunctions/processImage` 移除 sharp 依赖，预览图复用结果图，水印改前端 CSS 叠加（解决 Node 16 下 sharp 模块加载崩溃）
- ✅ `cloudfunctions/processImage` `callAIModel` 兼容 Face++ 双密钥 form-data 鉴权
- ✅ `miniprogram/pages/admin/models` 表单增加 `api_secret` 字段
- ✅ `miniprogram/utils/cloud.js` `callFunction` 错误不再统一吞成"网络异常"，显示真实错误
- ✅ 新建 `.gitignore`，忽略 `database_export-*.json` 等含密钥文件

---

## 阶段一：阻断功能修复（优先级最高，让核心闭环真正跑通）

### Task 1：preview 页"重新处理"走不通

**问题**：`preview.js:51` `retry()` 用 `wx.navigateBack()`，但 process 页是用 `wx.redirectTo` 跳来的（已销毁），无页可回，"不满意重新处理不扣费"路径断裂。

**文件**：`miniprogram/pages/preview/preview.js`

**改动**：
- `retry()` 改为 `wx.redirectTo` 回 process 页
- 由于 process 页是按 `category` 进入的，重新处理应携带原分类。但 preview 页当前没有 original fileID 和 category 信息（`onLoad` 只收了 imageId、previewFileID）
- 方案：在 `onLoad` 里从 `images` 表查出 `original_url` 和 `process_type`，retry 时携带这两个参数跳回 process
- `loadPrice` 已经在查 images 表，把查询结果缓存到 data，复用

**接口**：
- `onLoad` 查 images 表，存 `originalFileID`、`category` 到 data
- `retry()` → `wx.redirectTo({ url: '/pages/process/process?category=' + category + '&fileID=' + originalFileID })`
- process 页 `onLoad` 需支持接收 `fileID` 参数（见 Task 3）

- [ ] 实现
- [ ] 验证：preview 点"重新处理"能回到 process 页且原图已带入

---

### Task 2：profile 邀请分享走不通

**问题**：`profile.js:60` `shareInvite()` 在 `bindtap` 里调 `wx.shareAppMessage`，该 API 必须由 `<button open-type="share">` 触发，普通 tap 调用无效。

**文件**：`miniprogram/pages/profile/profile.wxml`、`miniprogram/pages/profile/profile.js`

**改动**：
- WXML：把"邀请好友"菜单项从 `<view bindtap="shareInvite">` 改为 `<button open-type="share">`，样式上仍保持菜单项外观（用 `button` + 自定义 class 模拟）
- JS：删掉 `shareInvite` 方法，新增 `onShareAppMessage` 页面方法返回分享配置
- path 里的 `inviter` 参数改为传**完整 openid**（而非 `userId` 截断后 8 位），因为 `checkInvite` 期望的是能定位到 users 记录的 `inviter_id`（即 users._id）

**接口**：
- `onShareAppMessage()` → `{ title, path: '/pages/index/index?inviter=' + 完整用户标识 }`
- 邀请人标识用 `user._id`（完整），与 `checkInvite` 的 `inviter_id` 一致

- [ ] 实现
- [ ] 验证：点邀请按钮能弹出分享面板，分享路径含完整 inviter

---

### Task 3：history "重新处理同一原图选不同效果"未实现

**问题**：`history` 页每条记录只有"下载"按钮，没有"重新处理"入口。设计文档 3.1.3 明确要求。

**文件**：`miniprogram/pages/history/history.wxml`、`miniprogram/pages/history/history.js`、`miniprogram/pages/process/process.js`

**改动**：
- history WXML：每条记录增加"重新处理"按钮（与"下载"并排）
- history JS：新增 `reprocess(e)` 方法，取该记录的 `original_url` 和 `process_type`，`wx.navigateTo` 到 process 页携带 `category` + `fileID`
- process JS：`onLoad` 支持 `options.fileID`，若存在则直接 `setData({ fileID })` 跳过上传步骤（image-uploader 已上传状态）
  - 注意：image-uploader 当前是组件内部状态，process 页接收 fileID 后需通过组件的 `setData` 或 properties 把图片显示出来。方案：给 image-uploader 加一个 `externalFileID` property 或暴露 `setExternal` 方法，process 页 onLoad 调用它

**接口**：
- process `onLoad(options)`：`options.category` + 可选 `options.fileID`
- image-uploader：新增方法 `showExternal(fileID, tempPath)` 供父页面调用

- [ ] 实现
- [ ] 验证：history 点"重新处理"能跳到 process 页，原图已显示，可选别的效果

---

### Task 4：preview / history 下载按钮 loading 状态不重置

**问题**：`preview.js:29` download 中 `wx.downloadFile` / `saveImageToPhotosAlbum` 失败时 `downloading` 不重置，按钮永久卡 loading。history 同理。

**文件**：`miniprogram/pages/preview/preview.js`、`miniprogram/pages/history/history.js`

**改动**：
- 在所有 fail 分支（`wx.downloadFile.fail`、`saveImageToPhotosAlbum.fail`、以及 success 链路里的 saveImage fail）都 `setData({ downloading: false })`
- `saveImageToPhotosAlbum` 失败时检查 `scope.writePhotosAlbum` 权限，若拒绝则 `wx.openSetting` 引导用户去设置
- 用 `finally` 或在每个回调末尾统一重置

- [ ] 实现
- [ ] 验证：相册权限拒绝时按钮不卡死，且弹出设置引导

---

### Task 5：dailyCheckIn 时区 bug

**问题**：`dailyCheckIn.js:15` 用 `new Date().toDateString()`，云函数运行在 UTC，中国用户 UTC 0-8 点 `toDateString()` 会变成"昨天"，导致领不到或重复领。

**文件**：`cloudfunctions/dailyCheckIn/index.js`

**改动**：
- 改用固定时区计算"今天"。方案：用 `new Date(Date.now() + 8*3600*1000)` 取北京时间，再 `toISOString().slice(0,10)` 得到 `YYYY-MM-DD` 字符串作为 today
- `claimedDate` 同样转换成 `YYYY-MM-DD` 比对
- 这样无论云函数在哪个 UTC 时区，"今天"都以北京时间为准

**接口**：
- 抽一个 `todayBeijing()` 辅助函数返回 `YYYY-MM-DD`
- 比对改为字符串比对

- [ ] 实现
- [ ] 验证：UTC 0 点附近调用能正确判断"今日已领"

---

### Task 6：app.js 邀请参数未传入 checkInvite

**问题**：`app.js:14` `wx.cloud.callFunction({ name: 'checkInvite', data: {} })` 永远传空 data，邀请场景参数 `inviter` 从未被解析传入，邀请绑定链路实际是断的。

**文件**：`miniprogram/app.js`

**改动**：
- `getUserInfo` 改为接收 `inviterId` 参数
- `onLaunch` 里从 `wx.getLaunchOptionsSync()` 或 `wx.getEnterOptionsSync()` 取 query 参数 `inviter`，传给 `checkInvite`
- 注意：`onLaunch` 时机早于 `getUserInfo`，需把 launch options 缓存到 globalData，`getUserInfo` 时取出
- `checkInvite` 云函数已支持 `event.inviter_id`，无需改云函数

**接口**：
- `app.js` `onLaunch`：缓存 `launchOptions.query.inviter` 到 `globalData.inviterId`
- `getUserInfo`：`callFunction('checkInvite', { inviter_id: this.globalData.inviterId })`

- [ ] 实现
- [ ] 验证：带 `?inviter=xxx` 进入小程序，users 表 `inviter_id` 正确写入

---

## 阶段二：数据与资金安全（事务化 + 签名校验）

### Task 7：downloadImage 扣费事务化

**问题**：`downloadImage` 扣费多步非原子（读余额→逐条扣活动代币→扣永久→更新冗余→写流水→标记下载），并发下双扣路径紊乱；流水 `balance_after` 用旧快照不准。

**文件**：`cloudfunctions/downloadImage/index.js`

**改动**：
- 用云数据库 `db.serverDate()` + 事务（`db.runTransaction`）包裹扣费全流程
- 或退一步用条件更新：`where({ tokens: _.gte(remaining) })` 做乐观锁
- 流水 `balance_after` 改为事务内扣费后重新读一次真实值
- `token_records.token_type` 当前固定 `permanent`，改为：若 `activityDeducted > 0` 且 `permanentDeducted === 0` 标 `temporary`，混合则拆两条流水（或简化为标 `mixed`，但设计 schema 是 permanent/temporary 二选一，建议拆两条）

**接口**：
- 整个扣费逻辑包进 `db.runTransaction(async tx => { ... })`
- 事务内所有读写用 `tx.collection(...)` 而非 `db.collection(...)`

- [ ] 实现
- [ ] 验证：并发两次下载同一未付费图，只成功一次，代币只扣一次

---

### Task 8：paymentCallback / syncOrders 事务化 + 补"已 paid 未发币"补救

**问题**：先 `update status=paid` 再 `inc tokens` 非事务，中途失败会"已 paid 未发币"，syncOrders 只扫 pending 不扫这种半完成状态，用户付了钱拿不到币。

**文件**：`cloudfunctions/paymentCallback/index.js`、`cloudfunctions/syncOrders/index.js`

**改动**：
- 两函数的发币逻辑都用 `db.runTransaction` 包裹（update 订单状态 + inc 代币 + 写流水 三步原子）
- paymentCallback 增加签名/金额校验：核对 `event.transactionId` 存在性、订单金额与 `order.amount` 一致（云开发 cloudPay 回调通常已验签，但代码层加金额一致性校验作为二次防护）
- syncOrders 扫描范围扩大：除 `status='pending'` 超时订单外，也扫 `status='paid'` 但 `token_records` 里无对应 `related_order` 流水的订单（即"已 paid 未发币"），补发代币
- 字段名核对：`transactionId` vs `transaction_id`、`returnCode` vs `return_code`，按云开发 cloudPay 实际返回字段调整

**接口**：
- paymentCallback：事务 + 金额校验
- syncOrders：扫 pending + 扫 paid-but-no-stream

- [ ] 实现
- [ ] 验证：模拟回调中途失败，syncOrders 能补发代币

---

### Task 9：管理端服务端鉴权

**问题**：所有管理端写库走前端 SDK，`role==='admin'` 只在前端 globalData 判一次，无服务端鉴权。云数据库权限若设为"所有用户可读写"则任何用户都能改配置。

**文件**：新增 `cloudfunctions/adminAction/index.js`，各 admin 页面

**改动**：
- 新增 `adminAction` 云函数作为管理端所有写操作的统一入口，内部校验 `cloud.getWXContext().OPENID` 对应 users.role === 'admin'
- 管理端各页面的 `db.collection(...).add/update/remove` 改为 `callFunction('adminAction', { action, collection, docId, data })`
- 云数据库权限规则改为"仅创建者可读写"+ 管理员云函数可读写（通过服务端 SDK 绕过权限规则用 `db.runTransaction` 或管理员身份）
- admin 页 `onShow` 先 `await app.getUserInfo()` 再判断 isAdmin，避免直链误踢

**接口**：
- `adminAction({ action: 'update'|'add'|'remove', collection, docId?, data? })`
- 内部校验 role，非 admin 返回 `{ err: '无权限' }`

- [ ] 实现
- [ ] 验证：普通用户调用 adminAction 被拒

---

## 阶段三：设计缺失功能补齐

### Task 10：模型配置「一键测试连通性」

**问题**：设计 3.4.1 明确要求"一键测试连通性：发测试图验证 API 是否可用"，完全未实现。

**文件**：新增 `cloudfunctions/testModel/index.js`、`cloudfunctions/testModel/package.json`、`cloudfunctions/testModel/config.json`；`miniprogram/pages/admin/models/models.wxml`、`models.js`

**改动**：
- 新增 `testModel` 云函数：接收 `{ modelId }`，读取该模型配置，用一张内置测试图（云存储固定 fileID 或 base64 内嵌）调用 `callAIModel`，返回 `{ ok: true, latency }` 或 `{ ok: false, error }`
- models WXML：每条模型记录加"测试"按钮
- models JS：`testModel(e)` 调云函数，显示结果 toast

**接口**：
- `testModel({ modelId }) → { ok: boolean, error?: string, latency?: number }`

- [ ] 实现
- [ ] 验证：点测试按钮，可用模型返回 ok，错配模型返回错误

---

### Task 11：settings 订阅 tab 加微信订阅消息模板 ID

**问题**：设计 3.4.4 要求"微信订阅消息模板 ID 配置"，DB 有 `wx_template_id` 字段但 settings 页没暴露。

**文件**：`miniprogram/pages/admin/settings/settings.wxml`、`settings.js`

**改动**：
- settings WXML subscribe tab 增加 `wx_template_id` 输入框
- settings JS `updateSub` 已是通用逻辑，字段名加上即可（`data-field="wx_template_id"`）

- [ ] 实现
- [ ] 验证：能编辑保存模板 ID

---

### Task 12：processImage auto 分类综合调度

**问题**：`processImage` 按 `category='auto'` 查 model_configs 永远查不到（auto 不配模型），一键美化功能不可用。设计明确 auto 应综合调用各分类启用模型。

**文件**：`cloudfunctions/processImage/index.js`

**改动**：
- `getActiveModel` 改造：当 `category === 'auto'` 时，分别查 `beautify/color/style` 各分类启用模型，串行或并行调用，合并结果（或取第一个成功的结果）
- MVP 简化方案：auto 调用 beautify 的启用模型（人像美化是最常见需求），或按优先级 beautify > color > style 取第一个有启用模型的分类
- 在 `callAIModel` 之前加判断：若 `processType === 'auto'`，重写为实际调用的分类

**接口**：
- `getActiveModel('auto')` → 内部转成 `beautify`（或第一个有启用模型的分类）

- [ ] 实现
- [ ] 验证：首页点"一键美化"能走通

---

### Task 13：preview 价格改查 pricing_config

**问题**：`preview.js:25` `loadPrice` 用本地 `DEFAULT_PRICES` 而非 `pricing_config`，后台改价前端不感知，显示与实际扣费可能不符。

**文件**：`miniprogram/pages/preview/preview.js`

**改动**：
- `loadPrice` 改为查 `pricing_config` where `category === img.process_type`
- fallback 仍用 `DEFAULT_PRICES`（数据库无配置时兜底）

- [ ] 实现
- [ ] 验证：后台改定价后预览页显示更新

---

## 阶段四：新功能 — 看广告领永久代币

### Task 14：广告领币云函数 rewardAd

**需求**：用户观看广告完成后，赠送永久代币。代币永久性质，不过期。

**设计**：
- 每日限领次数（防滥用，默认 3 次/天，后台可配）
- 每次奖励数量后台可配（默认 2 代币）
- 代币类型：永久（写入 `users.tokens`，不写 `user_activity_tokens`）
- 流水类型：新增 `token_records.type = 'ad'`
- 防作弊：前端调用 `wx.createRewardedVideoAd` 播完广告后回调，但前端回调可被篡改，需云函数侧做日限校验（当天已领次数 < 配置上限）

**文件**：
- 新增 `cloudfunctions/rewardAd/index.js`、`package.json`、`config.json`
- 修改 `cloudfunctions/initDB/index.js`（新增 `ad_config` 集合 + 默认配置）
- 修改设计文档 schema 部分（补充 `ad_config` 集合、`token_records.type` 增加 `'ad'`）

**数据模型** — 新增 `ad_config` 集合：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| _id | string | 自动 | — |
| daily_limit | number | 是 | 每日可领次数（默认 3） |
| reward_tokens | number | 是 | 每次奖励代币数（默认 2） |
| is_active | boolean | 是 | 功能开关 |
| updated_at | date | 是 | 更新时间 |

**接口**：
- `rewardAd({}) → { tokens, remainingToday }`
  - 校验功能开关 `is_active`
  - 查当天已领次数（`token_records` where `user_id=OPENID, type='ad', created_at >= 今日0点` count）
  - 若 >= `daily_limit` 返回 `{ err: '今日观看次数已达上限' }`
  - 否则 inc `users.tokens`，写 `token_records` `{ type:'ad', token_type:'permanent', amount: reward_tokens, balance_after: 新余额 }`
  - 返回本次奖励数 + 今日剩余次数

**initDB 补充**：
- 新增集合 `ad_config`（加入 names 数组）
- 默认数据：`{ daily_limit: 3, reward_tokens: 2, is_active: true, updated_at: new Date() }`

- [ ] 实现 rewardAd 云函数
- [ ] initDB 加 ad_config
- [ ] 验证：云函数测试调用返回 tokens，users.tokens 增加，流水写入

---

### Task 15：管理端 ad_config 配置入口

**文件**：`miniprogram/pages/admin/settings/settings.wxml`、`settings.js`

**改动**：
- settings 页增加"广告"tab（与定价/套餐/订阅/邀请并列）
- 渲染 `daily_limit`、`reward_tokens`、`is_active` 三项可编辑
- `loadAll` 加载 `ad_config`
- 新增 `updateAd` 方法保存

**接口**：
- settings `loadAll` 增加 `db.collection('ad_config').limit(1).get()`
- `updateAd(e)` 写库

- [ ] 实现
- [ ] 验证：能修改每日次数和奖励数

---

### Task 16：profile 页广告入口 + 前端广告组件

**文件**：`miniprogram/pages/profile/profile.wxml`、`profile.js`、`profile.json`

**改动**：
- profile WXML：菜单加"📺 看广告领代币"项，显示今日剩余次数
- profile JS：
  - `onShow` 加载今日剩余次数（查 `token_records` 或调 rewardAd 的预检）
  - `watchAd()` 方法：创建 `wx.createRewardedVideoAd`，监听 `onClose` 回调，若 `res.isEnded` 为 true（看完）则调 `rewardAd` 云函数领币
  - 广告单元 ID 用 `wx-ad-unit-xxx`（需在 mp 后台申请，先留占位常量）
  - 领币成功后 `refreshUserInfo` + toast
- profile.json：无需额外配置（createRewardedVideoAd 是 API 非组件）

**接口**：
- `watchAd()` → 播广告 → 看完调 `callFunction('rewardAd', {})` → toast `+N 代币`

**注意**：
- 开发期/未配置广告单元 ID 时，`wx.createRewardedVideoAd` 会失败，需 try/catch 并提示"广告加载失败"
- 真机调试可用 `wx.createRewardedVideoAd({ adUnitId: 'test-xxx' })` 测试单元

- [ ] 实现
- [ ] 验证：真机点广告入口，播完领到代币，余额刷新

---

## 阶段五：健壮性收尾

### Task 17：image-uploader 扩展名校验修复

**问题**：`image-uploader.js` 校验用 `tempFilePath` 的 `.split('.').pop()`，camera 拍照 tempFilePath 可能无扩展名，合法图片被误判。

**文件**：`miniprogram/components/image-uploader/image-uploader.js`、`miniprogram/utils/validators.js`

**改动**：
- `chooseMedia` 回调里取 `file.fileType` 或用 `wx.getFileInfo` 取真实类型
- `validateImage` 支持接收 fileType 字段，优先用 fileType 判断，fallback 才用扩展名
- 或放宽：无扩展名时放行（依赖下游 AI API 自己判断）

- [ ] 实现
- [ ] 验证：camera 拍照能上传

---

### Task 18：history N+1 性能 + expireTokens 分页

**问题**：history 串行 50 次 `getTempURL`；expireTokens 无分页可能漏处理。

**文件**：`miniprogram/pages/history/history.js`、`cloudfunctions/expireTokens/index.js`

**改动**：
- history 改用 `wx.cloud.getTempFileURL({ fileList: [...] })` 批量取链接
- expireTokens 分页：`while` 循环每次 `limit(100)` 直到取空，单用户处理失败 try/catch 跳过

- [ ] 实现
- [ ] 验证：50 条记录进入不慢；过期记录 >100 条能全处理

---

### Task 19：initDB 建索引 + 默认套餐

**问题**：无索引支撑并发防护；无默认 token_packages 首期无法充值。

**文件**：`cloudfunctions/initDB/index.js`

**改动**：
- 创建索引：`user_activity_tokens` 的 `(user_id, activity_id)` 唯一、`orders` 的 `(status, created_at)`、`invite_records` 的 `invitee_openid`、`token_records` 的 `(user_id, created_at)`
- 插入默认 `token_packages` 示例（如 6 元 50 代币、19.9 元 200+20、68 元 800+100）

**注意**：云数据库创建索引需 `db.createCollectionIndex`，确认 API 可用性

- [ ] 实现
- [ ] 验证：initDB 运行后索引存在、套餐有默认数据

---

### Task 20：models 页分组去掉 auto + cloud.js 错误处理微调

**问题**：models 页分组含 auto（不应单独配）；`token_records.token_type` 标记不准。

**文件**：`miniprogram/pages/admin/models/models.js`

**改动**：
- `loadModels` 的 `CATEGORIES.map` 改为 `CATEGORIES.filter(c => c !== 'auto').map`
- 顺带：models 页 `editModel` 的 `.then` 链加 catch

- [ ] 实现
- [ ] 验证：models 页只显示三大分类

---

## 执行顺序与依赖

```
阶段一（Task 1-6）：阻断修复，互相独立，可并行
   ↓
阶段二（Task 7-9）：资金安全，Task 7/8 有依赖（都涉及事务模式），建议串行
   ↓
阶段三（Task 10-13）：功能补齐，互相独立
   ↓
阶段四（Task 14-16）：广告新功能，串行（云函数→管理端→用户端）
   ↓
阶段五（Task 17-20）：健壮性收尾
```

## 自检清单

### 规格覆盖
| 需求 | 任务 |
|---|---|
| preview 重新处理路径 | Task 1 |
| 邀请分享可触发 | Task 2 + Task 6 |
| history 重新处理入口 | Task 3 |
| 下载 loading 状态正确 | Task 4 |
| 每日签到时区正确 | Task 5 |
| 扣费事务化 | Task 7 |
| 支付补单可靠 | Task 8 |
| 管理端鉴权 | Task 9 |
| 模型测试连通性 | Task 10 |
| 订阅模板 ID 配置 | Task 11 |
| 一键美化可用 | Task 12 |
| 预览价格正确 | Task 13 |
| 看广告领永久代币 | Task 14 + 15 + 16 |
| 图片校验健壮 | Task 17 |
| 性能 + 过期扫描 | Task 18 |
| 索引 + 默认套餐 | Task 19 |
| models 分组正确 | Task 20 |

### 占位符
广告单元 ID 需在 mp 后台申请后填入 profile.js 常量（Task 16 留占位）。

> 执行说明：按阶段顺序执行，每个 Task 完成后 commit。阶段一/三/五内部任务可并行。
