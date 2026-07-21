# 多中转站模型广场（Multi-Provider Model Hub）设计

日期：2026-07-22
状态：已确认（用户分节批准）

## 1. 背景与目标

当前应用只支持单一中转站：`server/.env` 的全局唯一 `OPENROUTER_API_KEY` + `app_settings` 单行表里的 `base_url`，聊天框模型选择器写死只有 `openai/gpt-image-2`。

目标：把设置面板升级为类似 CherryStudio 的「模型广场」：

- 支持配置**多家中转站**（OpenRouter、硅基流动、AiHubMix 等），每家独立 API 地址与 API 密钥
- 每家中转站可整体**开启/关闭**
- 支持从中转站**拉取模型列表**（代理调 `GET {baseURL}/models`），模型可单个启用/停用、手动添加/删除
- 每家支持**多把 Key 轮询**使用
- 聊天输入框可按「中转站 → 模型」两级选择本次生成用哪家的哪个模型

## 2. 已确认的关键决策

| 决策点 | 结论 |
|---|---|
| API Key 存储 | **存 MySQL 数据库**，UI 可配置（调整之前「密钥只在 .env」的决策；`.env` 的 `OPENROUTER_API_KEY` 仅作为首次 seed 的种子值） |
| 设置界面形态 | **全屏模态页，左右分栏**（约 1100×720），替换现有 420px 抽屉 |
| 模型列表范围 | **全量拉取**，按关键词自动识别图像模型并默认启用；文本模型展示但默认不启用，可手动勾选 |
| 多 Key | **支持**，一家多把 Key（换行分隔），后端轮询，401/403 自动换下一把重试一次 |
| 整体架构 | **方案 A：后端 providers 模块**（Key 不出后端、无 CORS 问题、与「一切持久化走 MySQL」一致） |

后端绑定 127.0.0.1 单机自用，Key 明文返回给前端供编辑，UI 用密码框默认遮蔽。

## 3. 数据模型

### 3.1 新增表

```sql
CREATE TABLE IF NOT EXISTS providers (
  id VARCHAR(64) PRIMARY KEY,              -- 预设用固定 slug 如 'openrouter'
  name VARCHAR(120) NOT NULL,              -- 显示名，如 'OpenRouter'
  base_url VARCHAR(255) NOT NULL,          -- 如 https://openrouter.ai/api/v1
  api_keys JSON NOT NULL,                  -- 多 Key 数组 ["sk-...","sk-..."]
  enabled TINYINT(1) NOT NULL DEFAULT 1,   -- 整家开关
  request_mode VARCHAR(60) NOT NULL DEFAULT 'openrouter-image',
  color VARCHAR(20) NULL,                  -- 列表图标底色（预设品牌色）
  is_builtin TINYINT(1) NOT NULL DEFAULT 0,-- 预设标记（可删除，仅区分来源）
  sort_order INT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_models (
  id VARCHAR(64) PRIMARY KEY,
  provider_id VARCHAR(64) NOT NULL,
  model_id VARCHAR(190) NOT NULL,          -- 如 'openai/gpt-image-2'
  display_name VARCHAR(255) NULL,
  group_name VARCHAR(120) NULL,            -- 按 'openai/' 前缀分组
  is_image TINYINT(1) NOT NULL DEFAULT 0,  -- 拉取时按关键词自动标记
  enabled TINYINT(1) NOT NULL DEFAULT 0,   -- 是否出现在聊天选择器
  sort_order INT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  UNIQUE KEY uq_provider_model (provider_id, model_id)
);
```

### 3.2 既有表加列

```sql
ALTER TABLE drafts ADD COLUMN provider_id VARCHAR(64) NULL;
ALTER TABLE app_settings ADD COLUMN default_provider_id VARCHAR(64) NULL;
```

### 3.3 预设中转站

首次启动且 `providers` 表为空时 seed 约 8-10 家：OpenRouter、硅基流动（SiliconFlow）、AiHubMix、DMXAPI、OpenAI 官方、API2D、OhMyGPT、CloseAI 等。默认**仅 OpenRouter 开启**，其余关闭待填 Key。

OpenRouter 预设自动吸收：

- `api_keys` ← `server/.env` 的 `OPENROUTER_API_KEY`（非空才写）
- `base_url` ← 旧 `app_settings.base_url`（若用户改过）
- `default_provider_id` ← `'openrouter'`

旧 `app_settings.default_model`（如 `openai/gpt-image-2`）若在 OpenRouter 模型表中无对应行，则补一条 `enabled=1, is_image=1` 的模型记录，保证升级后聊天选择器有默认选中项、老草稿可用。

seed 后 `.env` 的 `OPENROUTER_API_KEY` 不再被读取（注释说明），避免两处真相。

