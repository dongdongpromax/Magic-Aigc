# ai-chat-draw 全栈 Bug 修复计划

## Context（背景）

用户反馈项目存在数据存储等 bug 需要统一处理。经系统排查（systematic-debugging Phase 1：阅读错误、复现路径、检查最近变化、跨组件收集证据、追踪数据流），在 Vue 3 + Node.js + Express + MySQL + Docker 的全栈链路上定位到 20+ 个问题，覆盖**安全（API Key 泄露、上传校验缺失、路径遍历、错误信息泄露）**、**数据一致性（多步 DB 操作无事务、孤儿文件、参考图不持久化、无删除主题 API）**、**功能正确性（默认值不一致、静默吞错、下载相对路径失效、端口硬编码）**、**代码质量（死代码、timer 未清理、防御性判空）** 四大类。

用户已确认：① API Key 历史暂不重写 git，仅本次移除+提醒轮换；② 新增完整「删除主题」功能；③ 移除 localImageBridge 前端调用、模块端口改为 env 注入；④ P0+P1+P2 全做。

预期结果：所有列出的问题修复完毕，前后端测试全部通过，README 更新说明运维侧需轮换 key。

## 代码风格约定

- 现有项目采用 **函数式工厂模式**（`createXxx(deps)`），**保持一致**，不强加 OOP
- 所有新代码遵循现有 ESM `import`、`export function` 风格
- 中文注释：每个新文件/类/函数加 JSDoc 中文说明，关键逻辑行加注释
- 文件命名：kebab-case 或 camelCase 与现有文件对齐

---

## 阶段 P0 — 安全 + 数据一致性（必须立即修）

### P0-1 移除被跟踪的 server/.env（A0）

- **改 `.gitignore`**：追加 `server/.env`、`.env`（保留 `.env.example`）
- **执行**：`git rm --cached server/.env`（仅从索引移除，本地文件保留）
- **不重写历史**（用户决策），但在 README 顶部加安全提示：历史 commit 含已泄露 key，必须到 OpenRouter 控制台撤销 `REMOVED_SECRET-e05e...` 并签发新 key

### P0-2 移除 env.js 硬编码 API Key 默认值（A1）

- **改 `server/src/config/env.js:16-18`**：
  ```js
  openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
  ```
- **改 `server/src/modules/images/openrouterClient.js`**：apiKey 为空时抛 `Error('OPENROUTER_API_KEY 未配置')`，避免空 Bearer 401 困惑

### P0-3 multer 上传大小与类型校验（A4）

- **改 `server/src/modules/images/routes.js:4`**：
  ```js
  const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 16 },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_MIME.has(file.mimetype)) {
        return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE'), false)
      }
      cb(null, true)
    },
  })
  ```

### P0-4 净化上传文件名（A5）

- **改 `server/src/modules/images/fileStorage.js:14-24`** `writeReferenceFile`：
  ```js
  const safeExt = path.extname(file.originalname || '').toLowerCase()
  const safeBase = path.basename(file.originalname || 'upload', safeExt)
    .replace(/[^\w\u4e00-\u9fa5.-]/g, '_')
    .slice(0, 64) || 'upload'
  const fileName = `${Date.now()}-${safeBase}${safeExt || '.png'}`
  ```
  - `path.basename` 去 `../`，正则白名单防注入字符

### P0-5 引入事务机制（A2 + A3 + B3 核心）

#### 步骤 1：新建事务辅助模块

- **新文件 `server/src/db/transaction.js`**：
  ```js
  /**
   * 在单个数据库连接上执行事务
   * @param {import('mysql2/promise').Pool} pool 连接池
   * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<T>} fn 业务函数
   * @returns {Promise<T>}
   */
  export async function runTransaction(pool, fn) {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const result = await fn(conn)
      await conn.commit()
      return result
    } catch (err) {
      try { await conn.rollback() } catch { /* 忽略回滚错误 */ }
      throw err
    } finally {
      conn.release()
    }
  }
  ```
  - 集中处理 begin/commit/rollback/release，避免样板代码泄漏

#### 步骤 2：三个仓储接收可选 `executor` 参数（默认 `pool`，鸭子类型兼容）

