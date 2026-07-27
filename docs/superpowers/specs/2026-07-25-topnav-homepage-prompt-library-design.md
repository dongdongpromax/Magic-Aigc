# 顶部导航 + 门户首页 + 提示词库 设计文档

> 日期：2026-07-25
> 状态：待评审

## 背景与目标

当前应用采用「左侧栏 + 内容区」布局，侧栏底部已有「创作画布」「使用日志」两个导航入口。随着功能增加（即将加入提示词库），侧栏底部导航会越来越臃肿，职责也不清晰（侧栏同时承担会话管理与页面导航）。

本设计通过三个改造解决该问题：

1. **布局重构**：新增顶部导航栏（TopNav）承载父子菜单页面导航，侧栏（Sidebar）聚焦创作会话管理
2. **门户首页**：根路径新增仪表盘式首页，作为应用入口，展示功能入口、使用统计、最近创作
3. **提示词库**：新增提示词管理页面，支持视频/图片/音频/文本四类提示词的增删改查、效果素材预览、一键使用

## 路由结构

```
/          → 门户首页（HomePage.vue，新建，根路径不再重定向到 /chat）
/chat      → 聊天创作（ChatArea）
/canvas    → 创作画布
/prompts   → 提示词库（新建）
/logs      → 使用日志
```

所有页面共享 `MainLayout`（TopNav + Sidebar + 内容区）。

---

## 第一部分：布局重构

### MainLayout 改造

```
┌─────────────────────────────────────────────────────┐
│ TopNav（新增，48px）                                  │  ← 品牌 + 父子菜单 + 连接状态
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│ Sidebar  │           router-view                    │
│ (会话)    │                                          │
│          │                                          │
└──────────┴──────────────────────────────────────────┘
```

- 全屏模式（聊天全屏）：TopNav + Sidebar 一起隐藏，内容区铺满

### TopNav 组件（新增 `src/components/TopNav.vue`）

- **左侧**：品牌 logo + 名称「创作工坊」（从 Sidebar 上移）
- **中部**：父子下拉菜单
  - `创作 ▾` → 聊天 / 画布
  - `管理 ▾` → 提示词库 / 使用日志
  - 交互：hover 展开子菜单，当前页面高亮对应项
- **右侧**：连接状态徽标（ConnectionBadge，从 ChatArea 上移，全局可见）
- 子菜单用浮层 `<div>` + `Teleport` 到 body（与 ConfirmDialog 同模式）

### 父子菜单数据结构

```js
// src/components/topNavConfig.js
export const NAV_MENU = [
  {
    label: '创作',
    items: [
      { label: '聊天', path: '/chat', icon: MessageSquare },
      { label: '画布', path: '/canvas', icon: Clapperboard },
    ],
  },
  {
    label: '管理',
    items: [
      { label: '提示词库', path: '/prompts', icon: Library },
      { label: '使用日志', path: '/logs', icon: ScrollText },
    ],
  },
]
```

### Sidebar 改造

- **移除**：品牌区（移到 TopNav）、底部导航入口（画布/日志，移到 TopNav 菜单）
- **保留**：新建创作按钮、搜索框、主题列表
- 结果：侧栏更聚焦，纯粹做创作会话管理

---

## 第二部分：门户首页

### `src/views/HomePage.vue`

三大区块，纵向排列：

**① 功能入口卡片（顶部）**
- 4 张卡片横排：聊天创作 / 创作画布 / 提示词库 / 使用日志
- 每张卡：图标 + 标题 + 一句话描述，点击跳转对应路由
- 卡片样式遵循项目业务感（小圆角 3px、无渐变、暗色卡片底）

**② 使用统计（中部）**
- 4 个数字指标卡：累计生成次数、图片数、视频数、提示词数
- 数据来源：后端新增 `GET /api/stats/summary` 聚合查询
  - `usage_logs` 表 count（按 type 分组）
  - `prompts` 表 count
- 前端 `src/services/statsApi.js` 封装

**③ 最近创作会话（底部）**
- 横向滚动缩略图列表，展示最近 8 个主题（复用 `chatStore.topics`，按 updatedAt 排序）
- 每项：封面缩略图（图/视频首帧）+ 标题，点击跳 `/chat` 并选中该主题
- 数据来源：已有 `chatStore.topics`，无需新接口

### 后端统计端点

`server/src/modules/stats/routes.js`：
- `GET /api/stats/summary` → `{ totalGenerations, imageCount, videoCount, promptCount }`
- 工厂函数 `createStatsRoutes({ usageLogRepository, promptRepository })`

---

## 第三部分：提示词库

### 数据库（加到 `migrateProvidersSchema`，幂等迁移）