## 4. 后端设计

### 4.1 新增模块结构

```
server/src/modules/providers/
  ├── routes.js              # REST 路由
  ├── providersService.js    # 业务逻辑（check / fetchModels diff / key 轮询）
  └── upstreamClient.js      # 代理调上游（GET /models、POST 图像生成），多 Key 轮询 + 401 换 Key
server/src/db/repositories/
  └── providersRepository.js # providers + provider_models 的 SQL 访问
```

### 4.2 REST API

| 接口 | 说明 |
|---|---|
| `GET /api/providers` | 列表（含每家模型总数/已启用模型数） |
| `POST /api/providers` | 新增自定义中转站 |
| `PUT /api/providers/:id` | 改名称/地址/Key 数组/请求模式 |
| `PATCH /api/providers/:id/enabled` | 整家开关 |
| `DELETE /api/providers/:id` | 删除（同事务级联删其模型；若有草稿引用了该 provider，前端先二次确认） |
| `POST /api/providers/:id/check` | 检测：逐把 Key 试调 `/models`，返回「2/3 可用」+ 失败 Key 脱敏尾号 + 延迟 |
| `GET /api/providers/:id/models` | 已入库模型列表 |
| `POST /api/providers/:id/models/fetch` | 代理调上游 `GET {baseURL}/models`，diff 合并入库（见 4.3） |
| `POST /api/providers/:id/models` | 手动添加模型 |
| `PATCH /api/providers/:id/models/:modelId/enabled` | 单模型开关 |
| `DELETE /api/providers/:id/models/:modelId` | 移除模型 |

### 4.3 模型列表 diff 合并规则

`POST .../models/fetch` 拉到上游全量模型后：

- **新增的**：插入，`group_name` 取 `model_id` 的 `/` 前缀；命中图像关键词（`image`、`dall-e`、`flux`、`seedream`、`seededit`、`imagen`、`gpt-image`）则 `is_image=1, enabled=1`，否则 `enabled=0`
- **已存在的**：保留用户的 `enabled` 状态，仅更新 `display_name`
- **上游消失的**：保留记录不删除（避免误删手动添加的），其 model_id 放进响应的 `staleModelIds` 数组，UI 当次灰化标记（不持久化）

返回 `{ added, updated, total, autoEnabled, staleModelIds }`，前端 toast「新增 X 个模型，已自动启用 Y 个图像模型」。

### 4.4 Key 轮询与生成路由

`upstreamClient` 内部维护进程内轮询游标 `Map<providerId, number>`：

1. 每次请求自增取模取一把 Key
2. 上游返回 401/403 时自动换下一把重试一次
3. 全部 Key 失败 → 抛友好错误：「{名称} 认证失败，请检查 API 密钥是否失效或余额不足」（带 401 status 透传）

`generateImageMessage` 改造：

1. 从 `draft.providerId` 查 provider：
   - 未指定 → 回退 `default_provider_id` → 第一个 `enabled=1` 的 provider
   - 指定但不存在/已禁用 → 400「{名称} 已停用或不存在」
   - `api_keys` 为空 → 400「{名称} 未配置 API 密钥」
2. 用该 provider 的 `base_url` + 轮询 Key 调上游
3. **顺带修复遗留 timeout bug**：`size === 'auto'` 时不传 `size` 字段；非 auto 时按 OpenRouter 图像 API 传 `resolution` + `aspect_ratio`（此前 curl 验证 15s 可用的格式），替代旧 `size` 直传
4. 消息落库时把 provider 名一并写入 `messages.meta_json`（供消息卡片展示「模型 · 中转站名」）

## 5. 前端设计

### 5.1 新增 store：`src/store/providers.js`

状态：`providers`（列表）、`selectedProviderId`、`models`（当前选中家的模型）、`loading` / `checkStatus` / `fetchStatus`。

动作：`loadProviders`、`selectProvider`、`createProvider`、`updateProvider`、`toggleProvider`、`removeProvider`、`checkProvider`、`fetchModels`、`addModel`、`toggleModel`、`removeModel`。

### 5.2 设置模态 `SettingsModal.vue`（替换 SettingsDrawer.vue）

约 1100×720 居中模态，圆角 16px，毛玻璃深色，沿用现有设计语言，左右分栏。

**左栏：中转站列表（约 260px）**

- 顶部搜索框（按名称过滤）
- 列表项：圆形色块图标（预设带品牌色 + 首字母/内置 SVG，自定义默认灰色首字母）+ 名称 + 右侧「ON」绿色徽标（已启用时）；hover 出现整家开关；点击选中高亮
- 底部「+ 添加」→ 右栏进入新建自定义中转站表单

**右栏：中转站详情**

