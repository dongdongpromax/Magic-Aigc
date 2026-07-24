# 视频多参考图引用（首帧 / 首尾帧 / 多图参考）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把视频生成的参考图从「单张首帧」扩展为「首帧 / 首尾帧 / 多图参考」三种互斥模式，前端按模式渲染带角色标签的卡槽，后端按模式组装带 `role` 的 `content` 数组。

**Architecture:** 草稿新增 `videoRefMode` 字段并落 drafts 表（防刷新错配）。`role` 由「模式 + 顺序」派生，不存 per-item role。`buildVideoPayload` 改收 `imageUrls[]` + `videoRefMode`，按模式生成 `first_frame`/`last_frame`/`reference_image`。前端参数面板加模式选择器，参考图缩略条改成模式相关的卡槽。

**Tech Stack:** Vue 3 + Pinia + naive-ui（前端）；Express + mysql2（后端）；vitest（测试）。参考 [设计 spec](./video-multi-reference-design.md)。

---

## File Structure

| 文件 | 责任 | 动作 |
|---|---|---|
| `server/src/modules/providers/videoPayload.js` | 组装 Seedance 请求体 | 改签名：`firstFrameUrl` → `videoRefMode` + `imageUrls`，按模式派生 role |
| `server/src/modules/providers/videoPayload.test.js` | payload 单测 | 更新首帧断言 + 新增三模式/互斥回退用例 |
| `server/src/db/seedProviders.js` | schema 迁移 | `migrateProvidersSchema` 末尾加 `drafts.video_ref_mode` 列 |
| `server/src/db/repositories/draftRepository.js` | drafts 读写 | `saveDraft`/`getDraft` 增加 `video_ref_mode` |
| `server/src/db/repositories/draftRepository.test.js` | 仓储单测 | 新增 `video_ref_mode` 读写断言 |
| `server/src/modules/videos/videoService.js` | 视频生成编排 | 解析全部参考图、透传 mode |
| `server/src/modules/videos/videoService.test.js` | service 单测 | 新增多图解析 + mode 透传用例 |
| `src/store/chat.js` | 草稿状态 | `videoRefMode` 默认值/持久化/meta |
| `src/store/chat.test.js` | store 单测 | 新增 `videoRefMode` 默认值与 meta 断言 |
| `src/components/InputConsole.vue` | 聊天输入 | 模式选择器 + 卡槽式参考图条 + 发送校验 |
| `src/components/InputConsole.test.js` | 输入单测 | 新增模式选择器/卡槽/限张/校验用例 |
| `src/components/ChatArea.vue` | 消息区 | `handleRetry` 回填 `videoRefMode` |
| `src/components/ChatArea.test.js` | 消息区单测 | 新增 retry 回填断言 |
| `src/components/VideoMessageCard.vue` | 视频卡片 | meta 展示参考模式 |

---

## Task 1: videoPayload — 多图 + role 派生

**Files:**
- Modify: `server/src/modules/providers/videoPayload.js`
- Test: `server/src/modules/providers/videoPayload.test.js`

- [ ] **Step 1: 更新现有首帧测试，改用 imageUrls 并断言 role**

替换 `videoPayload.test.js` 里的「图生视频：首帧存在时 content 追加 image_url 项」用例（约 29-42 行）：

```js
  it('图生视频-首帧：content 追加带 role 的 image_url 项', () => {
    const payload = buildVideoPayload({
      model: 'doubao-seedance-2-0-260128',
      prompt: '让画面动起来',
      ratio: '9:16',
      duration: 8,
      videoRefMode: 'first_frame',
      imageUrls: ['data:image/png;base64,ZmFrZQ=='],
    })

    expect(payload.content).toHaveLength(2)
    expect(payload.content[1]).toEqual({
      type: 'image_url',
      role: 'first_frame',
      image_url: { url: 'data:image/png;base64,ZmFrZQ==' },
    })
  })
```

- [ ] **Step 2: 新增首尾帧 / 多图参考 / 互斥回退用例**

在 `videoPayload.test.js` 末尾（最后一个 `it` 之后、`describe` 闭合之前）追加：

