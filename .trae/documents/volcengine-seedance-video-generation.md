# 火山引擎 Seedance 视频生成适配方案

## Context

用户购买了火山引擎中转站（baseUrl 格式 `https://ark.cn-beijing.volces.com/api/v3`），需要适配 Seedance 视频生成模型。当前项目只支持 OpenAI 兼容的图像生成（`POST {baseUrl}/images`，同步返回），而 Seedance 视频生成是火山专属的异步任务接口（`POST {baseUrl}/contents/generations/tasks` → 轮询 `GET .../tasks/{id}`），请求体格式、响应格式、交互模式完全不同。

**目标**：基础功能优先——文生视频 + 图生视频（首帧参考图），后端轮询，前端零轮询逻辑。现有图像功能不受影响。

## 火山 Seedance API 规范

- 创建任务：`POST {baseUrl}/contents/generations/tasks`
  - 请求体：`{ model, content: [{type:'text',text}, {type:'image_url',image_url:{url}}], ratio, duration, watermark:false }`
  - ratio：`16:9|4:3|1:1|3:4|9:16|21:9|adaptive`，默认 `16:9`
  - duration：4-15 整数，默认 5
  - 响应：`{ id: 'cgt-xxx' }`
- 查询任务：`GET {baseUrl}/contents/generations/tasks/{id}`
  - 响应：`{ id, model, status:'queued|running|succeeded|failed', content:{video_url,last_frame_url}, usage, error:{message} }`
- 鉴权：`Authorization: Bearer {api_key}`
- 首帧图：`content` 数组加 `{type:'image_url',image_url:{url}}`，url 支持 base64 data URL
- 模型 ID：`doubao-seedance-2-0-260128`、`doubao-seedance-2-0-fast-260128` 等

## 实现方案

### 1. 数据库迁移 — `server/src/db/seedProviders.js`

- `migrateProvidersSchema` 末尾追加幂等加列：`provider_models.is_video TINYINT(1) DEFAULT 0`（复用现有 `ensureColumn` 函数）
- `PRESET_PROVIDERS` 末尾追加火山引擎预设：`{ id:'volcengine', name:'火山方舟', baseUrl:'https://ark.cn-beijing.volces.com/api/v3', color:'#ff6b35', enabled:0 }`
- 追加 `upsertPresetProvider(pool, preset)` 幂等函数（INSERT IGNORE），在 `migrateProvidersSchema` 后调用，让旧部署也拿到火山预设

### 2. Provider 仓储 — `server/src/db/repositories/providersRepository.js`

- `mapModelRow` 增加 `isVideo: Boolean(row.is_video)`
- `listProviders` 的 enabledModels 子查询 SELECT 增加 `is_video`，构造简表时带上 `isVideo`
- `addModel` / `upsertFetchedModels` 的 INSERT 语句增加 `is_video` 列；`upsertFetchedModels` 的 ON DUPLICATE KEY UPDATE 增加 `is_video = VALUES(is_video)`

### 3. Provider 服务 — `server/src/modules/providers/providersService.js`

- 新增 `VIDEO_KEYWORDS = ['seedance','wanx','cogvideox','kling','sora','hunyuan-video','vidu','minimax-video']` 和 `isVideoModelId(modelId)` 函数（与现有 `isImageModelId` 平行）
- `fetchModels` 的 `toUpsert` 增加 `isVideo: isVideoModelId(m.id)`
- `addModel` 增加 `isVideo: isVideoModelId(data.modelId)`

### 4. 视频 Payload — `server/src/modules/providers/videoPayload.js`（新建）

- 导出 `VIDEO_RATIOS` 常量和 `buildVideoPayload({model, prompt, ratio, duration, firstFrameUrl})` 函数
- 构建 Seedance 请求体：content 数组（text + 可选 image_url）、ratio 校验（不在枚举内回退 `16:9`）、duration 范围截断（4-15）、watermark=false

### 5. 上游客户端 — `server/src/modules/providers/upstreamClient.js`

