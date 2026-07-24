# 视频多参考图引用（首帧 / 首尾帧 / 多图参考）

## Context

当前视频生成（火山 Seedance）只支持**单张首帧参考图**：`videoPayload.buildVideoPayload` 接收单个 `firstFrameUrl`，`videoService.generateVideoMessage` 只取 `draft.referenceImages[0]`，`content` 数组只放 `text + 一个 image_url`（无 `role` 字段，`return_last_frame:false` 写死）。

但火山 Seedance 2.0 系列 API 实际支持三种**互斥**的图生视频场景（官方文档明确「不可混用」）：

| 模式 | 图片数 | content.role | 支持模型 |
|---|---|---|---|
| 图生视频-首帧 | 1 张 | `first_frame`（或不填） | 所有模型 |
| 图生视频-首尾帧 | 2 张 | `first_frame` + `last_frame` | 2.0 / 1.5 Pro / 1.0 Pro |
| 多图参考 | 1–9 张 | 全部 `reference_image` | 仅 2.0 系列 |

用户需求：在聊天框里引用多张上传参考图，每张带角色，资源在输入区侧边以缩略图展示。经澄清，范围限定为「**仅扩展上传参考图**」（不引入历史生成结果引用、不建独立素材库），交互采用「**模式选择器 + 带角色标签的卡槽**」（而非每张图独立选角色，因 API 三模式互斥，模式选择器从交互层杜绝非法组合）。

**目标**：把视频参考图从「1 张首帧」扩展为「首帧 / 首尾帧 / 多图参考」三种模式，前端按模式渲染卡槽，后端按模式组装 `content` 数组并带 `role`。

## 关键约束

1. **三模式互斥**：一个请求内 `first_frame`/`last_frame`/`reference_image` 不可混用。UI 用模式选择器保证物理上无法构造非法组合。
2. **role 由「模式 + 顺序」派生**：参考图项本身**不加 role 字段**。
   - `first_frame`：第 1 张 → `first_frame`
   - `first_last`：第 1 张 → `first_frame`，第 2 张 → `last_frame`
   - `reference`：全部 → `reference_image`
3. **`videoRefMode` 必须落库**：参考图已持久化到 `draft_reference_images` 表，若 `videoRefMode` 仅内存态，刷新后会出现「2 张图已落库但模式重置为首帧」的错配。故 `videoRefMode` 随草稿落 drafts 表（对齐项目硬约束「视频参数须持久化防 UI 错乱」）。`ratio/duration/resolution` 维持现状（内存态 + 默认值，不扩面）。
4. **模型能力差异不靠前端强限制**：参考图模式仅 2.0 支持、首尾帧需 Pro。modelId 关键词判定不可靠，不按模型禁用模式；依赖上游 `expose:true` 错误透传（现网已有 502/504 透传链路）。UI 给一行小字提示即可。
5. **图像模型参考图流程不变**：仍最多 16 张、无 role、走原 `requestImages` 路径。

## 数据模型

### 草稿（src/store/chat.js）

`transientDraft` 与 `ensureDraft` 默认值新增：

```js
videoRefMode: 'first_frame'  // 'first_frame' | 'first_last' | 'reference'
```

- `ensureDraft` 增加 `if (drafts[topicId].videoRefMode == null) drafts[topicId].videoRefMode = 'first_frame'` 防空守卫（与 ratio/duration/resolution 同款）。
- `serializeDraft` 增加 `videoRefMode` 字段，随 `saveRemoteDraft` 落库。
- 参考图项结构不变（`{id, name, type, url, filePath, dataUrl, sourceMessageId}`），**不加 role**。

### 数据库（server/src/db/seedProviders.js）

`migrateDraftsSchema`（或现有 drafts 迁移处）末尾幂等加列：

```sql
ALTER TABLE drafts ADD COLUMN video_ref_mode VARCHAR(16) NOT NULL DEFAULT 'first_frame';
```

复用现有 `ensureColumn` 幂等函数。旧部署升级后默认值 `'first_frame'`，与现有单首帧行为一致。

### draftRepository（server/src/db/repositories/draftRepository.js）

