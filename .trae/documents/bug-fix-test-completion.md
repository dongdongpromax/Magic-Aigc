# ai-chat-draw Bug 修复收尾计划（测试 + README）

## Context（背景）

承接 `bug-fix-plan.md`：P0/P1/P2 全部代码改动已完成（git status 确认 21 个文件已改/新增/删除），后端测试 8/8 通过，前端测试 **5 失败 / 44 通过**。本计划聚焦剩余收尾工作：

1. **修复 5 个失败的前端测试**（让基线回到全绿）
2. **新增测试覆盖**（落实 `bug-fix-plan.md` 测试策略表，覆盖事务/上传校验/新 API/常量等）
3. **更新 README**（安全提示 + 新行为说明）
4. **最终验证**（前后端测试全绿 + grep 安全验证）

**不在本计划范围**：P2-5 文件 GC 兜底任务（`bug-fix-plan.md` 明确标注为最低优先级可选项，留作后续运维任务）。

## 当前状态分析（Phase 1 探索结论）

### 失败测试根因（systematic-debugging Phase 1 已定位）

| 测试文件 | 失败原因 | 修复方向 |
|---|---|---|
| `src/config/env.test.js:16, 32` | 断言 `requestMode: 'backend-proxy'`，但 `src/config/env.js:15` 已改为 `'openrouter-image'`（P1-1） | 更新断言为 `'openrouter-image'` |
| `src/services/localImageBridge.test.js`（2 个） | `BRIDGE_URL` 现从 `import.meta.env.VITE_LOCAL_BRIDGE_URL` 读取，默认空 → 直接抛 `未配置本地桥接服务`（P1-4） | 测试用 `vi.stubEnv` + `vi.resetModules` + 动态 import 注入桥接地址 |
| `src/store/chat.preview.test.js:104` | 断言 `saveImageToProject` 被调用，但 `completeImageGeneration` 已移除该调用（P1-4），改为直接用后端返回的 `localPath` | 改测试入参为后端返回的 `localPath`，断言 `saveImageToProject` **未**被调用 |
| `src/components/ChatArea.test.js` | `onMounted` 调 `chatStore.bootstrap()` → 真实 `getSettings()` 触发网络错误（unhandled rejection） | `vi.mock('@services/settingsApi')` + `vi.mock('@/services/chatApi')` 阻断网络 |

### 已确认的源码行为（供测试编写参照）

- `src/store/chat.js:417-482` `completeImageGeneration`：调 `triggerBrowserDownload`，不再调 `saveImageToProject`；图片对象 `localPath`/`savedToProject` 直接来自后端返回值（无 `localPath` 时 `localPath=''`、`savedToProject=false`）
- `src/services/localImageBridge.js:11` `BRIDGE_URL` 在模块加载时求值，需 `vi.stubEnv` + `vi.resetModules` 才能注入
- `src/utils/download.js:64-66` `triggerBrowserDownload` 对 `/` 开头的路径拼接 `backendClient.defaults.baseURL`
- `src/utils/constants.js` `MAX_REFERENCE_IMAGES = 16`
- `server/src/db/transaction.js` `runTransaction(pool, fn)`：getConnection → beginTransaction → fn → commit/rollback → release
- `server/src/db/repositories/draftRepository.js` 所有写方法接收 `executor = pool`；新增 `listReferenceImages`/`countReferenceImages`/`addReferenceImagesFromMessage`；`saveDraft` 返回真实 `referenceImages`
- `server/src/db/repositories/topicRepository.js` 新增 `verifyMessageBelongsToTopic`/`deleteTopic`/`listTopicFilePaths`；`saveGeneratedConversation` 防御性 `safeImages`
- `server/src/app.js` 错误中间件分类（MulterError/ValidationError/4xx → 具体消息；其余 → `internal server error`）；`/api/health` 注入 `healthCheck` 时探测 DB，失败 503
- `server/src/modules/images/routes.js` multer `limits: { fileSize: 10MB, files: 16 }` + `fileFilter` 只允许 png/jpeg/webp；新增 `POST /topics/:topicId/references/from-message`
- `server/src/modules/topics/routes.js` 新增 `DELETE /topics/:topicId`（调 `topicService.deleteTopic`，204）

### 现有测试模式（沿用，保持一致）

- 后端仓储测试：`createXxx({ query: vi.fn().mockResolvedValueOnce([...]) })` 注入 mock executor
- 后端路由测试：`createApp({ imageService: {...mocks... }, topicService: {...mocks... } })` + `supertest`
- 前端 store 测试：`vi.hoisted` + `vi.mock('@/services/chatApi')` + `vi.mock('@/services/settingsApi')`
- 前端 API 测试：`vi.spyOn(backendClient, 'post'/'delete')` + 断言调用参数