- **改 `server/src/db/repositories/topicRepository.js`**：
  - `saveGeneratedConversation(payload, executor = pool)` — 内部 `pool.query` → `executor.query`
  - 新增 `verifyMessageBelongsToTopic(topicId, messageId, executor = pool)`
  - 新增 `deleteTopic(topicId, executor = pool)`（事务内执行 5 表 DELETE，详见 P0-8）
  - 新增 `listTopicFilePaths(topicId, executor = pool)`（收集生成图+参考图路径用于文件清理）
- **改 `server/src/db/repositories/draftRepository.js`**：
  - `addReferenceImages(topicId, items, executor = pool)`
  - `clearReferenceImages(topicId, executor = pool)`
  - `saveDraft(topicId, payload, executor = pool)`
  - `removeReferenceImage(topicId, referenceId, executor = pool)`
  - 新增 `addReferenceImagesFromMessage(topicId, messageId, imageIds, executor = pool)`（详见 P0-7）
  - 新增 `listReferenceImages(topicId, executor = pool)`（供 saveDraft 和 addReferenceImagesFromMessage 返回最新列表）
- **改 `server/src/db/repositories/settingsRepository.js`**：暂不需事务，保持不变

#### 步骤 3：server.js `generateImageMessage` 包裹事务 + 文件清理

- **改 `server/src/server.js:73-137`**：
  - API 调用在前（失败时未写文件，无需清理）
  - 文件写盘在事务前（b64 太大不便持连接），用 `writtenPaths` 数组记录
  - 三步 DB 操作（saveGeneratedConversation + clearReferenceImages + saveDraft）合并到 `runTransaction(pool, async (conn) => {...})`
  - catch 中 best-effort `fs.unlink` 所有 `writtenPaths`，失败仅 `console.warn`

### P0-6 错误处理中间件分类脱敏（A6）

- **改 `server/src/app.js:32-36`**：
  ```js
  import { MulterError } from 'multer'

  function isClientError(error) {
    if (error instanceof MulterError) return true
    if (error?.name === 'ValidationError') return true
    if (error?.status && error.status >= 400 && error.status < 500) return true
    return false
  }

  app.use((error, _req, res, _next) => {
    if (isClientError(error)) {
      return res.status(error.status || 400).json({ message: error.message })
    }
    console.error('[unhandled]', error)
    res.status(500).json({ message: 'internal server error' })
  })
  ```

### P0-7 「设为参考图」持久化（A7 + A8）

#### 后端契约

- **新增端点**：`POST /api/topics/:topicId/references/from-message`
- **请求体**：`{ "messageId": "msg-uuid", "imageIds": ["img-uuid-1", "img-uuid-2"] }`
- **响应**：`{ "referenceImages": [{ id, name, type, url, filePath, sourceMessageId }] }`
- **错误码**：400（imageIds 空 / 超 16 张上限）、404（message 不属于 topic / image 不属于 message）
- **实现**（在 `runTransaction` 内）：
  1. `verifyMessageBelongsToTopic(topicId, messageId, conn)` — 不属于则 404
  2. `SELECT id, file_path, file_name, mime_type FROM message_images WHERE id IN (?) AND message_id = ?` — 同时校验归属
  3. `SELECT COUNT(*) FROM draft_reference_images WHERE topic_id = ?` — 校验 16 上限
  4. INSERT 到 `draft_reference_images`，**file_path 复用 message_images.file_path（不复制文件）**，`source_message_id = messageId`
  5. 返回 `listReferenceImages(topicId, conn)` 最新列表
- **改文件**：
  - `server/src/db/repositories/draftRepository.js` 新增 `addReferenceImagesFromMessage`、`listReferenceImages`、`countReferenceImages`
  - `server/src/db/repositories/topicRepository.js` 新增 `verifyMessageBelongsToTopic`
  - `server/src/server.js` 的 `imageService` 新增 `registerReferenceFromMessage(topicId, { messageId, imageIds })`
  - `server/src/modules/images/routes.js` 新增 `router.post('/topics/:topicId/references/from-message', ...)`

#### 前端调用