- `saveDraft` 的 INSERT 列与 ON DUPLICATE KEY UPDATE 增加 `video_ref_mode`。
- `getDraft` 的 SELECT 增加 `video_ref_mode`，映射时回填 `videoRefMode`（空值回退 `'first_frame'`）。

## 后端

### videoPayload.js — `buildVideoPayload` 签名调整

```js
buildVideoPayload({ model, prompt, ratio, duration, resolution, videoRefMode, imageUrls })
```

- `imageUrls: string[]` 替代原 `firstFrameUrl: string`。
- 按 `videoRefMode` 组装 `content` 数组（文本在前，图片在后，每项带 `role`）：

```js
const content = [{ type: 'text', text: String(prompt || '') }]
if (imageUrls.length) {
  imageUrls.forEach((url, index) => {
    const role = deriveRole(videoRefMode, index)  // first_frame / last_frame / reference_image
    content.push({ type: 'image_url', role, image_url: { url } })
  })
}
```

- 防御性校验（互斥 + 数量），非法时回退到 `first_frame` 单图模式并只取第 1 张：
  - `first_frame`：最多 1 张，role=`first_frame`
  - `first_last`：恰好 2 张（不足回退首帧），role 依次 `first_frame`/`last_frame`
  - `reference`：1–9 张，role 全部 `reference_image`；超 9 截断到 9
- `return_last_frame` 维持 `false`（连续生成不在本次范围，YAGNI）。

### videoService.js — `generateVideoMessage`

- 解析**全部**参考图为 data URL（循环 `resolveReferenceInput`，不再只取 `[0]`），得 `imageUrls: string[]`。
- 调 `buildVideoPayload({ ..., videoRefMode: draft.videoRefMode, imageUrls })`。
- `videoRefMode` 写入消息 meta（`saveVideoConversation` 的 draft 入参带上），供「再次生成」回填与卡片展示。
- 事务内 `clearReferenceImages` + `saveDraft`（含 `videoRefMode`）维持原子化。

### upstreamClient / 路由

无需改动：`createVideoTask(provider, payload)` 透传整个 payload，`content` 数组带 `role` 后上游可直接消费。

## 前端

### InputConsole.vue

**参数面板**（视频模式分支）新增「参考模式」选择器：

```html
<div class="param-row">
  <span class="param-label">参考模式</span>
  <n-select v-model:value="draft.videoRefMode" :options="videoRefModeOptions" class="param-select" size="small" />
</div>
```

`videoRefModeOptions = [{label:'首帧', value:'first_frame'}, {label:'首尾帧', value:'first_last'}, {label:'多图参考', value:'reference'}]`。

**参考图缩略条**按模式渲染带角色标签的卡槽（替代当前无差别的 reference-card 列表）：

- `first_frame`：1 个卡槽，标签「首帧」
- `first_last`：2 个卡槽，标签「首帧」「尾帧」，各自独立上传按钮
- `reference`：最多 9 个卡槽，标签均为「参考图」

卡槽内已上传则显示缩略图 + 移除按钮，未上传则显示上传入口。

**缩略条显隐**：当前 `v-if="draft.referenceImages.length"` 仅在有图时渲染。视频模式下需改为「视频模型或已有参考图时即渲染」，让空卡槽（如 `first_last` 两槽未填）可见可上传；图像模型维持原有图才显示的行为。

**上传上限**按模式：

```js
const videoRefLimit = computed(() => {
  if (!isVideoModel.value) return maxReferenceImages
  return { first_frame: 1, first_last: 2, reference: 9 }[draft.value.videoRefMode] || 1
})
```

`uploadReferenceFiles` 的 `limit` 用 `videoRefLimit`；`uploadHint` / 角标分母同步用 `videoRefLimit`。

**切模式时的去留**：切到更小上限的模式时，保留能放下的前 N 张，多余丢弃并 toast 提示「已切换为 X 模式，保留前 N 张」。切到 `first_last` 时若只有 1 张，保留为首帧、第二槽留空。

**工具栏上传按钮**保持上一轮收紧后的紧凑样式（图标 + 短标签 + 数量角标），不因多图而变拥挤。卡槽 UI 全部在 reference-strip 区域（textarea 上方），工具栏仍是 4 元素永不换行。