---

## 提议改动

### 阶段 A：修复 5 个失败测试（让基线回到全绿）

#### A1. `src/config/env.test.js`

- 第 16 行：`requestMode: 'backend-proxy',` → `requestMode: 'openrouter-image',`
- 第 32 行：`requestMode: 'backend-proxy',` → `requestMode: 'openrouter-image',`
- **why**：P1-1 已统一默认值，测试断言需同步

#### A2. `src/services/localImageBridge.test.js`（重写）

- 顶部加 `vi.stubEnv('VITE_LOCAL_BRIDGE_URL', 'http://127.0.0.1:4399/api/save-image')` + `vi.resetModules()` + 动态 `import('./localImageBridge')` 获取 `saveImageToProject`
- 用例 1「把文件名和 base64 提交给本地桥接服务」：stub fetch mock → 调 `saveImageToProject` → 断言 `fetch` 用 `http://127.0.0.1:4399/api/save-image` 调用
- 用例 2「桥接失败时抛出统一错误」：stub fetch 返回 `{ ok: false }` → 断言 reject `项目目录保存失败`
- 新增用例 3「未配置 VITE_LOCAL_BRIDGE_URL 时抛错」：另起一个 describe，`vi.stubEnv('VITE_LOCAL_BRIDGE_URL', '')` + `vi.resetModules()` + 动态 import → 断言 reject `未配置本地桥接服务`
- **why**：模块加载时求值 `BRIDGE_URL`，必须 reset modules 才能注入 env

#### A3. `src/store/chat.preview.test.js`

- 用例 1（78-109 行）「生成成功后先触发浏览器下载，再尝试写入项目目录」：
  - 入参 images 改为 `[{ id: 'img-1', url: '/files/generated/test.png', localPath: '/files/generated/test.png', savedToProject: true }]`
  - 断言改为：`triggerBrowserDownload` 被调用、`saveImageToProject` **未**被调用、消息图片 `toMatchObject({ localPath: '/files/generated/test.png', savedToProject: true })`
  - 用例标题改为「生成成功后触发浏览器下载，并使用后端返回的 localPath」
- 用例 2（111-131 行）「本地桥接失败时仍然保留图片消息」：
  - 标题改为「后端未保存时仍保留图片消息且 savedToProject 为 false」
  - 移除 `saveImageToProject` spy，断言 `localPath: ''`、`savedToProject: false`
- 用例 3（133-153 行）「图片消息仅保留内存状态，不再写入 localStorage」：
  - 移除 `saveImageToProject` spy（已不再调用），保留 `localStorage` 断言
- 用例 4（155-186 行）「后端已保存的图片不会再次调用本地桥接写盘」：保持现状（已通过）
- **why**：P1-4 移除了 `saveImageToProject` 调用，测试需匹配新行为

#### A4. `src/components/ChatArea.test.js`

- 顶部加 `vi.mock('@/services/settingsApi', ...)` 和 `vi.mock('@/services/chatApi', ...)`，提供 `getSettings`/`listTopics`/`getMessages`/`getDraft`/`createTopic`/`saveDraft` 的 noop mock（返回空值即可）
- **why**：`onMounted` 调 `bootstrap()` 会触发真实网络请求，必须 mock 阻断

### 阶段 B：新增测试覆盖（落实 bug-fix-plan.md 测试策略）

#### B1. 后端 — `server/src/db/transaction.test.js`（新建）

- 用例：成功时 commit 并释放连接、业务函数抛错时 rollback 并重新抛出、finally 始终 release
- mock pool：`{ getConnection: vi.fn().mockResolvedValue(conn) }`，conn = `{ beginTransaction/commit/rollback/release: vi.fn() }`

#### B2. 后端 — `server/src/db/repositories/draftRepository.test.js`（新建）

- 用例 1：`addReferenceImages` 用默认 pool executor 调 query（验证默认参数）
- 用例 2：`addReferenceImages` 接收自定义 executor（验证事务路径）
- 用例 3：`addReferenceImagesFromMessage` 查到 imageRows 时复用 `file_path` 插入 draft_reference_images，返回含 `sourceMessageId`
- 用例 4：`addReferenceImagesFromMessage` imageRows 为空时返回 `[]` 不插入
- 用例 5：`listReferenceImages` 映射字段（id/name/type/url/filePath/sourceMessageId）
- 用例 6：`countReferenceImages` 返回数字
- 用例 7：`saveDraft` 完成后调 `listReferenceImages` 返回完整草稿（含真实 referenceImages，修复 B2）
- 用例 8：`clearReferenceImages` 执行 DELETE