- **新文件 `src/utils/constants.js`**：`export const MAX_REFERENCE_IMAGES = 16`
- **改 `src/components/InputConsole.vue:14`**：改为 `import { MAX_REFERENCE_IMAGES } from '@/utils/constants'`
- **改 `src/services/uploadApi.js`**：新增 `registerReferenceFromMessage(topicId, { messageId, imageIds })` 调 POST 端点
- **改 `src/store/chat.js`**：新增 action `addReferenceFromMessage(message)`：
  - 计算剩余配额 `remain = 16 - currentCount`
  - 超限设 `lastError.value = '参考图已达 16 张上限'`
  - `imageIds = message.images.slice(0, remain).map(i => i.id)`
  - 调 API → `currentDraft.value.referenceImages = response.referenceImages` → 清 `lastError`
  - 失败 → `lastError.value = getReadableError(err)`
  - 新增 `isAddingReference` ref 防双击
- **改 `src/components/ChatArea.vue:17-39`**：`handleRefine`/`handleReference` 改为调 `chatStore.addReferenceFromMessage(message)`

### P0-8 删除主题 API + 文件清理（A9）

#### 后端契约

- **新增端点**：`DELETE /api/topics/:topicId`
- **响应**：204（成功）、404（主题不存在）
- **事务顺序**（在 `runTransaction` 内）：
  1. `SELECT id FROM topics WHERE id = ?` — 不存在 404
  2. 收集文件路径：`SELECT file_path FROM message_images mi JOIN messages m ON mi.message_id = m.id WHERE m.topic_id = ?` + `SELECT file_path FROM draft_reference_images WHERE topic_id = ?`，用 Set 去重
  3. `DELETE FROM message_images WHERE message_id IN (SELECT id FROM messages WHERE topic_id = ?)`
  4. `DELETE FROM messages WHERE topic_id = ?`
  5. `DELETE FROM draft_reference_images WHERE topic_id = ?`
  6. `DELETE FROM drafts WHERE topic_id = ?`
  7. `DELETE FROM topics WHERE id = ?`
- **事务后 best-effort**：遍历文件路径 `fs.unlink`，失败仅 `console.warn`
- **改文件**：
  - `server/src/db/repositories/topicRepository.js` 新增 `deleteTopic(topicId, executor)` 和 `listTopicFilePaths(topicId, executor)`
  - `server/src/server.js` 的 `imageService` 同级注入 `topicService.deleteTopic`（推荐新增 `server/src/modules/topics/service.js` 承载）
  - `server/src/modules/topics/routes.js` 新增 `router.delete('/topics/:topicId', ...)`

#### 前端

- **改 `src/services/chatApi.js`**：新增 `deleteTopic(topicId)`
- **改 `src/store/chat.js`**：新增 action `deleteTopic(topicId)`：
  - 调 API → 从 `topics.value` 移除 → 从 `messages.value` 过滤 → `delete drafts[topicId]`
  - 若删的是当前 topic → 切到列表第一个；列表空则 `createTopic('新建创作')`
- **改 `src/components/Sidebar.vue`**：topic-item 加删除按钮（hover 显示），点击用 Naive UI `useDialog` 弹确认框

---

## 阶段 P1 — 功能正确性

### P1-1 统一 requestMode 默认值（B1）

- **改 `src/config/env.js:14`**：`requestMode: 'openrouter-image'`
- **改 `server/src/db/repositories/settingsRepository.js:35`**：`requestMode: payload.requestMode || 'openrouter-image'`
- **改测试**：`src/config/env.test.js:16, 31` 断言改为 `'openrouter-image'`；建议同步 `chat.test.js:71`、`chat.preview.test.js:71`、`chat.references.test.js:71`、`settingsApi.test.js:10` 的 mock 值

### P1-2 saveDraft 返回真实 referenceImages（B2）

- **改 `server/src/db/repositories/draftRepository.js:30-58`**：saveDraft 完成后调 `listReferenceImages(topicId, executor)` 返回完整 draft（含真实 referenceImages）

### P1-3 取消静默吞错（B4）

- **改 `src/store/chat.js:218, 234`**：
  ```js
  .catch((err) => { lastError.value = `草稿保存失败：${err?.message || ''}` })
  ```
  settings 同理。UI 已有 `lastError` 显示在 ConnectionBadge

### P1-4 移除 localImageBridge 前端调用（B5）

- **改 `src/store/chat.js`**：
  - 移除 `import { saveImageToProject }`
  - 简化 `completeImageGeneration`：后端已返回 `localPath/savedToProject` 时直接用；后端返回 data URL 时 `savedToProject = false`，不再调桥接
