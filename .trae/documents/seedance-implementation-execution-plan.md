# 火山引擎 Seedance 视频生成 — 落地执行计划

> 本计划是已有设计文档 `volcengine-seedance-video-generation.md` 的「落地执行清单」补充。
> 设计文档定义「做什么 / 为什么」，本计划定义「按什么顺序做 / 在哪改 / 怎么验证」。
> 执行时两者配合阅读：本计划每步锚点均指向已核实的真实代码位置。

## 摘要

为已购买的火山引擎中转站适配 Seedance 视频生成模型。基础功能优先：**文生视频 + 图生视频（首帧参考图）**，后端轮询异步任务，前端零轮询逻辑，现有图像功能不受影响。

**关键技术事实（已核实）**：
- 创建任务：`POST {baseUrl}/contents/generations/tasks`，返回 `{id}`
- 查询任务：`GET {baseUrl}/contents/generations/tasks/{id}`，返回 `{status, content:{video_url,...}, usage, error:{message}}`
- status 终态：`succeeded` / `failed` / `cancelled` / `expired`（前两者为常规终态，后两者也需作终态处理）
- 请求体：`{ model, content:[{type:'text',text},{type:'image_url',image_url:{url}}], ratio, duration, watermark:false, return_last_frame:false }`
- 鉴权：`Authorization: Bearer {api_key}`
- video_url 为预签名链接，**24h 有效** → 后端必须下载落盘到本地，前端只访问 `/files/generated/xxx.mp4`
- China 区模型 ID 命名空间：`doubao-seedance-2-0-260128`、`doubao-seedance-2-0-fast-260128` 等

## 当前状态分析

**代码库零落地**（已逐文件核实）：
- 后端：`seedProviders.js` 无 is_video/火山预设；`providersService.js` 无 isVideoModelId；`upstreamClient.js` 无视频方法；`topicRepository.js` 无 saveVideoConversation；`fileStorage.js` 无 writeGeneratedBuffer；`videos/` 目录不存在
- 前端：`chat.js` 无 ratio/duration/completeVideoGeneration；`InputConsole.vue` 无视频面板；`VideoMessageCard.vue` 不存在；`ChatArea.vue` 无 assistant_videos 分发；`videoSession.js` 不存在；`ProviderDetail.vue` 无视频标签

**已就绪**：设计文档 `volcengine-seedance-video-generation.md`（16 步设计完整、行号准确）；图像生成链路（`imageService.generateImageMessage` @ server.js:195-273）作为视频服务的平行模板。

## 实施步骤

按依赖顺序分 5 阶段。每步标注 **[文件]** + **[锚点]** + What/Why/How。

---

### 阶段 1：后端数据层与基础设施（无外部依赖，可独立落地）

**步骤 1.1 — DB 迁移与火山预设**
- [文件] `server/src/db/seedProviders.js`
- [锚点] `migrateProvidersSchema` 末尾（:131 ensureColumn 调用之后）；`PRESET_PROVIDERS`（:11-54）末尾
- How：
  1. `migrateProvidersSchema` 末尾追加 `ensureColumn(pool,'provider_models','is_video','ALTER TABLE provider_models ADD COLUMN is_video TINYINT(1) NOT NULL DEFAULT 0 AFTER is_image')`（复用 :77-86 的 ensureColumn，幂等）
  2. `PRESET_PROVIDERS` 末尾追加 `{ id:'volcengine', name:'火山方舟', baseUrl:'https://ark.cn-beijing.volces.com/api/v3', color:'#ff6b35', enabled:0 }`
  3. 新增导出函数 `upsertPresetProvider(pool, preset)`：`INSERT INTO providers (...) VALUES (...) ON DUPLICATE KEY UPDATE name=VALUES(name), base_url=VALUES(base_url), color=VALUES(color)`（INSERT IGNORE 风格，让旧部署也拿到火山预设，不影响已存在记录的 enabled/api_keys）
  4. 在 `server.js:94 migrateProvidersSchema(pool)` 之后调用 `upsertPresetProvider(pool, 火山预设)`

**步骤 1.2 — Provider 仓储加 isVideo**
- [文件] `server/src/db/repositories/providersRepository.js`
- [锚点] `mapModelRow`（:54-66）；`listProviders` 的 enabledModels 子查询（:88-98）；`addModel`（:224-243）；`upsertFetchedModels`（:250-274）
- How：
  1. `mapModelRow` 返回对象加 `isVideo: Boolean(row.is_video)`
  2. `listProviders` 第二个 query 的 SELECT 加 `is_video`，构造简表时 `byProvider.push({ modelId, displayName, isVideo: Boolean(m.is_video) })`
  3. `addModel` INSERT 列加 `is_video`，值 `data.isVideo ? 1 : 0`
  4. `upsertFetchedModels` INSERT 列加 `is_video`（值 `m.isVideo ? 1 : 0`），ON DUPLICATE KEY UPDATE 追加 `is_video = VALUES(is_video)`

