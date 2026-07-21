# UI 重设计 + 生成中切主题 Bug 修复

## Context（为什么做这个改动）

用户反馈 ai-chat-draw 前端有多个交互 bug 和样式不满，经确认根因后需统一修复：

1. **设置弹窗无保存按钮 + 保存"无效"**：`SettingsDrawer.vue` 直接 `v-model` 绑 `store.appConfig`，靠 `chat.js` 的 `watch` 防抖自动保存，但无任何保存状态反馈，用户不知是否保存成功。更严重的是「API Key」字段是**死字段**——`scheduleSettingsPersist`（[chat.js:394-401](file:///Users/dongdongpromax/BrainHub/Code/Demo/ai-chat-draw/src/store/chat.js#L394-L401)）根本不发 apiKey，后端 `openrouterClient` 用的是 `server/.env` 的 key，用户填了不生效也不保存，是"保存无效"的主因。
2. **全屏按钮行为错误**：`InputConsole.vue` 的 Expand 按钮把输入框本身 `position:fixed; inset:24px` 全屏，textarea 撑满整屏，遮住消息历史，体验极差。
3. **消息卡片样式不满意**：`MessageBubble.vue`/`ImageMessageCard.vue` 是左侧 112px avatar 徽章 + 右侧气泡的传统布局，用户觉得不好看。
4. **尺寸选择器信息密度低**：点「尺寸」向上弹 2 列共 13 个纯文字选项，看不出画面比例形状。
5. **【严重 Bug】生成中切主题导致消息丢失/结果错位**：`completeImageGeneration`（[chat.js:417](file:///Users/dongdongpromax/BrainHub/Code/Demo/ai-chat-draw/src/store/chat.js#L417)）和 `failImageGeneration`（[chat.js:488](file:///Users/dongdongpromax/BrainHub/Code/Demo/ai-chat-draw/src/store/chat.js#L488)）用的是 `currentTopicId.value`，生成中切走后：结果图片归错主题、清空了切换后主题的草稿、原主题 generating 状态永久卡住、切回原主题时后端没存（生成被归错）导致聊天记录消失。

**用户已拍板的 4 个设计决策**：① 移除前端 API Key 字段（密钥统一由 `server/.env` 管理）；② 全屏 = 聊天区全屏（隐藏侧栏）；③ 消息改现代卡片式；④ 尺寸选择改比例可视化网格。

**预期结果**：设置保存可见可控、全屏专注对话、消息卡片现代美观、尺寸选择直观、生成中切换主题不丢数据不错位。

---

## 改动方案

### 改动 1：设置弹窗 —— 显式保存 + 移除 API Key 字段

**文件**：`src/components/SettingsDrawer.vue`、`src/store/chat.js`

**当前问题**：`SettingsDrawer` 直接绑 `store.appConfig.xxx`，`chat.js` 的 `watch(appConfig, scheduleSettingsPersist)` 自动防抖保存，无保存按钮无状态反馈；API Key 字段填了不生效。

**方案**：
- `SettingsDrawer.vue`：
  - 移除「API Key」字段整块
  - 改用**本地表单副本**编辑（`reactive({ ...store.appConfig })` + `watch(show)` 同步），点「保存」才提交，避免编辑中触发自动保存
  - 底部加「保存」按钮 + 状态文案（`保存中…` / `已保存` / `保存失败：xxx`）
  - 顶部加说明条：「图像生成的 API 密钥由后端 `server/.env` 统一管理，此处仅配置服务地址与默认参数」
- `src/store/chat.js`：
  - 新增 `saveSettings()` action：调 `updateSettings`（已有 [settingsApi.js:8](file:///Users/dongdongpromax/BrainHub/Code/Demo/ai-chat-draw/src/services/settingsApi.js#L8)），设置 `settingsSaveStatus`（`'idle'|'saving'|'saved'|'error'`），成功后 `Object.assign(appConfig, saved)`，失败设 error 并写 `lastError`
  - **移除** `watch(appConfig, scheduleSettingsPersist)` 自动保存（[chat.js:572-586](file:///Users/dongdongpromax/BrainHub/Code/Demo/ai-chat-draw/src/store/chat.js#L572-L586)），避免与显式保存冲突
  - 保留 `appConfig` reactive 和 `bootstrap` 时的 `getSettings` 拉取
  - 暴露 `saveSettings`、`settingsSaveStatus`
- `src/config/env.js` 的 `getDefaultAppConfig` 保留 `apiKey` 字段（避免破坏 env.test.js），但 UI 不再暴露

**保存链路确认有效**：后端 `settingsRepository.saveSettings`（[settingsRepository.js:28](file:///Users/dongdongpromax/BrainHub/Code/Demo/ai-chat-draw/server/src/db/repositories/settingsRepository.js#L28)）INSERT ON DUPLICATE KEY UPDATE 正常，`PUT /api/settings` 路由正常（[settings/routes.js:14](file:///Users/dongdongpromax/BrainHub/Code/Demo/ai-chat-draw/server/src/modules/settings/routes.js#L14)），后端 `generateImageMessage` 读 DB settings（[server.js:171](file:///Users/dongdongpromax/BrainHub/Code/Demo/ai-chat-draw/server/src/server.js#L171)）。链路本身通，加显式保存+状态反馈即可让"保存无效"消失。

### 改动 2：聊天区全屏 —— 隐藏侧栏，消息+输入铺满

**文件**：`src/components/MainLayout.vue`、`src/components/ChatArea.vue`、`src/components/InputConsole.vue`、`src/store/chat.js`

**当前问题**：`InputConsole.vue` 的 `isExpanded` 把输入框本身全屏（`position:fixed; inset:24px`），textarea 撑满 `calc(100vh - 240px)`，遮住消息历史。

**方案**：
- 全屏状态提升到 `chat.js` store：新增 `isChatFullscreen` ref + `toggleChatFullscreen()` action（便于 Sidebar/ChatArea/InputConsole 联动 + Esc 监听统一）
- `MainLayout.vue`：`isChatFullscreen` 时给 `.main-layout` 加 `is-fullscreen` class，CSS 隐藏 `.sidebar`（`display:none` 或 `margin-left:-$sidebar-width` 动画），`.content-wrapper` 铺满
- `ChatArea.vue`：header 右上角加全屏切换按钮（从 InputConsole 移过来），用 `Maximize2`/`Minimize2` 图标（lucide-vue-next）
- `InputConsole.vue`：**移除** `isExpanded` 状态、`toggleExpanded`、`watch(isExpanded)` body overflow 逻辑、`.is-expanded` 样式块、left-actions 里的全屏按钮
- Esc 退出：在 `ChatArea.vue` 或 store 统一监听 keydown，`isChatFullscreen` 时 Esc 退出

### 改动 3：消息卡片 —— 现代卡片式

**文件**：`src/components/MessageBubble.vue`、`src/components/ImageMessageCard.vue`

**当前问题**：左侧 112px `.message-side`（badge 徽章 + 标题）+ 右侧气泡，传统且占地。

**方案**（重写两个组件的 template + style，script 基本不变）：
- **去掉 `.message-side` 左侧栏**，每条消息整体是一张卡片
- **用户消息**（`is-user`）：靠右，最大宽度 70%，蓝色调卡片（`rgba(119,168,255,0.14)` 底 + 蓝边），圆角 `18px 18px 4px 18px`，顶部小标签「你」
- **AI 文本消息**（`is-assistant`）：靠左，浅底卡片（`rgba(255,255,255,0.04)`），圆角 `4px 18px 18px 18px`，顶部小标签「AI 图像助手」
- **AI 图片消息**（`ImageMessageCard`）：靠左整宽卡片，顶部 meta 行（模型·尺寸·张数），中间图片网格（保留现有 `n-image-group`），底部 action 按钮精简为图标+文字（`继续细化`/`再次生成`/`设为参考图`/`下载原图`）
- **系统状态**（`is-system`/`generating`）：居中胶囊，带 spinner 动画，`正在生成图像…`
- 保留现有响应式断点（860px/640px）

### 改动 4：尺寸选择器 —— 比例可视化网格

**文件**：`src/components/InputConsole.vue`

**当前问题**：13 个纯文字选项 2 列网格，看不出画面比例。

**方案**：
- `sizeOptions` 数据结构增加 `ratio`（比例字符串如 `1:1`）和 `group`（`方图`/`横图`/`竖图`/`超宽`）字段
- 重写 `.size-grid-panel`：按 `group` 分组展示，每组一个小标题
- 每个 `.size-grid-option` 内画一个**对应比例的小方框**（用 `aspect-ratio` CSS + 固定宽度，根据 `ratio` 计算），下方显示 `1536×1152` 像素标注
- 选中态保留现有蓝色高亮
- 网格列数改为 `repeat(3, 1fr)` 或自适应，让比例图标更突出

### 改动 5：【严重】生成中切主题 Bug 修复

**文件**：`src/store/chat.js`、`src/components/InputConsole.vue`

**根因**：`completeImageGeneration`/`failImageGeneration` 用 `currentTopicId.value`，生成中切走后归错主题、污染草稿、原主题 generating 卡死、切回消息丢失。

**方案**（核心原则：生成流程绑定发起时的 `originTopicId`，不依赖 `currentTopicId`）：
- `InputConsole.vue` 的 `handleSend`：`const originTopicId = await chatStore.addUserPrompt(prompt)` 捕获发起主题，传给 `completeImageGeneration`/`failImageGeneration`：
  ```js
  const result = await requestImages(originTopicId, { prompt, draft: { ...draft.value } })
  await chatStore.completeImageGeneration(result, prompt, originTopicId)
  // catch: chatStore.failImageGeneration(error, originTopicId)
  ```
- `chat.js` 的 `completeImageGeneration(result, prompt, originTopicId)`：内部所有 `currentTopicId.value` 替换为 `originTopicId`（`ensureDraft`、`findLastIndex`、`getTopicById`、push 消息的 `topicId`、`scheduleDraftPersist`）。这样无论用户切到哪，结果正确归位发起主题，不污染其他主题草稿。
- `failImageGeneration(error, originTopicId)`：同上替换。
- `selectTopic(topicId)`：切回某主题时，**保留内存中该主题 pending 的消息**（后端还没存的 `user_prompt` + `system_status:generating`），避免被后端空结果覆盖：
  ```js
  // 后端拉到的 user_prompt（生成已完成才会存）
  const remoteUserPrompts = new Set(nextMessages.filter(m => m.type === 'user_prompt').map(m => m.prompt))
  const keptPending = messages.value.filter(
    m => m.topicId === topicId && (
      (m.type === 'system_status' && m.status === 'generating') || // generating 后端永不存，必留
      (m.type === 'user_prompt' && !remoteUserPrompts.has(m.prompt)) // user_prompt 后端没有则留
    )
  )
  messages.value = [
    ...messages.value.filter(m => m.topicId !== topicId),
    ...nextMessages,
    ...keptPending,
  ].sort((a, b) => a.createdAt - b.createdAt)
  ```
- 这样：生成中切走 → 原主题 user_prompt+generating 留内存；生成完成 → `completeImageGeneration(originTopicId)` 移除 generating、push assistant_images、后端保存；切回原主题 → 后端拉到完整记录、内存 pending 已被清理或合并。全程不丢数据、不归错。

---

## Assumptions & Decisions

- **保留 `appConfig.apiKey` 字段在 store/env**（不破坏 `env.test.js`），仅 UI 移除输入框
- **全屏状态放 store** 而非组件本地，便于 Esc 监听和跨组件联动
- **生成中不禁止切换主题**（允许用户多主题并行），通过 `originTopicId` 绑定 + `selectTopic` 保留 pending 消息解决
- **尺寸选项的像素值与后端/OpenRouter 解耦**：后端 `defaultSize:'auto'` 仍兼容，前端 size 值（如 `1536x1152`）原样传后端，不改后端逻辑
- 不改任何后端代码（保存链路、生成链路均正常），仅前端改动 + store 逻辑

## 验证步骤

1. **后端测试不受影响**：`cd server && npm run test`（应仍 46 通过，因未改后端）
2. **前端测试**：`npm run test`，更新受影响的断言（`SettingsDrawer` 无 API Key 字段、`InputConsole` 无 isExpanded、`chat` store 的 completeImageGeneration 签名变更、selectTopic 合并逻辑）
3. **手动验证**（`npm run dev` 起前后端）：
   - 设置弹窗：移除 API Key 字段、填 baseURL 点保存出现「已保存」、改设置后刷新页面配置仍在
   - 全屏：点全屏按钮侧栏隐藏聊天区铺满、Esc 退出
   - 消息卡片：发 prompt 看用户消息靠右蓝卡、AI 图片靠左卡片、generating 居中胶囊
   - 尺寸选择：点尺寸弹出分组+比例小方框
   - **生成中切主题**（关键）：发 prompt 生成中→切到另一主题→切回→user_prompt+generating 仍在→等生成完成→assistant 图片正确归到原主题、另一主题草稿未被清空
4. **回归**：删除主题、设为参考图、下载图片等功能仍正常