- **改 `src/services/localImageBridge.js`**：`BRIDGE_URL = import.meta.env.VITE_LOCAL_BRIDGE_URL || ''`，空时 `saveImageToProject` reject 并写明"未配置本地桥接"
- **重写测试 `src/store/chat.preview.test.js`** 三个用例：改为断言 `triggerBrowserDownload` 调用 + `localPath` 来自后端返回值

### P1-5 triggerBrowserDownload 支持相对路径（B7）

- **改 `src/utils/download.js:29-35`**：
  ```js
  import { backendClient } from '@/services/backendClient'

  export function triggerBrowserDownload({ dataUrl, fileName }) {
    const href = dataUrl.startsWith('/')
      ? `${backendClient.defaults.baseURL}${dataUrl}`
      : dataUrl
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = fileName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }
  ```

### P1-6 /api/health 检查 DB（C1）

- **改 `server/src/app.js:18-20`**：createApp 接收 `deps.healthCheck`；失败返回 503 + `{ ok: false, db: 'down' }`，成功 200 + `{ ok: true, db: 'up' }`
- **改 `server/src/server.js`**：把 `verifyDatabaseConnection` 作为 `healthCheck` 注入

### P1-7 抽 MAX_REFERENCE_IMAGES 常量 + UI 防双击

- 已在 P0-7 步骤里完成常量抽取；UI 防双击在 `addReferenceFromMessage` 期间 `isAddingReference = true`，按钮 disabled

---

## 阶段 P2 — 代码质量与清理

### P2-1 store timer 清理（B6）

- **改 `src/store/chat.js:54-55`**：暴露 `dispose` 方法
  ```js
  function dispose() {
    draftTimers.forEach((t) => clearTimeout(t))
    draftTimers.clear()
    if (settingsTimer) clearTimeout(settingsTimer)
  }
  return { /* ... */, dispose }
  ```

### P2-2 删除死代码 storage.js（B8）

- **删除 `src/utils/storage.js`**（全仓无引用，README 明确不再用 localStorage）

### P2-3 CORS 限制 origin（C2，可选）

- **改 `server/src/app.js:14`**：`app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || '*' }))`

### P2-4 cover_image_path 防御性判空（C3）

- **改 `server/src/db/repositories/topicRepository.js:188`**：
  ```js
  cover_image_path = ? 参数改为 (Array.isArray(images) && images.length ? images[0]?.url : null)
  ```

### P2-5 文件 GC 兜底任务（可选，应对 P0-5/P0-8 文件清理失败的长期方案）

- **新文件 `server/src/modules/images/gc.js`**：定时扫描 storage 目录，对每个文件查 DB 是否有引用，无引用且文件年龄 > 1 小时则删除
- 优先级最低，可作为后续运维任务

---

## 关键设计决策

### 事务方案：仓储层接收可选 executor + 服务层包裹事务

**选择理由**：
- mysql2 的 `pool` 和 `PooledConnection` 都暴露 `.query()`，鸭子类型兼容，无需新接口
- 默认参数 `executor = pool` 保证非事务调用零侵入，老测试不需要改 mock
- 服务层 `runTransaction(pool, async (conn) => {...})` 显式声明事务边界

**事务边界**：
| 场景 | 事务范围 | 文件操作 |
|---|---|---|
| 生成图片 | saveGeneratedConversation + clearReferenceImages + saveDraft | 文件先写盘 → DB 事务 → 失败 best-effort unlink |
| 删除主题 | 5 表 DELETE | DB 事务提交后 best-effort unlink |
| 设为参考图 | verifyMessage + selectImages + insertReferences | 不涉及（复用文件） |
| 新增参考图 | addReferenceImages for 循环 | 不涉及 |
| 创建主题 | createTopic + saveDraft | 不涉及；顺便修 |

### 「设为参考图」复用 file_path 而非复制文件

- `message_images.file_path` 已指向 `server/storage/generated/xxx.png`，文件存在且不变
- 复制浪费磁盘和 IO，且无法纳入 DB 事务
- 删除 topic 时一并删文件，引用关系简单

---

## 测试策略

### 受影响的现有测试