```js
  it('图生视频-首尾帧：两张图分别带 first_frame / last_frame role', () => {
    const payload = buildVideoPayload({
      model: 'm',
      prompt: 'p',
      duration: 5,
      videoRefMode: 'first_last',
      imageUrls: ['data:image/png;base64,QUE=', 'data:image/png;base64,QUI='],
    })

    expect(payload.content).toHaveLength(3)
    expect(payload.content[1]).toMatchObject({ role: 'first_frame' })
    expect(payload.content[2]).toMatchObject({ role: 'last_frame' })
  })

  it('图生视频-多图参考：每张图 role 均为 reference_image', () => {
    const payload = buildVideoPayload({
      model: 'm',
      prompt: 'p',
      duration: 5,
      videoRefMode: 'reference',
      imageUrls: ['u1', 'u2', 'u3'],
    })

    expect(payload.content).toHaveLength(4)
    expect(payload.content.slice(1).every((c) => c.role === 'reference_image')).toBe(true)
  })

  it('多图参考超过 9 张截断到 9', () => {
    const urls = Array.from({ length: 12 }, (_, i) => `u${i}`)
    const payload = buildVideoPayload({
      model: 'm',
      prompt: 'p',
      duration: 5,
      videoRefMode: 'reference',
      imageUrls: urls,
    })

    expect(payload.content).toHaveLength(10) // 1 文本 + 9 图
  })

  it('首尾帧模式不足 2 张时回退为首帧单图', () => {
    const payload = buildVideoPayload({
      model: 'm',
      prompt: 'p',
      duration: 5,
      videoRefMode: 'first_last',
      imageUrls: ['only-one'],
    })

    expect(payload.content).toHaveLength(2)
    expect(payload.content[1]).toMatchObject({ role: 'first_frame' })
  })

  it('非法 videoRefMode 回退 first_frame', () => {
    const payload = buildVideoPayload({
      model: 'm',
      prompt: 'p',
      duration: 5,
      videoRefMode: 'unknown_mode',
      imageUrls: ['u1', 'u2'],
    })

    expect(payload.content).toHaveLength(2) // 回退首帧只取 1 张
    expect(payload.content[1]).toMatchObject({ role: 'first_frame' })
  })

  it('无 imageUrls 时 content 仅含文本（文生视频）', () => {
    const payload = buildVideoPayload({
      model: 'm',
      prompt: 'p',
      duration: 5,
      videoRefMode: 'reference',
      imageUrls: [],
    })

    expect(payload.content).toEqual([{ type: 'text', text: 'p' }])
  })
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run server/src/modules/providers/videoPayload.test.js`
Expected: FAIL（`firstFrameUrl` 旧实现不认 `imageUrls`，且无 role）

- [ ] **Step 4: 改写 buildVideoPayload 实现**

把 `videoPayload.js` 中 `buildVideoPayload` 函数整体替换为下面的版本，并在文件顶部常量区追加 `VIDEO_REF_MODES`：

```js
/** 视频参考模式枚举（三模式互斥，不可混用） */
export const VIDEO_REF_MODES = ['first_frame', 'first_last', 'reference']

/** 多图参考模式图片上限 */
const MAX_REFERENCE_IMAGES = 9
```

替换 `buildVideoPayload`（替换从 `export function buildVideoPayload` 到文件末尾的整段）：

```js
/**
 * 按「模式 + 顺序」派生单张参考图的 role
 * - first_frame：第 1 张 → first_frame
 * - first_last：第 1 张 → first_frame，第 2 张 → last_frame
 * - reference：全部 → reference_image
 * @param {string} mode videoRefMode
 * @param {number} index 图片下标
 * @returns {'first_frame'|'last_frame'|'reference_image'}
 */
function deriveRole(mode, index) {
  if (mode === 'first_last') return index === 0 ? 'first_frame' : 'last_frame'
  if (mode === 'reference') return 'reference_image'
  return 'first_frame'
}

/**
 * 构建 Seedance 视频生成请求体
 *
 * content 数组：文本提示词必填，参考图按 videoRefMode 派生 role 依次追加。
 * 三模式互斥（API 约束），非法模式回退 first_frame；首尾帧不足 2 张回退首帧单图。
 *
 * @param {{ model: string; prompt: string; ratio?: string; duration?: number; resolution?: string; videoRefMode?: string; imageUrls?: Array<string> }} input
 * @returns {{ model: string; content: Array<object>; ratio: string; duration: number; resolution: string; watermark: boolean; return_last_frame: boolean }}
 */
export function buildVideoPayload({ model, prompt, ratio, duration, resolution, videoRefMode, imageUrls }) {
  const content = [{ type: 'text', text: String(prompt || '') }]

  const mode = VIDEO_REF_MODES.includes(videoRefMode) ? videoRefMode : 'first_frame'
  let urls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : []

  // 按模式做数量校验/回退（三模式互斥，不可混用）
  if (mode === 'first_frame') {
    urls = urls.slice(0, 1)
  } else if (mode === 'first_last') {
    // 首尾帧需恰好 2 张；不足 2 张回退为首帧单图（role 派生仍正确）
    urls = urls.length < 2 ? urls.slice(0, 1) : urls.slice(0, 2)
  } else {
    // reference
    urls = urls.slice(0, MAX_REFERENCE_IMAGES)
  }

  urls.forEach((url, index) => {
    content.push({ type: 'image_url', role: deriveRole(mode, index), image_url: { url } })
  })

  return {
    model: String(model || ''),
    content,
    ratio: normalizeRatio(ratio),
    duration: normalizeDuration(duration),
    resolution: normalizeResolution(resolution),
    watermark: false,
    return_last_frame: false,
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run server/src/modules/providers/videoPayload.test.js`
Expected: PASS（全部用例）

- [ ] **Step 6: 提交**

```bash
git add server/src/modules/providers/videoPayload.js server/src/modules/providers/videoPayload.test.js
git commit -m "feat(video): buildVideoPayload 支持三模式参考图与 role 派生"
```