**步骤 1.3 — Provider 服务加 isVideoModelId**
- [文件] `server/src/modules/providers/providersService.js`
- [锚点] `IMAGE_KEYWORDS`（:11）与 `isImageModelId`（:18-21）之后；`fetchModels` 的 toUpsert（:113-117）；`addModel`（:133-139）
- How：
  1. 新增 `const VIDEO_KEYWORDS = ['seedance','wanx','cogvideox','kling','sora','hunyuan-video','vidu','minimax-video']` 和 `export function isVideoModelId(modelId)`（与 isImageModelId 平行）
  2. `fetchModels` 的 toUpsert map 加 `isVideo: isVideoModelId(m.id)`
  3. `addModel` 的传入对象加 `isVideo: isVideoModelId(data.modelId)`

**步骤 1.4 — fileStorage 加 writeGeneratedBuffer**
- [文件] `server/src/modules/images/fileStorage.js`
- [锚点] `writeGeneratedBase64`（:65-69）之后
- How：新增 `async writeGeneratedBuffer(fileName, buffer)`：`fs.writeFile(path.join(generatedDir, fileName), buffer)` → 返回 `/files/generated/${fileName}`。现有 `readFileAsDataUrl`（:77-82）直接复用于首帧参考图转 base64。

**步骤 1.5 — videoPayload 构建**
- [文件] `server/src/modules/providers/videoPayload.js`（新建）
- How：导出 `VIDEO_RATIOS = ['16:9','4:3','1:1','3:4','9:16','21:9','adaptive']` 和 `buildVideoPayload({model, prompt, ratio, duration, firstFrameUrl})`：
  - content 数组：先 push `{type:'text', text: prompt}`，`firstFrameUrl` 存在时 push `{type:'image_url', image_url:{url: firstFrameUrl}}`
  - ratio 不在枚举内 → 回退 `'16:9'`
  - duration 截断到 [4,15] 整数（防极端值，实际范围由上游校验）
  - 返回 `{ model, content, ratio, duration, watermark:false, return_last_frame:false }`

**步骤 1.6 — upstreamClient 加视频方法**
- [文件] `server/src/modules/providers/upstreamClient.js`
- [锚点] return 对象内 `generateImages`（:100-111）之后，复用 `withKeyRotation`（:49-74）
- How：追加两方法
  - `createVideoTask(provider, payload, timeout=60000)`：POST `${provider.baseUrl}/contents/generations/tasks`，headers `{Authorization, 'Content-Type':'application/json'}`，返回 `response.data`（含 id）
  - `getVideoTask(provider, taskId, timeout=30000)`：GET `${provider.baseUrl}/contents/generations/tasks/${encodeURIComponent(taskId)}`，headers `{Authorization}`，返回 `response.data`

---

### 阶段 2：后端视频服务与路由（依赖阶段 1）

**步骤 2.1 — topicRepository 加 saveVideoConversation**
- [文件] `server/src/db/repositories/topicRepository.js`
- [锚点] `saveGeneratedConversation`（:177-276）作为平行模板
- How：新增 `async saveVideoConversation({topicId, prompt, draft, videos}, executor=pool)`：
  - 插入 user_prompt 消息（meta_json 含 `referenceCount, providerName, ratio, duration`）
  - 插入 `assistant_videos` 类型消息（meta_json 含 `videoCount, providerName, ratio, duration, usage`）
  - 视频元数据写入 `message_images` 表：`mime_type='video/mp4'`，file_path=视频 localPath，file_name=视频 fileName（复用该表作「媒体文件表」）
  - 更新主题封面（取首帧视频 url）、last_prompt、message_count+2、status='idle'
  - 返回 assistant 消息对象（type:'assistant_videos'）
  - `listMessages`（:65-115）无需修改 —— 视频媒体行自动读入 `images` 数组，前端按 message.type 路由

