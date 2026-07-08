# 月度订阅功能设计

> 创建日期：2026-07-09
> 状态：已批准，待写实施计划

## 目标

用户可购买月度订阅，开通后享受每日签到领代币权益。订阅为一次性月卡，不自动续费。

## 背景

当前 dailyCheckIn 云函数要求 `user.subscription.is_active === true` 才能领取签到奖励，但项目没有任何订阅购买入口，导致签到功能不可用。

## 用户流程

```
profile 页点"开通会员"
  → 跳转 subscribe 页（显示月费、每日代币数、当前/到期日期）
  → 点"立即开通 N 元/月"
  → 调 createSubscribe 云函数
    → 读 subscribe_config 获取价格
    → cloudPay.unifiedOrder 下单（order.type='subscribe'）
    → 返回 paymentParams
  → 前端 wx.requestPayment 唤起微信支付
  → 用户完成支付
  → 微信回调 paymentCallback
    → 识别 order.type === 'subscribe'
    → 不 inc tokens，改为设置 users.subscription 字段：
      { is_active: true, expires_at: now + 30天, daily_claimed_at: null }
  → 前端刷新用户信息
```

## 文件清单

### 新增文件

| 路径 | 职责 |
|---|---|
| `miniprogram/pages/subscribe/subscribe.js` | 订阅页逻辑：加载配置、显示状态、发起支付 |
| `miniprogram/pages/subscribe/subscribe.wxml` | 订阅页布局 |
| `miniprogram/pages/subscribe/subscribe.wxss` | 订阅页样式 |
| `miniprogram/pages/subscribe/subscribe.json` | 页面配置（`{ "navigationBarTitleText": "订阅会员" }`） |
| `cloudfunctions/createSubscribe/index.js` | 下单云函数：读配置→cloudPay 下单→返回支付参数 |
| `cloudfunctions/createSubscribe/package.json` | 依赖 wx-server-sdk |
| `cloudfunctions/createSubscribe/config.json` | 云函数配置（permissions.openapi: ["payment"]） |

### 修改文件

| 路径 | 改动 |
|---|---|
| `miniprogram/app.json` | pages 数组加 `"pages/subscribe/subscribe"` |
| `miniprogram/pages/profile/profile.wxml` | 菜单加"开通会员/续费会员"项，动态文字 |
| `miniprogram/pages/profile/profile.js` | 计算订阅状态文字 + goSubscribe 跳转 |
| `cloudfunctions/paymentCallback/index.js` | 事务内加分支：`order.type==='subscribe'` → 设置 subscription 字段，不 inc tokens |
| `cloudfunctions/syncOrders/index.js` | fulfillOrder 也识别 subscribe 订单 |

## 数据模型

### orders 表（复用，加 type 字段区分）

```json
{
  "_id": "自动",
  "user_id": "OPENID",
  "type": "subscribe",
  "tokens": 0,
  "amount": 1999,
  "status": "pending",
  "created_at": "Date",
  "wx_order_id": "",
  "_openid": "OPENID"
}
```

> `tokens: 0` — 订阅不发代币，与充值订单区分
> `amount` — 单位分，来自 subscribe_config.price

### users 表 subscription 字段

```json
{
  "subscription": {
    "is_active": true,
    "expires_at": "Date (now + 30天)",
    "daily_claimed_at": null
  }
}
```

### subscribe_config 表（已存在，无需改）

```json
{
  "name": "月度订阅",
  "price": 1999,
  "daily_tokens": 5,
  "wx_template_id": ""
}
```

## 接口定义

### createSubscribe 云函数

```
入参: {} （从 OPENID 获取用户）
返回: { paymentParams, orderId }  或  { err }
逻辑:
  1. 查 users 表确认用户存在
  2. 查 subscribe_config 获取 price
  3. 若已有有效订阅（is_active && expires_at > now），返回 { err: '当前订阅未到期' }
  4. 创建 orders 记录 { type:'subscribe', tokens:0, amount:price, status:'pending' }
  5. cloudPay.unifiedOrder 下单
  6. 返回 { paymentParams, orderId }
```

### paymentCallback 修改

```
事务内读取 txOrder 后:
  if txOrder.type === 'subscribe':
    - 不 inc tokens
    - 设置 users.subscription = { is_active:true, expires_at: now+30天, daily_claimed_at:null }
  else (默认充值):
    - inc tokens（现有逻辑）
  写 token_records: type='subscribe', amount=0, related_order
  更新 order.status = 'paid'
```

### profile 页订阅状态

```
data 加 subscriptionStatus: { text, expiryText }
onShow 时:
  if user.subscription && user.subscription.is_active && expires_at > now:
    text = '续费会员'
    expiryText = '到期：YYYY-MM-DD'
  else:
    text = '开通会员'
    expiryText = ''
```

## 全局约束

- 订阅有效期 30 天（从支付成功时刻起算）
- 不自动续费，到期后 is_active 自动失效（dailyCheckIn 检查 expires_at）
- dailyCheckIn 需补检查 expires_at > now（当前只查 is_active）
- 订阅订单走 orders 表，用 type='subscribe' 区分充值订单
- 订阅不发代币，权益是每日签到领代币
- paymentCallback 事务内处理，保证原子性

## 与现有功能的交互

- **dailyCheckIn**: 已有 is_active 检查。需补 expires_at > now 检查（到期视为未订阅）
- **syncOrders**: 补单逻辑也要识别 subscribe 订单
- **recharge 页**: 不受影响，充值和订阅是独立入口
- **token_records**: 订阅支付写一条 type='subscribe' 流水（amount=0），仅作记录

## 不做

- 自动续费（周期扣款）
- 订阅消息通知（wx_template_id 留配置但不实现推送）
- 多档位订阅（只有月度一档）
- 订阅退订/退款