---

## Task 2: draftRepository 持久化 video_ref_mode + DB 迁移

**Files:**
- Modify: `server/src/db/seedProviders.js`（迁移）
- Modify: `server/src/db/repositories/draftRepository.js`
- Test: `server/src/db/repositories/draftRepository.test.js`

- [ ] **Step 1: 新增 saveDraft 写入 video_ref_mode 的测试**

在 `draftRepository.test.js` 的 `describe('saveDraft', ...)` 内（约 222 行 `})` 之前）追加：

```js
    it('保存 videoRefMode 到 video_ref_mode 列', async () => {
      const executor = createMockExecutor()
      executor.query.mockResolvedValueOnce([{}]) // INSERT drafts
      executor.query.mockResolvedValueOnce([[]]) // listReferenceImages SELECT 空
      const repo = createDraftRepository(executor)

      await repo.saveDraft('topic-1', {
        prompt: 'p',
        model: 'm',
        videoRefMode: 'first_last',
      }, executor)

      const [sql, params] = executor.query.mock.calls[0]
      expect(sql).toMatch(/video_ref_mode/)
      // 参数顺序末位前为 videoRefMode（updatedAt 是最后一个）
      expect(params).toContain('first_last')
    })
```

- [ ] **Step 2: 新增 getDraft 读取 video_ref_mode 的测试**

在 `describe('getDraft', ...)` 内（约 274 行 `})` 之前）追加：

```js
    it('读取 video_ref_mode 映射为 videoRefMode，空值回退 first_frame', async () => {
      const executor = createMockExecutor()
      // SELECT drafts 返回含 video_ref_mode
      executor.query.mockResolvedValueOnce([
        [{ topic_id: 'topic-1', prompt: 'p', model: 'm', provider_id: '', size: 'auto', quality: 'high', n: 1, video_ref_mode: 'reference' }],
      ])
      executor.query.mockResolvedValueOnce([[]]) // listReferenceImages 空
      const repo = createDraftRepository(executor)

      const draft = await repo.getDraft('topic-1', executor)
      expect(draft.videoRefMode).toBe('reference')
    })

    it('video_ref_mode 为空时回退 first_frame', async () => {
      const executor = createMockExecutor()
      executor.query.mockResolvedValueOnce([
        [{ topic_id: 'topic-1', prompt: 'p', model: 'm', provider_id: '', size: 'auto', quality: 'high', n: 1, video_ref_mode: null }],
      ])
      executor.query.mockResolvedValueOnce([[]])
      const repo = createDraftRepository(executor)

      const draft = await repo.getDraft('topic-1', executor)
      expect(draft.videoRefMode).toBe('first_frame')
    })
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run server/src/db/repositories/draftRepository.test.js`
Expected: FAIL（SQL 不含 `video_ref_mode`、`draft.videoRefMode` undefined）

- [ ] **Step 4: 改 saveDraft 写入 video_ref_mode**

在 `draftRepository.js` 的 `saveDraft` 中，把 `next` 对象与 SQL 改为（约 90-122 行）：