返回对象内追加两个方法，复用现有 `withKeyRotation`（多 Key 轮询、401/403 换 Key）：
- `createVideoTask(provider, payload, timeout=60000)`：POST `{baseUrl}/contents/generations/tasks`，返回 `{id}`
- `getVideoTask(provider, taskId, timeout=30000)`：GET `{baseUrl}/contents/generations/tasks/{id}`，返回任务状态对象

### 6. 文件存储 — `server/src/modules/images/fileStorage.js`

新增 `writeGeneratedBuffer(fileName, buffer)` 方法：写二进制到 generated 目录，返回 `/files/generated/{fileName}`。现有 `readFileAsDataUrl(filePath, mimeType)` 直接复用于首帧参考图转 base64。

### 7. 视频服务 — `server/src/modules/videos/videoService.js`（新建）

工厂函数 `createVideoService(deps)`，核心方法 `generateVideoMessage(topicId, payload)`，完全平行于 `imageService.generateImageMessage`（server.js:195-273）：

1. `resolveReferenceInput`（复用 server.js:48-55 的逻辑）把首帧参考图转 base64 data URL（仅取 `draft.referenceImages[0]`）
2. `providersService.resolveForDraft(draft.providerId)` 解析 provider
3. `buildVideoPayload` 构建 Seedance 请求体
4. `upstreamClient.createVideoTask` 创建任务
5. `pollUntilTerminal(provider, taskId)` 轮询：每 5 秒查一次，总超时 5 分钟，succeeded 返回终态、failed 抛 502、超时抛 504
6. `downloadVideoToLocal(videoUrl, topicId)`：axios responseType arraybuffer 下载视频 → `fileStorage.writeGeneratedBuffer` 落盘
7. `runTransaction` 内：`topicRepository.saveVideoConversation` + `draftRepository.clearReferenceImages` + `draftRepository.saveDraft`（三步原子化）
8. DB 失败时 `cleanupOrphanFiles`（复用 server.js:63-77）

### 8. 视频路由 — `server/src/modules/videos/routes.js`（新建）

`createVideoRoutes({videoService})`，挂载 `POST /topics/:topicId/messages/video` → `videoService.generateVideoMessage`。参考 `modules/images/routes.js` 风格。

### 9. 消息存储 — `server/src/db/repositories/topicRepository.js`

新增 `saveVideoConversation({topicId, prompt, draft, videos}, executor)` 方法，完全平行于 `saveGeneratedConversation`（:177-276）：
- 插入 user_prompt 消息（meta_json 含 ratio/duration/providerName）
- 插入 `assistant_videos` 类型消息（meta_json 含 videoCount/ratio/duration/usage）
- 视频文件元数据写入 `message_images` 表（mime_type='video/mp4'，复用该表作「媒体文件表」）
- 更新主题封面/最近 prompt/消息计数/状态
- `listMessages`（:65-115）无需修改——视频媒体行自动读入 `images` 数组，前端按 `message.type==='assistant_videos'` 路由到 VideoMessageCard

### 10. 后端接线 — `server/src/server.js` + `server/src/app.js`

- server.js：`import { createVideoService }`，在 providersService 创建后实例化 videoService，传入 deps（providersService/upstreamClient/fileStorage/topicRepository/draftRepository/settingsRepository/pool/runTransaction/storageRoot），加入 `createApp({...,videoService})`
- app.js：`import { createVideoRoutes }`，`app.use('/api', createVideoRoutes({videoService}))`

### 11. 前端 API — `src/services/videoSession.js`（新建）

`requestVideo(topicId, payload)` → `backendClient.post('/api/topics/${topicId}/messages/video', payload)`。参考 `src/services/imageSession.js`。

### 12. 前端 Store — `src/store/chat.js`

- `transientDraft` 和 `ensureDraft` 默认值增加 `ratio:'16:9'`、`duration:5`（内存态，不持久化到 drafts 表，刷新后回默认值——简化首版，避免 draftRepository 改动）
- 新增 `completeVideoGeneration(result, prompt, originTopicId)`：平行于 `completeImageGeneration`（:462-530），追加 `assistant_videos` 消息，videos 数组 + images 兼容字段 + meta.providerName + ratio/duration
- 新增 `failVideoGeneration(error, originTopicId)`：平行于 `failImageGeneration`（:536-569）
- return 对象追加这两个函数