**paramSummary** 不变（仍 `16:9 · 5秒 · 720p`）；模式在卡槽标签上体现，避免摘要过长。

### ChatArea.vue — `handleRetry`

视频消息回填时增加 `draft.videoRefMode = message.videoRefMode || message.meta?.videoRefMode || draft.videoRefMode`。

### VideoMessageCard.vue

meta 行展示参考模式（如「首尾帧」「多图参考 3 张」），克制不抢戏。

### chat.js — `completeVideoGeneration`

`meta` 增加 `videoRefMode: result.videoRefMode || draft.videoRefMode`；消息对象带上 `videoRefMode` 供 retry 回填。

## 错误处理与边界

- **发送前校验**（前端 `handleSend`）：`first_last` 模式必须两槽都填，否则 toast「首尾帧模式需要首帧与尾帧各一张」并阻止发送。
- **上游非法组合**：理论上 UI 已杜绝；若上游仍拒（如模型不支持该模式），走现有 `expose:true` 透传（502 内容不合规 / 504 超时），用户看到真实原因。
- **图片格式/尺寸**：上游要求 jpeg/png/webp/bmp/tiff/gif、宽高比 [0.4,2.5]、边 [300,6000]px、单张 <30MB、请求体 <64MB。大文件不用 base64（当前 `resolveReferenceInput` 走 base64 data URL，多图叠加可能逼近 64MB 上限——首版接受，后续可改公网 URL）。
- **刷新错配**：`videoRefMode` 落库后，刷新从 DB 读回模式，与持久化的参考图数量一致，无错配。

## 测试

### 后端

- `videoPayload.test.js`：
  - 三种模式 `content` 数组与 `role` 组装正确
  - 互斥/数量校验：`first_last` 不足 2 张回退首帧；`reference` 超 9 截断；空 `imageUrls` 只出文本
  - 非法 `videoRefMode` 回退 `first_frame`
- `videoService.test.js`：多图全部解析为 data URL、`videoRefMode` 透传 payload 与 meta
- `draftRepository.test.js`：`saveDraft`/`getDraft` 的 `video_ref_mode` 读写往返
- `providerRoutes.test.js`：如涉及 draft 序列化，补 `videoRefMode` 字段断言

### 前端

- `InputConsole.test.js`：
  - 视频模式参数面板出现「参考模式」选择器
  - 切模式后卡槽数量与标签变化（首帧 1 槽 / 首尾帧 2 槽 / 多图参考 9 槽）
  - 上传上限随模式变化（角标分母）
  - 切到更小上限模式时裁剪保留前 N 张
  - `first_last` 未填满时发送被阻止
- `chat.test.js`：`videoRefMode` 默认 `'first_frame'`；`completeVideoGeneration` meta 含 `videoRefMode`
- `ChatArea.test.js`：`handleRetry` 视频消息回填 `videoRefMode`

## 端到端验证

1. 选 Seedance 2.0 模型，参数面板选「首尾帧」，分别上传首帧/尾帧，发送，等待生成，视频卡片 meta 显示「首尾帧」。
2. 切「多图参考」，上传 3 张参考图，发送验证。
3. 切「首帧」，上传 1 张，验证回退到原单首帧行为。
4. 切回图像模型，验证 16 张参考图流程不受影响。
5. 上传 2 张后刷新页面，模式与图片数量一致（无错配）。
6. `npm test` + `npm run server:test` 全绿。

## 关键设计决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 交互模式 | 模式选择器 + 卡槽 | API 三模式互斥，模式选择器从交互层杜绝非法组合 |
| role 存储 | 由模式+顺序派生，不存 per-item role | 减少数据面改动，参考图项结构不变 |
| videoRefMode 持久化 | 落 drafts 表 | 参考图已落库，模式须同步落库防刷新错配 |
| 模型能力限制 | 不按 modelId 前端禁用 | 关键词判定不可靠；依赖上游 expose 透传 |
| 参考图传递 | base64 data URL（复用现有） | 不引入公网 URL 基建；多图 64MB 风险首版接受 |
| return_last_frame | 维持 false | 连续生成不在本次范围 |