```js
    async saveDraft(topicId, payload, executor = pool) {
      const next = {
        prompt: payload.prompt || '',
        model: payload.model || 'openai/gpt-image-2',
        providerId: payload.providerId || '',
        size: payload.size || 'auto',
        quality: payload.quality || 'high',
        n: payload.n || 1,
        videoRefMode: payload.videoRefMode || 'first_frame',
        updatedAt: Date.now(),
      }

      await executor.query(
        `INSERT INTO drafts (topic_id, prompt, model, provider_id, size, quality, n, video_ref_mode, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         prompt = VALUES(prompt),
         model = VALUES(model),
         provider_id = VALUES(provider_id),
         size = VALUES(size),
         quality = VALUES(quality),
         n = VALUES(n),
         video_ref_mode = VALUES(video_ref_mode),
         updated_at = VALUES(updated_at)`,
        [
          topicId,
          next.prompt,
          next.model,
          next.providerId,
          next.size,
          next.quality,
          next.n,
          next.videoRefMode,
          next.updatedAt,
        ],
      )

      const referenceImages = await this.listReferenceImages(topicId, executor)

      return {
        topicId,
        ...next,
        referenceImages,
      }
    },
```

- [ ] **Step 5: 改 getDraft 读取 video_ref_mode**

在 `draftRepository.js` 的 `getDraft` 返回对象中（约 30-39 行）增加 `videoRefMode`：

```js
      return {
        topicId,
        prompt: draft?.prompt || '',
        model: draft?.model || 'openai/gpt-image-2',
        providerId: draft?.provider_id || '',
        size: draft?.size || 'auto',
        quality: draft?.quality || 'high',
        n: draft?.n || 1,
        videoRefMode: draft?.video_ref_mode || 'first_frame',
        referenceImages,
      }
```

- [ ] **Step 6: 加 DB 迁移列**

在 `seedProviders.js` 的 `migrateProvidersSchema` 末尾（约 152 行 `model_type` ensureColumn 之后、函数闭合 `}` 之前）追加：

```js
  // 视频参考模式：drafts 增加 video_ref_mode 列（与持久化的参考图同步，防刷新错配）
  await ensureColumn(
    pool,
    'drafts',
    'video_ref_mode',
    "ALTER TABLE drafts ADD COLUMN video_ref_mode VARCHAR(16) NOT NULL DEFAULT 'first_frame'",
  )
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npx vitest run server/src/db/repositories/draftRepository.test.js`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add server/src/db/repositories/draftRepository.js server/src/db/repositories/draftRepository.test.js server/src/db/seedProviders.js
git commit -m "feat(draft): 持久化 videoRefMode 到 drafts.video_ref_mode"
```

---

## Task 3: videoService 解析全部参考图 + 透传 mode

**Files:**
- Modify: `server/src/modules/videos/videoService.js`
- Test: `server/src/modules/videos/videoService.test.js`

- [ ] **Step 1: 先读现有 videoService.test.js 的 mock 模式**

Run: `sed -n '1,60p' server/src/modules/videos/videoService.test.js`
（了解现有 createVideoService deps mock 与 generateVideoMessage 断言结构，新增用例沿用同款 mock。）

- [ ] **Step 2: 新增多图解析 + mode 透传测试**

在 `videoService.test.js` 内追加用例（沿用现有 `createVideoService` deps 构造与 `generateVideoMessage` 调用方式；若现有用例用 `firstFrameUrl` 单图断言，需同步更新为多图）。核心断言：

```js
  it('解析全部参考图为 imageUrls 并按 videoRefMode 透传给 buildVideoPayload', async () => {
    // 构造 deps：fileStorage.readFileAsDataUrl 返回 base64；upstreamClient.createVideoTask 返回 {id}
    // getVideoTask 轮询返回 succeeded + video_url；topicRepository.saveVideoConversation 透传
    // draft.referenceImages 含 2 张、videoRefMode='first_last'
    const fileStorage = { readFileAsDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,QQ=='), writeGeneratedBuffer: vi.fn().mockResolvedValue('/files/generated/x.mp4') }
    // ...其余 deps mock 同现有用例
    const videoService = createVideoService({ /* deps */ })

    await videoService.generateVideoMessage('topic-1', {
      prompt: 'p',
      draft: {
        model: 'doubao-seedance-2-0-260128',
        providerId: 'volcengine',
        ratio: '16:9', duration: 5, resolution: '720p',
        videoRefMode: 'first_last',
        referenceImages: [
          { filePath: '/files/references/a.png', mimeType: 'image/png' },
          { filePath: '/files/references/b.png', mimeType: 'image/png' },
        ],
      },
    })

    // fileStorage.readFileAsDataUrl 被调 2 次（两张图都解析）
    expect(fileStorage.readFileAsDataUrl).toHaveBeenCalledTimes(2)
    // saveVideoConversation 收到的 draft 含 videoRefMode
    expect(topicRepository.saveVideoConversation).toHaveBeenCalledWith(
      expect.objectContaining({ draft: expect.objectContaining({ videoRefMode: 'first_last' }) }),
      expect.anything(),
    )
  })
```

> 注：具体 mock 构造须对齐 `videoService.test.js` 现有 `createVideoService` 注入方式（providersService.resolveForDraft / upstreamClient.createVideoTask / getVideoTask / topicRepository.saveVideoConversation / draftRepository / runTransaction / pool / storageRoot）。实现者按现有用例的 mock 模板补全 `/* deps */`。

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run server/src/modules/videos/videoService.test.js`
Expected: FAIL（当前只解析 `[0]`，readFileAsDataUrl 只调 1 次；videoRefMode 未透传）

- [ ] **Step 4: 改 videoService 解析全部参考图 + 透传 mode**

在 `videoService.js` 的 `generateVideoMessage` 中，替换第 1 步「解析首帧参考图」与第 3 步「构建请求体」（约 161-178 行）：

```js
      // 1. 解析全部参考图为 data URL 数组（按 videoRefMode 派生 role 由 buildVideoPayload 负责）
      const imageUrls = []
      for (const ref of draft.referenceImages || []) {
        imageUrls.push(await resolveReferenceInput(fileStorage, ref))
      }

      // 2. 按 draft.providerId 解析中转站（含 default_provider_id → 第一个 enabled 回退链）
      const provider = await providersService.resolveForDraft(draft.providerId)

      // 3. 构建 Seedance 请求体
      const videoPayload = buildVideoPayload({
        model: draft.model,
        prompt,
        ratio: draft.ratio,
        duration: draft.duration,
        resolution: draft.resolution,
        videoRefMode: draft.videoRefMode,
        imageUrls,
      })
```

并在事务内 `saveVideoConversation` 的 `draft` 入参中带上 `videoRefMode`（约 207-219 行，`draft: { ...draft, providerName, ratio, duration, resolution }` 改为）：

```js
              draft: {
                ...draft,
                providerName: provider.name,
                ratio: videoPayload.ratio,
                duration: videoPayload.duration,
                resolution: videoPayload.resolution,
                videoRefMode: draft.videoRefMode || 'first_frame',
              },
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run server/src/modules/videos/videoService.test.js`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add server/src/modules/videos/videoService.js server/src/modules/videos/videoService.test.js
git commit -m "feat(video): videoService 解析全部参考图并透传 videoRefMode"
```

---

## Task 4: chat.js store — videoRefMode 默认值 / 序列化 / meta

**Files:**
- Modify: `src/store/chat.js`
- Test: `src/store/chat.test.js`

- [ ] **Step 1: 新增 store 测试**

在 `chat.test.js` 内追加（沿用现有 `createPinia` + `useChatStore` 模式）：

```js
  it('videoRefMode 默认值为 first_frame', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useChatStore()
    expect(store.currentDraft.videoRefMode).toBe('first_frame')
  })

  it('completeVideoGeneration 的消息 meta 含 videoRefMode', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useChatStore()
    store.currentDraft.videoRefMode = 'first_last'
    store.currentDraft.model = 'doubao-seedance-2-0-260128'
    await store.completeVideoGeneration(
      { videos: [{ url: '/files/generated/v.mp4' }], providerName: '火山方舟', ratio: '16:9', duration: 5, resolution: '720p' },
      'p',
      store.currentTopicId,
    )
    const msg = store.currentMessages.find((m) => m.type === 'assistant_videos')
    expect(msg.meta.videoRefMode).toBe('first_last')
    expect(msg.videoRefMode).toBe('first_last')
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/store/chat.test.js`
Expected: FAIL（`videoRefMode` undefined）

- [ ] **Step 3: 加默认值到 transientDraft / ensureDraft**

`chat.js` `transientDraft`（约 67-79 行）`resolution: '720p',` 后加：

```js
    // 视频参考模式（落库到 drafts.video_ref_mode，防刷新与参考图错配）
    videoRefMode: 'first_frame',
```

`ensureDraft` 内 `drafts[topicId] ||= { ... }`（约 101-113 行）`resolution: '720p',` 后加 `videoRefMode: 'first_frame',`；并在兜底块（约 118-120 行）后追加：

```js
    if (drafts[topicId].videoRefMode == null) drafts[topicId].videoRefMode = 'first_frame'
```

- [ ] **Step 4: serializeDraft 加 videoRefMode**

`chat.js` `serializeDraft`（约 392-401 行）返回对象末尾加：

```js
      videoRefMode: draft.videoRefMode || 'first_frame',
```

- [ ] **Step 5: completeVideoGeneration meta 加 videoRefMode**

`chat.js` `completeVideoGeneration` 的 push 消息对象（约 621-642 行）：在 `resolution: result.resolution || draft.resolution,` 后加 `videoRefMode: result.videoRefMode || draft.videoRefMode,`；并在 `meta: { ... }` 内末尾加 `videoRefMode: result.videoRefMode || draft.videoRefMode,`。

- [ ] **Step 6: 运行测试确认通过**

Run: `npx vitest run src/store/chat.test.js`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src/store/chat.js src/store/chat.test.js
git commit -m "feat(store): videoRefMode 默认值/序列化/消息 meta"
```

---

## Task 5: InputConsole — 模式选择器 + 卡槽式参考图条 + 发送校验

**Files:**
- Modify: `src/components/InputConsole.vue`
- Test: `src/components/InputConsole.test.js`

- [ ] **Step 1: 新增模式选择器与卡槽测试**

在 `InputConsole.test.js` 的视频模式用例之后追加：

```js
  it('视频参数面板含参考模式选择器，默认首帧', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const providersStore = useProvidersStore()
    providersStore.providers = [
      { id: 'volcengine', name: '火山方舟', color: '#ff6b35', enabled: true, apiKeys: ['sk'],
        enabledModels: [{ modelId: 'seedance-1-0', displayName: 'Seedance 1.0', isVideo: true }] },
    ]
    const wrapper = mount(InputConsole, { global: { plugins: [pinia] } })
    const store = useChatStore()
    store.currentDraft.providerId = 'volcengine'
    store.currentDraft.model = 'seedance-1-0'
    await flushPromises()

    await wrapper.get('[data-action="open-params"]').trigger('click')
    expect(wrapper.text()).toContain('参考模式')
    expect(store.currentDraft.videoRefMode).toBe('first_frame')
  })

  it('首尾帧模式渲染 2 个带标签卡槽，多图参考模式上限 9', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const providersStore = useProvidersStore()
    providersStore.providers = [
      { id: 'volcengine', name: '火山方舟', color: '#ff6b35', enabled: true, apiKeys: ['sk'],
        enabledModels: [{ modelId: 'seedance-1-0', displayName: 'Seedance 1.0', isVideo: true }] },
    ]
    const wrapper = mount(InputConsole, { global: { plugins: [pinia] } })
    const store = useChatStore()
    store.currentDraft.providerId = 'volcengine'
    store.currentDraft.model = 'seedance-1-0'
    store.currentDraft.videoRefMode = 'first_last'
    await flushPromises()

    // 首尾帧：2 个卡槽，含「首帧」「尾帧」标签
    expect(wrapper.findAll('[data-role="ref-slot"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('首帧')
    expect(wrapper.text()).toContain('尾帧')

    // 切多图参考：9 个空卡槽
    store.currentDraft.videoRefMode = 'reference'
    await flushPromises()
    expect(wrapper.findAll('[data-role="ref-slot"]')).toHaveLength(9)
  })

  it('首尾帧模式未填满两槽时阻止发送并提示', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const providersStore = useProvidersStore()
    providersStore.providers = [
      { id: 'volcengine', name: '火山方舟', color: '#ff6b35', enabled: true, apiKeys: ['sk'],
        enabledModels: [{ modelId: 'seedance-1-0', displayName: 'Seedance 1.0', isVideo: true }] },
    ]
    const wrapper = mount(InputConsole, { global: { plugins: [pinia] } })
    const store = useChatStore()
    store.currentDraft.providerId = 'volcengine'
    store.currentDraft.model = 'seedance-1-0'
    store.currentDraft.videoRefMode = 'first_last'
    store.currentDraft.prompt = '动起来'
    // 只塞 1 张图（首帧有、尾帧空）
    store.currentDraft.referenceImages = [{ id: 'r1', name: 'a.png', type: 'image/png', url: '/files/a.png' }]
    await flushPromises()

    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('首尾帧')
    expect(requestVideo).not.toHaveBeenCalled()
  })
```

> 注：`requestVideo` 需在文件顶部 `vi.mock('@/services/videoSession', ...)` 已存在；若未 mock，按 `imageSession` 同款补 `vi.mock('@/services/videoSession', () => ({ requestVideo: vi.fn() }))` 并 import。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/components/InputConsole.test.js`
Expected: FAIL（无参考模式选择器、无 `data-role="ref-slot"` 卡槽）

- [ ] **Step 3: 加 videoRefModeOptions / videoRefLimit / 模式选择器**

在 `InputConsole.vue` `<script setup>` 中（`videoResolutionOptions` 之后）追加：

```js
/** 视频参考模式选项（首帧 / 首尾帧 / 多图参考，三模式互斥） */
const videoRefModeOptions = [
  { label: '首帧', value: 'first_frame' },
  { label: '首尾帧', value: 'first_last' },
  { label: '多图参考', value: 'reference' },
]

/** 各模式参考图上限 */
const VIDEO_REF_LIMITS = { first_frame: 1, first_last: 2, reference: 9 }

/** 当前参考图上限：视频按模式，图像固定 16 */
const refLimit = computed(() =>
  isVideoModel.value ? VIDEO_REF_LIMITS[draft.value.videoRefMode] || 1 : maxReferenceImages,
)
```

把原有 `uploadReferenceFiles` 内 `const limit = isVideoModel.value ? 1 : maxReferenceImages` 改为 `const limit = refLimit.value`。
把模板里上传按钮的 `:class` 与角标分母里的 `isVideoModel ? 1 : maxReferenceImages` 全部改为 `refLimit`：

```html
        <label
          class="tool-btn upload-trigger"
          :class="{ disabled: draft.referenceImages.length >= refLimit }"
          :title="uploadHint"
        >
          ...
          <span v-if="draft.referenceImages.length" class="upload-badge">
            {{ draft.referenceImages.length }}/{{ refLimit }}
          </span>
        </label>
```

`uploadHint` 内 `isVideoModel ? 1 : ...` 也改为 `refLimit.value`。

- [ ] **Step 4: 参数面板视频分支加参考模式选择器**

在 `InputConsole.vue` 视频模式 `<template v-else>` 内（比例选择器之前）插入：

```html
              <div class="param-row">
                <span class="param-label">参考模式</span>
                <n-select
                  v-model:value="draft.videoRefMode"
                  :options="videoRefModeOptions"
                  class="param-select"
                  size="small"
                />
              </div>
```

- [ ] **Step 5: 参考图条改成模式相关卡槽**

把 `InputConsole.vue` 顶部参考图条（约 363-384 行 `<div v-if="draft.referenceImages.length" class="reference-strip">...</div>`）整体替换为：

```html
    <div v-if="isVideoModel || draft.referenceImages.length" class="reference-strip" data-role="reference-strip">
      <template v-if="isVideoModel">
        <div
          v-for="slotIndex in refLimit"
          :key="slotIndex"
          class="ref-slot"
          :class="{ filled: draft.referenceImages[slotIndex - 1] }"
          data-role="ref-slot"
        >
          <template v-if="draft.referenceImages[slotIndex - 1]">
            <img :src="draft.referenceImages[slotIndex - 1].url" class="reference-thumb" />
            <span class="ref-slot-tag">{{ refSlotLabel(slotIndex - 1) }}</span>
            <button
              class="reference-remove"
              type="button"
              data-action="remove-reference"
              @click="removeReferenceImage(draft.referenceImages[slotIndex - 1].id)"
            >移除</button>
          </template>
          <template v-else>
            <label class="ref-slot-upload" :title="uploadHint">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                class="reference-input"
                @change="(e) => handleSlotUpload(e, slotIndex - 1)"
              />
              <span class="ref-slot-tag">{{ refSlotLabel(slotIndex - 1) }}</span>
              <span class="ref-slot-empty">+ 上传</span>
            </label>
          </template>
        </div>
      </template>
      <template v-else>
        <div
          v-for="image in draft.referenceImages"
          :key="image.id"
          data-role="reference-card"
          class="reference-card"
        >
          <img :src="image.url" :alt="image.name" class="reference-thumb" />
          <div class="reference-meta">
            <strong>{{ image.name }}</strong>
            <span>图生图参考</span>
          </div>
          <button
            class="reference-remove"
            type="button"
            data-action="remove-reference"
            @click="removeReferenceImage(image.id)"
          >移除</button>
        </div>
      </template>
    </div>
```

在 `<script setup>` 中追加卡槽标签与按槽上传函数：

```js
/** 视频卡槽角色标签（按模式 + 下标派生，与后端 deriveRole 对齐） */
function refSlotLabel(index) {
  if (draft.value.videoRefMode === 'first_last') return index === 0 ? '首帧' : '尾帧'
  if (draft.value.videoRefMode === 'reference') return '参考图'
  return '首帧'
}

/** 按指定卡槽下标上传：插入到该位置（保证首尾帧顺序） */
async function handleSlotUpload(event, slotIndex) {
  const files = Array.from(event.target?.files || [])
  if (!files.length) return
  // 复用现有上传逻辑（上传到后端 + addReferenceImages），再调整顺序保证落到目标槽
  const beforeCount = draft.value.referenceImages?.length || 0
  await uploadReferenceFiles(files)
  // uploadReferenceFiles 追加到末尾；若目标槽已有图或位置不对，做最小重排
  const imgs = draft.value.referenceImages
  if (slotIndex < imgs.length - 1 && slotIndex < refLimit.value) {
    // 把刚追加的尾部图挪到 slotIndex（仅当目标槽为空时）
    if (!imgs[slotIndex]) {
      const moved = imgs.splice(imgs.length - 1, 1)[0]
      imgs.splice(slotIndex, 0, moved)
    }
  }
  event.target.value = ''
}
```

- [ ] **Step 6: 切模式时裁剪多余参考图**

在 `<script setup>` 中加 watch（处理切到更小上限模式时丢弃多余图）：

```js
import { watch } from 'vue'

watch(
  () => draft.value.videoRefMode,
  (mode, prev) => {
    if (!isVideoModel.value || !prev || mode === prev) return
    const limit = VIDEO_REF_LIMITS[mode] || 1
    if (draft.value.referenceImages.length > limit) {
      draft.value.referenceImages = draft.value.referenceImages.slice(0, limit)
    }
  },
)
```

- [ ] **Step 7: 发送前校验首尾帧两槽填满**

在 `handleSend` 中（`if (!draft.value.prompt.trim() || isLoading.value) return` 之后、`if (!chatStore.hasConfig)` 之前）加：

```js
  if (isVideoModel.value && draft.value.videoRefMode === 'first_last') {
    if (draft.value.referenceImages.length < 2) {
      chatStore.lastError = '首尾帧模式需要首帧与尾帧各一张'
      return
    }
  }
```

- [ ] **Step 8: 补卡槽样式**

在 `InputConsole.vue` `<style>` 中 `.reference-strip` 之后追加：

```scss
.ref-slot {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 96px;
  border-radius: 6px;
  border: 1px dashed rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.03);
  overflow: hidden;

  &.filled {
    border-style: solid;
    border-color: rgba(255, 255, 255, 0.1);
  }

  .reference-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.ref-slot-tag {
  position: absolute;
  top: 4px;
  left: 4px;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.55);
  color: rgba(255, 255, 255, 0.85);
  font-size: 11px;
}

.ref-slot-upload {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  gap: 4px;
}

.ref-slot-empty {
  font-size: 12px;
}
```

- [ ] **Step 9: 运行测试确认通过**

Run: `npx vitest run src/components/InputConsole.test.js`
Expected: PASS（含原有 13 + 新增用例）

- [ ] **Step 10: 提交**

```bash
git add src/components/InputConsole.vue src/components/InputConsole.test.js
git commit -m "feat(input): 视频参考模式选择器与卡槽式参考图条"
```

---

## Task 6: ChatArea handleRetry 回填 + VideoMessageCard meta

**Files:**
- Modify: `src/components/ChatArea.vue`
- Modify: `src/components/VideoMessageCard.vue`
- Test: `src/components/ChatArea.test.js`

- [ ] **Step 1: 新增 retry 回填测试**

在 `ChatArea.test.js` 内追加（沿用现有 retry 用例的 mount/handleRetry 触发模式）：

```js
  it('handleRetry 视频消息回填 videoRefMode', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useChatStore()
    const wrapper = mount(ChatArea, { global: { plugins: [pinia] } })
    await flushPromises()

    store.currentDraft.videoRefMode = 'first_frame'
    wrapper.vm.handleRetry({
      type: 'assistant_videos',
      prompt: 'p',
      model: 'seedance-1-0',
      videoRefMode: 'reference',
      meta: { videoRefMode: 'reference' },
    })
    await flushPromises()

    expect(store.currentDraft.videoRefMode).toBe('reference')
  })