### 13. 前端输入 — `src/components/InputConsole.vue`

- 导入 `requestVideo`
- 新增 `selectedModelInfo` computed：从 enabledProviders 中查找复合键对应的模型对象
- 新增 `isVideoModel` computed：`selectedModelInfo?.isVideo`
- 新增 `videoRatioOptions`（7 项 ratio）和 `videoDurationOptions`（4-15 秒）
- 模板条件渲染：`isVideoModel` 时显示「比例 + 时长」面板（n-select），隐藏「尺寸 + 张数」面板
- 参考图区域：视频模型时限制 1 张、文案改为「首帧参考图」
- `handleSend` 分流：`isVideoModel` 调 `requestVideo` + `completeVideoGeneration`，否则原 `requestImages` + `completeImageGeneration`；失败也对应分流
- textarea placeholder 视频模型时改为「描述你想要的视频画面，或上传首帧让画面动起来」

### 14. 视频消息卡片 — `src/components/VideoMessageCard.vue`（新建）

参考 `ImageMessageCard.vue` 结构：
- `videoList` computed：优先读 `message.videos`，否则从 `message.images` 筛选 `mimeType` 以 `video/` 开头的项（兼容 reload 后从 message_images 表读出的数据）
- `<video :src="video.url" controls preload="metadata">` 播放器（src 是 `/files/generated/xxx.mp4`，vite proxy 已代理 `/files/` 到后端，无需拼 baseURL）
- 操作按钮：继续细化 / 再次生成 / 设为首帧 / 下载视频
- meta 展示：模型名 · 中转站名 · ratio · duration

### 15. 消息分发 — `src/components/ChatArea.vue`

- 导入 VideoMessageCard
- 消息循环增加 `v-else-if="message.type==='assistant_videos'"` 分支，路由到 VideoMessageCard
- 新增 `handleDownloadVideo(message)`：取首个视频 url，调 `triggerBrowserDownload`
- `handleRetry` 兼容视频参数回填（ratio/duration 替代 size/quality/n）

### 16. 设置页视频标签 — `src/components/settings/ProviderDetail.vue`

模型行模板追加 `<span v-if="model.isVideo" class="video-tag">视频</span>`（平行于现有的图像标签），加 `.video-tag` 样式（橙色调）。

## 关键设计决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 轮询位置 | 后端 | 与图像生成同步返回体验一致，前端零轮询逻辑 |
| 轮询间隔/超时 | 5秒/5分钟 | 覆盖 30-120 秒生成 + 排队，不刷爆上游 |
| 视频文件存储 | 复用 message_images 表 | mime_type 区分 image/video，不新增表 |
| 首帧参考图传递 | base64 data URL | 复用 readFileAsDataUrl，无需暴露公网 URL |
| ratio/duration 持久化 | 内存态（不存 drafts 表） | 简化首版，避免 draftRepository 改动，刷新回默认值可接受 |
| 视频 URL 访问 | 相对路径 `/files/...` | vite proxy 已代理 /files/ 到后端 |
| videoService 位置 | 独立模块 | 比内联 server.js 更清晰，便于测试 |

## 验证方案

1. **后端单测**：`videoPayload.test.js`（ratio/duration 校验）、`videoService.test.js`（mock upstreamClient 队列→运行→成功/失败序列，验证轮询退出与落盘）、`videoRoutes.test.js`（201 响应）
2. **前端单测**：`InputConsole.test.js` 扩展（视频面板显隐、handleSend 分流）、`VideoMessageCard.test.js`（video 元素渲染、下载触发）、`chat.test.js`（completeVideoGeneration）
3. **端到端验证**：
   - 设置页添加火山引擎中转站，填 API Key，获取模型列表（应识别 seedance 模型并标「视频」标签）
   - 选中 seedance 模型，输入 prompt，点发送，等待 30-120 秒，视频消息卡片出现并可播放
   - 上传首帧参考图，图生视频验证
   - 切换回图像模型，验证图像生成功能不受影响
   - 刷新页面，视频消息从后端 reload 后仍可播放（message_images 表持久化）
4. **运行测试**：`npm test`（前端）+ `npm run server:test`（后端）