| 测试文件 | 影响 | 处理 |
|---|---|---|
| `server/src/db/repositories/topicRepository.test.js` | 默认 executor = pool 不破坏 | 不改；新增事务版本测试 |
| `server/src/test/imageRoutes.test.js` | multer 加 limits 后 fixture 需真实 mimetype | 修改 fixture |
| `server/src/test/topicRoutes.test.js` | 新增 DELETE 不影响 GET/POST | 不改；新增 DELETE 测试 |
| `server/src/test/server.test.js` | health 默认不注入 healthCheck 保持 200 | 不改；新增 DB down 测试 |
| `src/config/env.test.js:16, 31` | 断言 requestMode 改 | 改为 `'openrouter-image'` |
| `src/store/chat.preview.test.js:71, 91-94, 110-130, 155-186` | 三个用例断言 saveImageToProject | 重写为后端 localPath 路径 |
| `src/services/localImageBridge.test.js` | BRIDGE_URL 改 env | stub env 或更新断言 |
| `src/components/Sidebar.test.js` | 新增删除按钮 | 检查并更新 |

### 新增测试清单

**后端**：
1. `server/src/db/transaction.test.js` — commit / rollback / release
2. `topicRepository.test.js` 扩展 — executor 路径、deleteTopic、verifyMessageBelongsToTopic
3. `draftRepository.test.js`（新建）— addReferenceImages 事务化、addReferenceImagesFromMessage 校验+复用 file_path+上限 400、saveDraft 返回真实 referenceImages
4. `imageRoutes.test.js` 扩展 — 11MB 返回 413、text/plain 返回 400、POST from-message 成功/上限/不属于、DELETE topic 成功 204/404/文件清理
5. `server.test.js` 扩展 — health DB down 返回 503、500 不泄露 SQL 消息

**前端**：
6. `uploadApi.test.js` 扩展 — registerReferenceFromMessage
7. `chatApi.test.js` 扩展 — deleteTopic
8. `chat.test.js` 扩展 — deleteTopic action
9. `chat.references.test.js` 扩展 — addReferenceFromMessage 成功/超限/失败
10. `download.test.js` 扩展 — 相对路径拼接 baseURL
11. `constants.test.js`（新建）— MAX_REFERENCE_IMAGES === 16

### 测试执行

- 后端：`cd server && npm run test`
- 前端：`npm run test`
- 集成 smoke test：Docker Compose 起来后 → 上传参考图 → 生成 → 设为参考图 → 刷新页面验证持久化 → 删除主题 → 验证文件清理

---

## 实施顺序

### P0（按依赖排序）
1. P0-1 移除 server/.env + .gitignore
2. P0-2 env.js 移除硬编码默认值
3. P0-5 步骤 1 新建 transaction.js
4. P0-5 步骤 2 三个仓储接收 executor
5. P0-5 步骤 3 server.js generateImageMessage 包裹事务 + 文件清理
6. P0-3 + P0-4 multer 校验 + 文件名净化
7. P0-6 错误处理中间件（在 P0-3 之后改，multer 错误走新中间件）
8. P0-7 后端 POST /topics/:topicId/references/from-message
9. P0-7 前端 store + ChatArea 改造
10. P0-8 后端 DELETE /topics/:topicId
11. P0-8 前端 Sidebar + store action

### P1
12. P1-1 统一 requestMode + 更新 env.test.js
13. P1-2 saveDraft 返回真实 referenceImages
14. P1-3 取消静默 catch
15. P1-4 移除 localImageBridge 调用 + 重写 chat.preview.test.js
16. P1-5 triggerBrowserDownload 支持相对路径
17. P1-6 health 检查 DB

### P2
18. P2-1 store dispose
19. P2-2 删除 storage.js
20. P2-3 CORS 限制（可选）
21. P2-4 cover_image_path 判空
22. P2-5 文件 GC 任务（可选）

---

## 关键风险与缓解