#### B3. 后端 — 扩展 `server/src/db/repositories/topicRepository.test.js`

- 新增用例：`saveGeneratedConversation` 接收自定义 executor（验证事务路径）
- 新增用例：`saveGeneratedConversation` images 为 undefined 时不抛 TypeError（防御性 `safeImages`，P2-4）
- 新增用例：`verifyMessageBelongsToTopic` 属于/不属于分别返回 true/false
- 新增用例：`listTopicFilePaths` 跨两表查询并用 Set 去重
- 新增用例：`deleteTopic` 主题不存在返回 false；存在时按 5 步顺序 DELETE 返回 true

#### B4. 后端 — 扩展 `server/src/test/imageRoutes.test.js`

- 新增用例：上传超过 10MB 的文件返回 400（multer LIMIT_FILE_SIZE，走错误中间件）
- 新增用例：上传 text/plain 文件返回 400（fileFilter 拒绝）
- 新增用例：`POST /topics/:topicId/references/from-message` 成功返回 201 + `{ referenceImages: [...] }`
- 新增用例：`POST /topics/:topicId/references/from-message` imageIds 为空返回 400
- 新增用例：`POST /topics/:topicId/references/from-message` 消息不属于主题返回 404

#### B5. 后端 — 扩展 `server/src/test/topicRoutes.test.js`

- 新增用例：`DELETE /topics/:topicId` 成功返回 204（注入 `topicService.deleteTopic` mock）
- 新增用例：`DELETE /topics/:topicId` 主题不存在返回 404（mock 抛 `err.status = 404`）
- 新增用例：`DELETE /topics/:topicId` 未注入 topicService 返回 501

#### B6. 后端 — 扩展 `server/src/test/server.test.js`

- 新增用例：`/api/health` 注入 `healthCheck` 成功返回 `{ ok: true, db: 'up' }`
- 新增用例：`/api/health` 注入 `healthCheck` 抛错返回 503 + `{ ok: false, db: 'down' }`
- 新增用例：内部错误（imageService 抛普通 Error）返回 500 + `{ message: 'internal server error' }`，不泄露 error.message
- 新增用例：客户端错误（imageService 抛 `err.status = 400`）返回 400 + 具体消息

#### B7. 前端 — `src/utils/constants.test.js`（新建）

- 用例：`MAX_REFERENCE_IMAGES === 16`

#### B8. 前端 — 扩展 `src/utils/download.test.js`

- 新增用例：`triggerBrowserDownload` 传入 `/files/generated/test.png` 时 href 拼接 `backendClient.defaults.baseURL`
- 新增用例：`triggerBrowserDownload` 传入 data URL 时 href 原样

#### B9. 前端 — 扩展 `src/services/uploadApi.test.js`

- 新增用例：`registerReferenceFromMessage('topic-1', { messageId: 'msg-1', imageIds: ['img-1'] })` 调 `backendClient.post` 用 `/api/topics/topic-1/references/from-message` + JSON body

#### B10. 前端 — 扩展 `src/services/chatApi.test.js`

- 新增用例：`deleteTopic('topic-1')` 调 `backendClient.delete` 用 `/api/topics/topic-1`
- 注意：现有 chatApi.test.js 用 `vi.mock('axios')` mock 整个 axios，新增用例需补 `deleteMock`

#### B11. 前端 — 扩展 `src/store/chat.test.js`（新增 deleteTopic action 用例）

- 新增用例：`deleteTopic` 调 API → 从 topics 移除 → 从 messages 过滤 → delete drafts[topicId]
- 新增用例：`deleteTopic` 删当前主题时切到列表第一个
- 新增用例：`deleteTopic` 删最后一个主题时创建新主题
- 需要 mock `@/services/uploadApi` 的 `deleteReferenceImage`/`registerReferenceFromMessage`（chat.js 顶部 import 了）

#### B12. 前端 — 扩展 `src/store/chat.references.test.js`（新增 addReferenceFromMessage 用例）

- 新增用例：`addReferenceFromMessage` 成功时调 `registerReferenceFromMessage` 并更新 `currentDraft.referenceImages`
- 新增用例：已达 16 张上限时设 `lastError` 且不调 API
- 新增用例：API 失败时设 `lastError`
- 需要 mock `@/services/uploadApi`

#### B13. 前端 — 扩展 `src/components/Sidebar.test.js`

- 新增用例：topic-item hover 后显示删除按钮（`.topic-delete` 存在）
- 新增用例：点删除按钮触发 `window.confirm`，确认后调 `chatStore.deleteTopic`
- 用 `vi.spyOn(window, 'confirm').mockReturnValue(true)` 跳过弹窗