```

> 若 `ChatArea.test.js` 现有 retry 用例通过触发 `@retry` 事件而非直接调 `handleRetry`，按现有方式适配；`handleRetry` 已在 setup 顶层定义可被 `vm` 访问。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/components/ChatArea.test.js`
Expected: FAIL（`videoRefMode` 仍为 first_frame）

- [ ] **Step 3: handleRetry 回填 videoRefMode**

在 `ChatArea.vue` `handleRetry` 的视频分支（约 48-53 行 `if (message.type === 'assistant_videos')`）内追加：

```js
    draft.videoRefMode = message.videoRefMode || message.meta?.videoRefMode || draft.videoRefMode
```

- [ ] **Step 4: VideoMessageCard meta 展示参考模式**

在 `VideoMessageCard.vue` `<script setup>` 中（`resolutionLabel` 之后）加：

```js
/** 参考模式展示文案 */
const refModeLabel = computed(() => {
  const m = props.message.videoRefMode || props.message.meta?.videoRefMode
  if (m === 'first_last') return '首尾帧'
  if (m === 'reference') {
    const n = props.message.meta?.refImageCount || 0
    return n ? `多图参考 ${n} 张` : '多图参考'
  }
  if (m === 'first_frame') return '首帧'
  return ''
})
```

在模板 `card-header` 内 `resolutionLabel` 的 `<template v-if="resolutionLabel">` 之后追加：