1. **API Key 已外泄**：本次仅移除文件，历史 commit 仍有 key。**必须**在 OpenRouter 控制台撤销旧 key 签发新 key，否则修复无效。README 顶部加安全提示。
2. **事务持有连接时间**：生成图片事务含 N 次 INSERT（最多 4 张图），<100ms，连接池 10 够用；若未来 n 上调到 16 需评估
3. **文件清理 best-effort**：P0-5 和 P0-8 的 unlink 可能失败留孤儿；P2-5 GC 任务兜底
4. **「设为参考图」行为变化**：从瞬时同步赋值改为异步 API 调用，需 loading 状态 + Naive UI `useMessage` 提示
5. **删除主题竞态**：删 topic 时另一请求正在生成图片可能产生孤儿文件；可接受，GC 兜底
6. **测试重写量**：`chat.preview.test.js` 三个用例和 `localImageBridge.test.js` 需要重写，是 P1 工作量最大的一块
7. **向后兼容**：仓储 executor 参数默认 pool，现有调用零侵入；新方法必须支持 executor

---

## 关键文件清单

**后端**：
- `server/src/server.js` — generateImageMessage 事务化、新增 registerReferenceFromMessage、注入 healthCheck
- `server/src/app.js` — 错误中间件、health 端点、CORS
- `server/src/db/transaction.js`（新建）— runTransaction 辅助
- `server/src/db/repositories/topicRepository.js` — executor 参数、deleteTopic、verifyMessageBelongsToTopic、listTopicFilePaths
- `server/src/db/repositories/draftRepository.js` — executor 参数、addReferenceImagesFromMessage、listReferenceImages、countReferenceImages
- `server/src/db/repositories/settingsRepository.js` — requestMode 默认值
- `server/src/modules/images/routes.js` — multer 校验、新端点
- `server/src/modules/images/fileStorage.js` — 文件名净化
- `server/src/modules/images/openrouterClient.js` — apiKey 空校验
- `server/src/modules/topics/routes.js` — DELETE 端点
- `server/src/modules/topics/service.js`（新建）— deleteTopic 服务
- `server/src/config/env.js` — 移除硬编码 key
- `.gitignore` — 追加 server/.env

**前端**：
- `src/store/chat.js` — addReferenceFromMessage、deleteTopic、dispose、移除 saveImageToProject、lastError 提示
- `src/components/ChatArea.vue` — handleRefine/handleReference 改造
- `src/components/Sidebar.vue` — 删除按钮
- `src/components/InputConsole.vue` — 引用常量
- `src/services/uploadApi.js` — registerReferenceFromMessage
- `src/services/chatApi.js` — deleteTopic
- `src/services/localImageBridge.js` — 端口 env 化
- `src/utils/download.js` — 相对路径支持
- `src/utils/constants.js`（新建）— MAX_REFERENCE_IMAGES
- `src/config/env.js` — requestMode 默认值
- `src/utils/storage.js`（删除）

---

## 验证方式

### 单元测试
```bash
cd /Users/dongdongpromax/BrainHub/Code/Demo/ai-chat-draw && npm run test
cd /Users/dongdongpromax/BrainHub/Code/Demo/ai-chat-draw/server && npm run test
```
全部通过且新增测试覆盖事务路径、上传校验、新 API。

### 集成 smoke test
```bash
docker compose up -d mysql backend
npm run dev
```
1. 打开前端，创建主题
2. 上传 1 张 png 参考图（< 10MB）→ 验证成功
3. 上传 text/plain 文件 → 验证返回 400
4. 上传 11MB 图片 → 验证返回 413
5. 输入 prompt 生成图片 → 验证 messages 表写入、文件落盘
6. 点「设为参考图」→ 刷新页面 → 验证 referenceImages 仍在
7. 点 17 次上传 → 验证第 17 次被拒
8. 删除主题 → 验证 topics/messages/drafts/draft_reference_images/message_images 全部清理、文件删除
9. 关闭 MySQL 容器 → /api/health 返回 503

### 安全验证
- `grep -r "REMOVED_SECRET" server/` 应无结果
- `git ls-files | grep ".env$"` 应无结果
- 上传 `../../../etc/passwd` 文件名 → 验证文件名被净化为 `timestamp-etc-passwd`
- 触发 SQL 错误 → 验证响应是 `{ message: 'internal server error' }`，不含 SQL 细节

### README 更新
- 顶部加「⚠️ 安全提示：历史 commit 含已泄露 OpenRouter API key，部署前必须到 OpenRouter 控制台撤销 `REMOVED_SECRET-e05e...` 并签发新 key」
- 「记忆存储」段补充：参考图通过 draft_reference_images 表持久化，删除主题会级联清理