- 顶行：名称 + 整家启用大开关（右上角）
- **API 密钥**：多行输入（每行一把 Key，密码遮蔽 + 眼睛切换），右侧「检测」按钮 → 调 `/check`，显示「✓ 可用 · 延迟 xxxms」或失败原因；提示「多个密钥换行分隔，轮询使用」
- **API 地址**：输入框 + 下方灰色预览「预览：{baseURL}/images」
- **请求模式**：下拉（当前仅 OpenRouter 图片模式）
- **模型区**：标题行（「模型 · N」+ 搜索框 +「获取模型列表」按钮 +「+ 添加」）；按 `group_name` 分组可折叠列表；每行：模型名 +「图像」标签 + 启用开关 + 删除按钮；空态引导「点击获取模型列表或手动添加」

**保存语义**：即时保存——字段失焦/开关切换即调对应 API（CherryStudio 同款体验），右下 toast 轻量反馈，无「保存」按钮。

**通用设置**：左栏底部「通用」小节保留全局默认参数（默认张数/尺寸/超时），走现有 `/api/settings`。

### 5.3 聊天输入框模型选择器（InputConsole）

- 单 `n-select` 换成**分组下拉**：组标题 = 启用中的中转站名（带色块小圆点），选项 = 该家已启用模型
- option value = 复合键 `${providerId}::${modelId}`，选中拆存 `draft.providerId` + `draft.model`
- 触发器显示「模型名 · 中转站名」，如 `gpt-image-2 · OpenRouter`
- 无任何启用模型时显示「去设置添加模型」，点击打开设置模态
- `requestImages` 的 draft 带 `providerId`

### 5.4 联动

- `hasConfig` 改为「存在至少一家 enabled 且 api_keys 非空的 provider」
- 消息卡片 meta 行显示「模型 · 中转站名」（读 `messages.meta_json`）
- 旧 `SettingsDrawer.vue` 删除；输入框齿轮、Sidebar 设置入口改开新模态
- 删除 provider 前 naive-ui dialog 二次确认；删除后受影响草稿回退默认 provider

## 6. 数据迁移

`server/src/db/init.js` 扩展为幂等启动迁移器：

1. `CREATE TABLE IF NOT EXISTS providers / provider_models`
2. `ALTER TABLE` 加列前用 `information_schema.COLUMNS` 探测，已存在则跳过
3. providers 表为空时 seed 预设（含 3.3 的 OpenRouter 吸收逻辑）

## 7. 错误处理

| 场景 | 行为 |
|---|---|
| 拉取模型失败（网络/401/404） | toast「无法从 {名称} 获取模型：{原因}」，不动已入库模型 |
| 检测 Key | 逐把试 `/models`，返回「2/3 可用」+ 失败 Key 脱敏尾号 |
| 生成时 provider 禁用/无 Key/无启用模型 | 400 明确消息，前端 `failImageGeneration` 现有链路展示 |
| 生成时单把 Key 401/403 | 自动换下一把重试一次；全失败 → 友好错误 |
| 删除仍有启用模型的 provider | 二次确认；删除后相关草稿回退默认 provider |
| 模型列表为空 | 右栏空态引导 |

## 8. 测试

### 后端（vitest + supertest，沿用现有注入式风格）

- `providersRepository.test.js`：CRUD、enabled 开关、级联删模型、seed 幂等（二次启动不重复插入）、旧 settings 迁移吸收
- `providerRoutes.test.js`：REST 端点、check 代理（mock axios）、fetch 的 diff 合并（新增标记 + 已有保留 + 消失标 stale）
- `keyRotation.test.js`：轮询取模、401 换 Key 重试、全失败报错
- 改造 `imageRoutes.test.js`：`draft.providerId` 路由；未指定时回退默认 provider；size auto 不传 size / 非 auto 传 resolution+aspect_ratio

### 前端（vitest + @vue/test-utils，断言用 data-role/data-action 选择器）

- `providers.test.js`（store）：加载、增删改、开关、fetch 合并、selectedProviderId
- `SettingsModal.test.js`：左栏选中切换、开关调 API、检测状态展示、模型分组渲染
- 改造 `InputConsole.test.js`：分组模型选择渲染、选中写入 `draft.providerId + draft.model`、无可用模型引导态
- 调整 `chat.test.js`：`hasConfig` 新语义

目标：现有 105 个测试 + 新增测试全部通过。

## 9. 范围外（YAGNI）

- 不做文本对话模型的实际调用（模型广场只服务图像生成，文本模型仅展示/可勾选备用）
- 不做流式生成
- 不做 Key 的 DB 加密（本机 127.0.0.1 单机自用；后续如需可再加对称加密）
- 不做请求模式 `openai-chat` 的实现（保留字段与下拉占位）