**步骤 2.2 — videoService 后端轮询核心**
- [文件] `server/src/modules/videos/videoService.js`（新建）
- How：`createVideoService(deps)` 工厂，deps 含 `{providersService, upstreamClient, fileStorage, topicRepository, draftRepository, settingsRepository, pool, runTransaction, storageRoot}`。核心方法 `async generateVideoMessage(topicId, payload)`，平行于 `imageService.generateImageMessage`（server.js:195-273）：
  1. `resolveReferenceInput`（复用 server.js:48-55 逻辑，提取为模块内私有函数或直接内联）把 `draft.referenceImages[0]` 转 base64 data URL（仅取首帧）
  2. `providersService.resolveForDraft(draft.providerId)` 解析 provider
  3. `buildVideoPayload({model:draft.model, prompt, ratio:draft.ratio, duration:draft.duration, firstFrameUrl})` 构建请求体
  4. `upstreamClient.createVideoTask(provider, payload)` 创建任务，取 `task.id`
  5. `pollUntilTerminal(provider, taskId)`：每 5 秒查一次（`POLL_INTERVAL_MS=5000`），总超时 5 分钟（`MAX_TOTAL_WAIT_MS=300000`）。status=`succeeded` 返回终态；`failed`/`cancelled` 抛 502（带 error.message）；`expired` 抛 504；超时抛 504
  6. `downloadVideoToLocal(videoUrl, topicId)`：axios `responseType:'arraybuffer'` 下载视频 → `fileStorage.writeGeneratedBuffer(fileName, Buffer.from(response.data))` 落盘，返回 `{localPath, fileName, mimeType:'video/mp4'}`
  7. `runTransaction(pool, conn => ...)`：`topicRepository.saveVideoConversation(...)` + `draftRepository.clearReferenceImages(topicId, conn)` + `draftRepository.saveDraft(topicId, {...draft, prompt:''}, conn)` 三步原子化
  8. DB 失败时 `cleanupOrphanFiles`（复用 server.js:63-77 逻辑，提取为模块内私有函数或内联）
  9. 返回 `{videos, providerName, ratio, duration}`

**步骤 2.3 — 视频路由**
- [文件] `server/src/modules/videos/routes.js`（新建）
- How：`createVideoRoutes({videoService})` 工厂，参考 `images/routes.js`（:36-95）风格。挂载 `POST /topics/:topicId/messages/video` → `videoService.generateVideoMessage(req.params.topicId, req.body||{})` → `res.status(201).json(result)`，错误 `next(error)`

**步骤 2.4 — 后端接线**
- [文件] `server/src/server.js` + `server/src/app.js`
- [锚点] server.js:109-115（providersService 创建后）；server.js:117-301（createApp 调用）；app.js:73（createImageRoutes 后）
- How：
  1. server.js：`import { createVideoService } from './modules/videos/videoService.js'`；`import { createVideoRoutes }` 不需要（路由在 app.js 接）；在 providersService 创建后实例化 `const videoService = createVideoService({providersService, upstreamClient, fileStorage, topicRepository, draftRepository, settingsRepository, pool, runTransaction, storageRoot})`；`createApp({...deps, videoService})`
  2. app.js：`import { createVideoRoutes } from './modules/videos/routes.js'`；`app.use('/api', createVideoRoutes({videoService: deps.videoService}))`（参考 app.js:73-77 的 providersService 注入判空模式）

---

### 阶段 3：前端视频会话与状态（依赖阶段 2 路由就绪）

**步骤 3.1 — videoSession 前端 API**
- [文件] `src/services/videoSession.js`（新建）
- How：参考 `imageSession.js`（:1-5）。`export async function requestVideo(topicId, payload) { const response = await backendClient.post(\`/api/topics/${topicId}/messages/video\`, payload); return response.data }`

**步骤 3.2 — chat.js 扩展视频状态**
- [文件] `src/store/chat.js`
- [锚点] `transientDraft`（:67-75）；`ensureDraft`（:94-108）；`completeImageGeneration`（:461-529）；`failImageGeneration`（:535-568）；`getReadableError`（:602-606）；return 对象（:624-659）
- How：
  1. `transientDraft` 加 `ratio:'16:9'`、`duration:5`（内存态，不持久化到 drafts 表 — 简化首版，刷新回默认值可接受）
  2. `ensureDraft` 默认值同样加 `ratio:'16:9'`、`duration:5`
  3. 新增 `async function completeVideoGeneration(result, prompt, originTopicId=currentTopicId.value)`：平行于 completeImageGeneration。移除 generating 状态消息 → 构造 videos 数组（result.videos，含 url/localPath/fileName/mimeType）→ 触发浏览器下载（可选，视频文件大，建议**默认不自动下载**，仅落库展示）→ push `assistant_videos` 消息（type/role/prompt/videos/images:videos/meta:{providerName,ratio,duration}/model/ratio/duration）→ 更新主题 → 清 draft.prompt/referenceImages → scheduleDraftPersist
  4. 新增 `function failVideoGeneration(error, originTopicId)`：平行于 failImageGeneration，默认错误消息改「视频生成失败，请检查中转站配置」
  5. return 对象追加 `completeVideoGeneration, failVideoGeneration`

