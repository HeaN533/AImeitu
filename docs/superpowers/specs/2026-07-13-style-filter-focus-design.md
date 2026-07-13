# 风格转换+滤镜转换为主打的功能调整设计

> 创建日期：2026-07-13
> 状态：已批准，待写实施计划

## 目标

将项目定位从"AI 图片美化"调整为"AI 风格/滤镜创作"为主、"人像美化"为辅。风格转换和滤镜转换作为主打功能占据首页显眼位置，人像美化降为副业小卡片。删除一键美化分类。

## 分类调整

### 变更对照

| 调整 | 原分类 | 新分类 |
|---|---|---|
| 主打 | 风格转换（5 子项） | 风格转换（5 子项，替换部分子项） |
| 主打 | 色彩画质（5 子项） | 滤镜转换（8 子项，扩充滤镜类） |
| 副业 | 人像美化（5 子项） | 人像美化（不变，移到底部小卡片） |
| 删除 | 一键美化（1 子项） | 删除 |

### 新分类定义

**风格转换（style）— 主打**
| key | label | 状态 |
|---|---|---|
| anime | 动漫风 | 保留 |
| oil_painting | 油画风 | 保留 |
| sketch | 素描/线稿风 | 保留 |
| watercolor | 水彩风 | 新增 |
| cyberpunk | 赛博风 | 新增 |

> 删除：ink（水墨风）、pixel（像素风）

**滤镜转换（filter）— 主打，原 color 分类改名**
| key | label | 状态 |
|---|---|---|
| auto_tone | 智能调色 | 保留 |
| sharpen | 清晰度增强 | 保留 |
| dehaze_denoise | 去雾除噪 | 保留 |
| vintage | 复古滤镜 | 新增 |
| film | 胶片滤镜 | 新增 |
| japanese | 日系滤镜 | 新增 |
| b&w | 黑白艺术 | 新增 |
| warm_sun | 暖阳滤镜 | 新增 |

> 删除：filter（原"滤镜风格"，被新子项替代）、lighting（光影优化，被暖阳替代）

**人像美化（beautify）— 副业，不变**
| key | label | 状态 |
|---|---|---|
| smooth | 磨皮美肤 | 不变 |
| whiten | 智能美白 | 不变 |
| thin_face | 瘦脸塑形 | 不变 |
| big_eyes | 大眼亮眼 | 不变 |
| acne_removal | 祛痘去皱 | 不变 |

**一键美化（auto）— 删除**

## 首页布局

```
┌─────────────────────────────┐
│  AI 图片美化                  │
│  让每张照片变成艺术品          │
├──────────┬──────────────────┤
│          │                  │
│ 🎭 风格转换 │  📸 滤镜转换      │
│ 动漫/油画/  │  复古/胶片/日系   │
│ 素描/水彩/  │  黑白/暖阳...    │
│ 赛博       │                  │
│ （大卡片）  │  （大卡片）       │
├──────────┴──────────────────┤
│  👤 人像美化（小卡片）          │
└─────────────────────────────┘
```

- 风格转换和滤镜转换：大卡片，并排两列，显眼位置
- 人像美化：底部小卡片，单行
- 一键美化：删除

## 改动范围

### 前端

| 文件 | 改动 |
|---|---|
| `miniprogram/utils/constants.js` | CATEGORIES 去掉 auto；CATEGORY_LABELS 改 `color` → `filter` 且 label 改"滤镜转换"；SUB_TYPES 按上述新定义替换；DEFAULT_PRICES key 改 `color` → `filter` |
| `miniprogram/pages/index/index.js` | CATEGORY_ICONS 和 CATEGORY_DESC 适配新分类；categories 数据适配 |
| `miniprogram/pages/index/index.wxml` | 大卡片+小卡片布局：风格/滤镜大卡片并排，人像美化小卡片底部 |
| `miniprogram/pages/index/index.wxss` | 新布局样式：大卡片、小卡片、并排两列 |
| `miniprogram/components/effect-picker/effect-picker.wxml` | 图标适配新分类 key（color → filter） |
| `miniprogram/pages/admin/models/models.js` | loadModels 过滤 auto 已做，确认 filter key 一致 |

### 云函数

| 文件 | 改动 |
|---|---|
| `cloudfunctions/initDB/index.js` | pricing_config 旧记录清理 + 插入新的 18 条子选项定价（风格 5 + 滤镜 8 + 人像 5）；names 数组无变化 |
| `cloudfunctions/processImage/index.js` | getActiveModel 删除 auto 分支（auto 分类已删除） |

### 数据库

- `pricing_config`：清理旧记录（无新子选项对应的记录），插入新子选项定价
- `model_configs`：管理员需在后台为新子选项配置对应 AI 模型（代码不改，数据层操作）

## 全局约束

- 图片格式：`SUPPORTED_FORMATS = ['jpg', 'jpeg', 'png', 'heic', 'webp']`
- 单张上限：`MAX_FILE_SIZE = 10 * 1024 * 1024`（10MB）
- 云函数超时：30s
- 扣费优先级：限时代币（expires_at 升序）→ 永久代币（users.tokens）
- 管理端鉴权：服务端校验 users.role === 'admin'
- 时区：所有日期计算以北京时间（UTC+8）为准
- 定价按子选项（category + sub_type），后台可配
- AI 模型：继续用现有 API 模式（model_configs 表配置），每个子选项配一个模型

## 不做

- 不自建 GPU/SD 模型（继续用 API 调用模式）
- 不改代币体系/广告/充值逻辑
- 不改 processImage 核心处理流程（只删 auto 调度分支）
- 不改 preview/history/profile 等下游页面（自动跟随 constants 变化）
- 不改 admin 后台结构（settings 定价 tab 自动跟随新子选项）

## 与现有功能的交互

- **effect-picker**：自动读 constants.js 的 CATEGORIES 和 SUB_TYPES，改 constants 即生效
- **定价管理**：settings 页定价 tab 读 pricing_config 表，initDB 重新插入新记录即生效
- **模型配置**：models 页读 model_configs 表，管理员需为新子选项配置模型记录（category 字段用新 key）
- **processImage**：getActiveModel 按 category 查模型，新子选项走标准查询路径，auto 分支删除
- **downloadImage 扣费**：按 `category + sub_type` 查 pricing_config，新分类 key 自动适配
- **preview 显示价格**：同上