```html
        <template v-if="refModeLabel">
          <span class="meta-sep">·</span>
          <span class="meta-item">{{ refModeLabel }}</span>
        </template>
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/components/ChatArea.test.js`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/components/ChatArea.vue src/components/VideoMessageCard.vue src/components/ChatArea.test.js
git commit -m "feat(video): retry 回填 videoRefMode 与卡片 meta 展示参考模式"
```

---

## Task 7: 全量测试 + 端到端验证

- [ ] **Step 1: 前端全量测试**

Run: `npm test`
Expected: 全绿（37+ 文件，含新增用例）

- [ ] **Step 2: 后端全量测试**

Run: `npm run server:test`
Expected: 全绿（14 文件）

- [ ] **Step 3: 端到端手测（dev server 已在 2222 / API 4398）**

1. 选 Seedance 2.0 模型 → 参数面板选「首尾帧」→ 首帧/尾帧各上传一张 → 发送 → 等待生成 → 视频卡片 meta 显示「首尾帧」
2. 切「多图参考」→ 上传 3 张 → 发送验证
3. 切「首帧」→ 上传 1 张 → 验证回退原单首帧行为
4. 切回图像模型 → 验证 16 张参考图流程不受影响
5. 首尾帧模式只上传 1 张 → 发送 → 应被阻止并提示
6. 上传 2 张后刷新页面 → 模式与图片数量一致（无错配）

- [ ] **Step 4: 收尾提交（如有遗漏）**

```bash
git add -A
git status
```
若有未提交的收尾改动，按需补一个 `chore` 提交。

---

## Self-Review

**1. Spec coverage：**
- 三模式选择器 → Task 5 Step 4 ✓
- 卡槽式缩略条 + 角色标签 → Task 5 Step 5 ✓
- role 由模式+顺序派生 → Task 1 deriveRole ✓
- videoRefMode 落库防错配 → Task 2 ✓
- buildVideoPayload 改 imageUrls + mode → Task 1 ✓
- videoService 解析全部参考图 → Task 3 ✓
- chat.js 默认值/序列化/meta → Task 4 ✓
- handleRetry 回填 → Task 6 ✓
- VideoMessageCard meta → Task 6 ✓
- 发送前校验首尾帧两槽 → Task 5 Step 7 ✓
- 切模式裁剪 → Task 5 Step 6 ✓
- 上传上限按模式 → Task 5 Step 3 ✓
- 缩略条显隐（视频空槽也显示）→ Task 5 Step 5 `v-if="isVideoModel || ..."` ✓

**2. Placeholder scan：** Task 3 Step 2 的 mock 标注了「按现有用例补全 deps」——这是对齐现有 mock 模式的指引，非占位；实现者须读 Step 1 的现有 mock 后补全。其余步骤均含完整代码。

**3. Type consistency：** `videoRefMode` 字段名、`VIDEO_REF_MODES`/`VIDEO_REF_LIMITS` 常量名、`refLimit`/`refSlotLabel`/`handleSlotUpload` 函数名、`data-role="ref-slot"` 属性在前后端各任务一致。`deriveRole`（后端）与 `refSlotLabel`（前端）按同一模式+下标规则派生，语义对齐。