---

### 阶段 4：前端 UI 适配（依赖阶段 3）

**步骤 4.1 — InputConsole 视频参数面板与分流**
- [文件] `src/components/InputConsole.vue`
- [锚点] 导入区（:5）；`draft`（:57）；`modelGroups`（:64-78）；参数面板尺寸（:335-370）+ 张数（:372-380）；参考图区域（:272-293, :382-396）；`handleSend`（:243-267）；textarea placeholder（:303）
- How：
  1. 导入 `requestVideo`
  2. 新增 `selectedModelInfo` computed：从 `providersStore.enabledProviders` 中按复合键 `${providerId}::${modelId}` 查找命中的 model 对象（遍历 enabledProviders → enabledModels，匹配 providerId+modelId）
  3. 新增 `isVideoModel` computed：`Boolean(selectedModelInfo.value?.isVideo)`
  4. 新增 `videoRatioOptions`（7 项 ratio：16:9/4:3/1:1/3:4/9:16/21:9/adaptive）和 `videoDurationOptions`（4-15 秒，label 形如「5 秒」）
  5. 模板：`v-if="isVideoModel"` 显示「比例 + 时长」面板（n-select，class `tool-chip video-ratio-chip` / `video-duration-chip`），`v-else` 显示原「尺寸 + 张数」面板（用 v-if/v-else 切换，避免两者同时出现）
  6. 参考图区域：`isVideoModel` 时限制 1 张（uploadReferenceFiles 内 `remain = isVideoModel ? 1 - currentCount : maxReferenceImages - currentCount`）、文案改「首帧参考图」（reference-meta span 文案 + uploadHint + upload-trigger label）
  7. `handleSend` 分流：`isVideoModel` → `requestVideo(originTopicId, {prompt, draft:{...draft.value}})` + `completeVideoGeneration`，catch → `failVideoGeneration`；否则原 `requestImages` + `completeImageGeneration`
  8. textarea placeholder：`isVideoModel` 时改「描述你想要的视频画面，或上传首帧让画面动起来」

**步骤 4.2 — VideoMessageCard 组件**
- [文件] `src/components/VideoMessageCard.vue`（新建）
- How：参考 `ImageMessageCard.vue`（:1-167）结构
  - `defineEmits(['refine','download','retry','reference'])`，`defineProps({message:{type:Object,required:true}})`
  - `videoList` computed：优先 `message.videos`，否则从 `message.images` 筛 `mimeType?.startsWith('video/')`（兼容 reload 后从 message_images 表读出的数据）
  - card-header：role-tag AI、role-title「视频结果」、meta：model · providerName · ratio · duration
  - 视频区：`<video v-for="video in videoList" :src="video.url" controls preload="metadata" class="video-item" />`（src 是 `/files/generated/xxx.mp4`，vite proxy 已代理 /files/ 到后端，无需拼 baseURL）
  - action-row：继续细化 / 再次生成 / 设为首帧 / 下载视频
  - 样式平行 ImageMessageCard，`.video-item` 加 `max-width:720px; border-radius:16px;`

**步骤 4.3 — ChatArea 消息分发**
- [文件] `src/components/ChatArea.vue`
- [锚点] 导入区（:7）；消息循环（:107-117）；`handleRetry`（:38-45）；`handleDownload`（:57-65）
- How：
  1. 导入 VideoMessageCard
  2. 消息循环：`<ImageMessageCard v-if="message.type==='assistant_images'" .../>` 之后加 `<VideoMessageCard v-else-if="message.type==='assistant_videos'" :message="message" @refine="handleRefine" @retry="handleRetry" @reference="handleReference" @download="handleDownloadVideo" />`
  3. 新增 `handleDownloadVideo(message)`：取 `message.videos?.[0] || message.images?.find(i=>i.mimeType?.startsWith('video/'))` 的 url，调 `triggerBrowserDownload({dataUrl:url, fileName:\`${topicId}-${Date.now()}.mp4\`})`
  4. `handleRetry` 兼容视频：若 `message.type==='assistant_videos'`，回填 `ratio/duration` 替代 `size/quality/n`