### 阶段 C：更新 README

#### C1. 顶部加安全提示

在 `# ai-chat-draw` 标题下、`## 启动方式` 上方插入：

```markdown
## ⚠️ 安全提示

历史 commit 中曾包含已泄露的 OpenRouter API key（`REMOVED_SECRET-e05e...`）。**部署前必须**：
1. 到 [OpenRouter 控制台](https://openrouter.ai/keys) 撤销该 key
2. 签发新 key 并写入 `server/.env` 的 `OPENROUTER_API_KEY`
3. 确认 `server/.env` 已被 `.gitignore` 忽略（本次已修复）
```

#### C2. 更新「默认环境变量」段

后端 `server/.env` 补充：
- `CORS_ORIGIN`（可选，逗号分隔白名单，默认 `*`）

前端 `.env.local` 补充：
- `VITE_LOCAL_BRIDGE_URL`（可选，仅当需要把生成图额外保存到项目本地目录时配置；默认不启用）

#### C3. 更新「记忆存储」段

补充：
- 参考图通过 `draft_reference_images` 表持久化，「设为参考图」复用 `message_images.file_path` 不复制文件
- 删除主题会事务级联清理 `topics`/`messages`/`message_images`/`drafts`/`draft_reference_images` 5 张表，并 best-effort 清理磁盘文件

#### C4. 新增「健康检查」段

```markdown
## 健康检查

后端提供 `GET /api/health`：
- 成功返回 `200 { ok: true, db: 'up' }`
- DB 不可达返回 `503 { ok: false, db: 'down' }`
```

### 阶段 D：最终验证

1. `cd /Users/dongdongpromax/BrainHub/Code/Demo/ai-chat-draw && npm run test` → 期望全绿
2. `cd /Users/dongdongpromax/BrainHub/Code/Demo/ai-chat-draw/server && npm run test` → 期望全绿
3. 安全 grep：
   - `grep -r "REMOVED_SECRET" server/ src/` → 无结果
   - `git ls-files | grep -E "\.env$"` → 无结果
4. 验证 `.gitignore` 含 `server/.env`（已有）

---

## 假设与决策

1. **不重写 git 历史**（用户已决策）：仅靠 README 提示轮换 key
2. **P2-5 文件 GC 兜底任务不在本计划**：`bug-fix-plan.md` 明确标注最低优先级可选，留作后续运维任务
3. **测试不改源码**：本计划所有改动仅限测试文件和 README，不触碰已完成的源码
4. **沿用现有测试模式**：后端 `createXxx({ query })` + supertest；前端 `vi.hoisted` + `vi.mock`，保持风格一致
5. **中文注释**：每个新测试文件顶部加 JSDoc 中文说明，describe/it 用中文描述
6. **mock 策略**：所有外部依赖（axios/fetch/DB）一律 mock，不触发真实网络与 DB

## 关键文件清单

**修改的测试文件**（5 个失败修复）：
- `src/config/env.test.js`
- `src/services/localImageBridge.test.js`
- `src/store/chat.preview.test.js`
- `src/components/ChatArea.test.js`

**新建的测试文件**（3 个）：
- `server/src/db/transaction.test.js`
- `server/src/db/repositories/draftRepository.test.js`
- `src/utils/constants.test.js`

**扩展的测试文件**（9 个）：
- `server/src/db/repositories/topicRepository.test.js`
- `server/src/test/imageRoutes.test.js`
- `server/src/test/topicRoutes.test.js`
- `server/src/test/server.test.js`
- `src/utils/download.test.js`
- `src/services/uploadApi.test.js`
- `src/services/chatApi.test.js`
- `src/store/chat.test.js`
- `src/store/chat.references.test.js`
- `src/components/Sidebar.test.js`

**修改的文档**：
- `README.md`

## 验证步骤

1. 运行 `npm run test`（前端）→ 期望 0 失败
2. 运行 `cd server && npm run test`（后端）→ 期望 0 失败
3. 运行 `grep -r "REMOVED_SECRET" server/ src/` → 期望无结果
4. 运行 `git ls-files | grep -E "\.env$"` → 期望无结果
5. 检查 README 含安全提示段、健康检查段、CORS_ORIGIN/VITE_LOCAL_BRIDGE_URL 说明

## 实施顺序

1. 阶段 A：先修 5 个失败测试 → 跑一次确认基线全绿
2. 阶段 B：按 B1→B13 顺序新增测试（后端先行，前端跟进），每加 2-3 个跑一次测试
3. 阶段 C：更新 README
4. 阶段 D：最终全量验证