```sql
CREATE TABLE IF NOT EXISTS prompts (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,              -- 提示词正文
  type VARCHAR(20) NOT NULL,          -- 枚举: video/image/audio/text
  tags JSON NOT NULL DEFAULT '[]',    -- 自定义标签数组 ["赛博朋克","人物特写"]
  assets JSON NOT NULL DEFAULT '[]',  -- 效果素材 [{url,mimeType,kind,name}]
  notes TEXT NULL,                    -- 备注
  sort_order INT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  INDEX idx_prompts_type (type),
  INDEX idx_prompts_created (created_at DESC)
)
```

素材文件存到 `/files/prompts/` 目录，复用现有静态文件服务模式。`assets` 字段为 JSON 数组，与 `usage_logs.result_files` 模式一致。

### 后端

**`server/src/db/repositories/promptRepository.js`**（工厂函数 `createPromptRepository`，参照 `usageLogRepository` 模式）

方法：
- `list({ type, tag, keyword, limit })` → 摘要列表（含 assets 用于缩略图）
- `findById(id)` → 完整记录
- `create({ title, content, type, tags, assets, notes })`
- `update(id, patch)`
- `delete(id)` → 删记录 + 清理素材文件

**`server/src/modules/prompts/routes.js`**（`createPromptRoutes`，RESTful）

端点：
- `GET /api/prompts?type=&tag=&keyword=&limit=` 列表筛选
- `GET /api/prompts/:id` 详情
- `POST /api/prompts` 新增
- `PUT /api/prompts/:id` 更新
- `DELETE /api/prompts/:id` 删除（同时清理素材文件）
- `POST /api/prompts/upload` 上传素材 → 返回 `{ url, mimeType, kind, name }`

在 `server.js` 注册路由 + 迁移表。

### 前端

**`src/services/promptApi.js`**：封装上述端点

**`src/views/PromptLibraryPage.vue`**（主页面，参照 `UsageLogPage` 模式）

- 顶部工具栏：类型 tab（全部/视频/图片/音频/文本）+ 标签筛选（下拉多选）+ 关键词搜索 + 「新增」按钮
- 卡片网格：每卡显示标题、类型徽标、标签、首个素材缩略图、提示词摘要（前 80 字）
- 卡片操作：预览（打开详情抽屉）、编辑、删除（ConfirmDialog）、复制提示词、一键使用

**`src/components/prompts/PromptEditModal.vue`**（新增/编辑弹窗，Teleport to body）

- 字段：标题、类型（下拉）、标签（输入回车添加，可删除）、提示词正文（多行 textarea）、素材上传（多文件，支持图片/视频/音频）、备注
- 素材上传后显示缩略图列表，可单删
- 保存即生效（即时保存，遵循项目设置即保存的约定）

**`src/components/prompts/PromptDetailDrawer.vue`**（详情抽屉，860px，Teleport to body）

- 完整提示词（可复制）、所有素材大图/播放（img/video/audio 标签按 mimeType 路由）、标签、备注
- 底部：「复制提示词」「一键使用」按钮

### 一键使用流程

- 点击「使用」→ `router.push({ path: '/chat', query: { promptId } })`
- ChatArea `onMounted` 检测 `route.query.promptId` → 调 `promptApi.findById` → 填充 `draft.prompt` + 按 `type` 自动选中第一个启用的对应类型模型（video→视频模型，image→图像模型）
- 填充后清除 query（`router.replace({ query: {} })`）

---

## 测试计划

| 测试文件 | 覆盖 |
|---------|------|
| `promptRepository.test.js` | CRUD + 筛选 + 素材清理 |
| `stats` 路由测试 | 聚合查询 |
| `TopNav.test.js` | 父子菜单渲染、hover 展开、路由跳转、高亮 |
| `HomePage.test.js` | 卡片渲染、统计展示、最近会话 |
| `PromptLibraryPage.test.js` | 列表、筛选、删除确认 |
| `PromptEditModal.test.js` | 表单提交、标签添加/删除、素材上传 mock |
| `promptApi.test.js` | API 调用 |

---

## 分阶段实现建议

范围较大，分 3 阶段，每阶段可独立交付验证：

**阶段 1：布局重构**（TopNav + Sidebar 改造 + 路由调整）
- 新建 TopNav，Sidebar 移除品牌区和底部导航
- 根路径 `/` 暂时重定向到 `/chat`（门户首页阶段 2 做）
- 全屏模式适配

**阶段 2：门户首页 + 统计**
- HomePage.vue + stats 后端端点
- 根路径 `/` 指向 HomePage

**阶段 3：提示词库**
- 数据库 + repository + 路由 + 前端页面 + 一键使用

---

## 约束与约定

- 遵循现有工厂函数依赖注入模式（`createXxxRepository`、`createXxxRoutes`）
- 数据库迁移幂等（`CREATE TABLE IF NOT EXISTS`）
- 弹窗/抽屉用 `Teleport` to body
- 删除操作用 `ConfirmDialog` 二次确认
- 复制按钮用 `navigator.clipboard.writeText()` + 1.5s「已复制」反馈
- UI 风格：业务感、小圆角（3px）、无渐变背景、移除英文文案
- 代码注释：详细标准中文注释