**步骤 4.4 — ProviderDetail 视频标签**
- [文件] `src/components/settings/ProviderDetail.vue`
- [锚点] 模型行（:253-254）；`.image-tag` 样式（:478-485）
- How：
  1. 模型行 `<span v-if="model.isImage" class="image-tag" data-role="image-tag">图像</span>` 之后加 `<span v-if="model.isVideo" class="video-tag" data-role="video-tag">视频</span>`
  2. `.video-tag` 样式平行 `.image-tag`，橙色调：`background: rgba(255,107,53,0.18); color: rgba(255,159,112,0.95);`

---

### 阶段 5：验证

**步骤 5.1 — 后端测试**
- 新建 `server/src/modules/providers/videoPayload.test.js`：ratio 校验（非法值回退 16:9）、duration 截断、content 数组结构（有/无首帧）
- 新建 `server/src/modules/videos/videoService.test.js`：mock upstreamClient（createVideoTask 返回 id → getVideoTask 序列 queued→running→succeeded / failed / expired），验证轮询退出、落盘、事务调用；mock 失败序列验证抛出 502/504
- 新建 `server/src/modules/videos/videoRoutes.test.js`：POST 201 响应、错误透传
- 运行 `npm run server:test`

**步骤 5.2 — 前端测试**
- 扩展 `InputConsole.test.js`：视频面板显隐（isVideoModel）、handleSend 分流（调 requestVideo vs requestImages）
- 新建 `VideoMessageCard.test.js`：video 元素渲染、reload 数据兼容（images 含 video/ mime）、下载触发
- 扩展 `chat.test.js`：completeVideoGeneration 追加 assistant_videos 消息、failVideoGeneration
- 运行 `npm test`

**步骤 5.3 — 端到端验证**
1. 设置页添加火山引擎中转站，填 API Key，获取模型列表（应识别 seedance 模型并标「视频」标签）
2. 启用某个 seedance 模型，输入 prompt，点发送，等待 30-120 秒，视频消息卡片出现并可播放
3. 上传首帧参考图，图生视频验证（限制 1 张）
4. 切换回图像模型，验证图像生成功能不受影响（面板切回尺寸+张数）
5. 刷新页面，视频消息从后端 reload 后仍可播放（message_images 表持久化，videoList 兼容 images 数组）

**步骤 5.4 — 回归**
- `npm test`（前端）全绿
- `npm run server:test`（后端）全绿
- 手动验证图像生成链路无回归

## 关键假设与决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 轮询位置 | 后端 | 与图像生成同步返回体验一致，前端零轮询逻辑 |
| 轮询间隔/超时 | 5秒/5分钟 | 覆盖 30-120 秒生成 + 排队，不刷爆上游 |
| status 终态处理 | succeeded 返回；failed/cancelled 抛 502；expired/超时抛 504 | 已核实官方 status 枚举含 cancelled/expired |
| 视频文件存储 | 复用 message_images 表（mime_type='video/mp4' 区分） | 不新增表，listMessages 无需改 |
| 视频落盘 | 后端下载 video_url 到本地 | video_url 预签名 24h 有效，必须落盘否则刷新后失效 |
| 首帧参考图传递 | base64 data URL（复用 readFileAsDataUrl） | 无需暴露公网 URL |
| ratio/duration 持久化 | 内存态（不存 drafts 表） | 简化首版，避免 draftRepository 改动，刷新回默认值可接受 |
| 视频 URL 访问 | 相对路径 `/files/generated/xxx.mp4` | vite proxy 已代理 /files/ 到后端 |
| return_last_frame | false | 首版不做连续生成，简化 |
| 视频自动下载 | 否（仅落库展示） | 视频文件大，自动下载体验差；用户可手动点下载 |
| videoService 位置 | 独立模块 `modules/videos/` | 比内联 server.js 更清晰，便于测试 |
| isVideoModelId 关键词 | seedance/wanx/cogvideox/kling/sora/hunyuan-video/vidu/minimax-video | 覆盖主流视频模型命名 |

## 风险与回退

- **API Key 轮询复用**：upstreamClient.withKeyRotation 已处理多 Key 轮询 + 401/403 换 Key，视频方法直接复用，无额外风险
- **长轮询占用连接**：单次视频请求后端阻塞最长 5 分钟，Express 默认无超时问题；前端 backendClient timeout 已设 1200000ms（20 分钟，见 env.js:19），不会前端超时
- **回退**：所有改动为新增文件 + 既有文件追加，不修改图像生成逻辑，回退只需删除新增文件 + 还原追加片段
