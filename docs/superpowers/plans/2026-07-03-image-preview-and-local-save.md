# 图片全局预览与自动落盘 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 GPT Image-2 图像工作台补齐沉浸式全局预览、浏览器自动下载、项目目录自动落盘，以及输入区组件化选择器。

**Architecture:** 在前端新增图片预览状态、下载工具和本地桥接调用，保持生成成功后的主链路为“渲染消息 -> 自动下载 -> 尝试写入项目目录”。项目目录写入通过独立的 Node 桥接服务实现，避免把文件系统能力塞进浏览器逻辑。输入区底部选择器统一迁移到 Naive UI 组件，避免原生 `select` 破坏暗色工作台的一致性。

**Tech Stack:** Vue 3、Pinia、Naive UI、Vitest、Node.js HTTP 服务、Sass

---

## 文件结构

- 修改：`src/store/chat.js`
  - 增加图片预览状态、打开/关闭预览方法，以及生成成功后的自动下载与本地落盘入口。
- 修改：`src/components/ChatArea.vue`
  - 负责把图片卡片点击事件转交给预览层，并挂载全局预览组件。
- 修改：`src/components/ImageMessageCard.vue`
  - 支持点击某张图打开预览，并为单图下载、继续细化、设为参考图保留动作入口。
- 修改：`src/components/InputConsole.vue`
  - 把底部模型、尺寸、张数切换为 `n-select` 或 `n-segmented` 组件。
- 新增：`src/components/ImagePreviewModal.vue`
  - 全屏图片预览、缩放、切换和下载动作。
- 新增：`src/components/ImagePreviewModal.test.js`
  - 预览层打开、切换、关闭、下载测试。
- 新增：`src/utils/download.js`
  - 文件名生成、浏览器自动下载、base64 转 Blob URL。
- 新增：`src/utils/download.test.js`
  - 文件名清洗与自动下载调用测试。
- 新增：`src/services/localImageBridge.js`
  - 调用本地桥接服务，提交 base64 和文件名。
- 新增：`src/services/localImageBridge.test.js`
  - 请求体和失败收口测试。
- 新增：`scripts/image-bridge.mjs`
  - 最小本地 HTTP 服务，把图片写入 `public/generated/`。
- 新增：`public/generated/.gitkeep`
  - 目录占位，保证生成目录存在。
- 修改：`src/components/InputConsole.test.js`
  - 验证不再存在原生 `select`，并验证组件化参数交互。
- 修改：`src/components/ImageMessageCard.test.js`
  - 验证点击图片触发预览事件。
- 修改：`README.md`
  - 增加本地桥接启动方式和落盘说明。

### Task 1: 下载工具与桥接服务

**Files:**
- Create: `src/utils/download.js`
- Create: `src/utils/download.test.js`
- Create: `src/services/localImageBridge.js`
- Create: `src/services/localImageBridge.test.js`
- Create: `scripts/image-bridge.mjs`
- Create: `public/generated/.gitkeep`

- [ ] **Step 1: 写失败测试，锁定文件名规则和下载行为**

```js
import { describe, expect, it, vi } from 'vitest'
import { buildImageFileName, triggerBrowserDownload } from './download'

describe('buildImageFileName', () => {
  it('清理主题名非法字符并附带序号', () => {
    expect(buildImageFileName('赛博/山脉:日落', '20260703-224500', 0)).toBe(
      '赛博-山脉-日落-20260703-224500-01.png',
    )
  })
})

describe('triggerBrowserDownload', () => {
  it('创建 a 标签并触发 click', () => {
    const click = vi.fn()
    vi.spyOn(document, 'createElement').mockReturnValue({
      click,
      set href(value) {
        this._href = value
      },
      set download(value) {
        this._download = value
      },
    })

    triggerBrowserDownload({
      dataUrl: 'data:image/png;base64,ZmFrZQ==',
      fileName: 'test.png',
    })

    expect(click).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- src/utils/download.test.js`
Expected: FAIL，提示 `buildImageFileName` 或 `triggerBrowserDownload` 未定义

- [ ] **Step 3: 写最小实现，完成文件名、下载触发和桥接请求**

```js
// src/utils/download.js
function sanitizeName(value) {
  return (value || 'image-session').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-')
}

export function buildImageFileName(topicTitle, stamp, index) {
  const safeTopic = sanitizeName(topicTitle)
  const order = String(index + 1).padStart(2, '0')
  return `${safeTopic}-${stamp}-${order}.png`
}

export function triggerBrowserDownload({ dataUrl, fileName }) {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = fileName
  anchor.click()
}
```

```js
// src/services/localImageBridge.js
export async function saveImageToProject(payload) {
  const response = await fetch('http://127.0.0.1:4399/api/save-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error('项目目录保存失败')
  }

  return response.json()
}
```

```js
// scripts/image-bridge.mjs
import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const saveRoot = path.join(projectRoot, 'public', 'generated')

await fs.mkdir(saveRoot, { recursive: true })

http
  .createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/save-image') {
      res.writeHead(404)
      res.end('Not Found')
      return
    }

    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const { fileName, imageBase64 } = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    const buffer = Buffer.from(imageBase64, 'base64')
    const filePath = path.join(saveRoot, fileName)

    await fs.writeFile(filePath, buffer)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        success: true,
        relativePath: `/generated/${fileName}`,
        absolutePath: filePath,
      }),
    )
  })
  .listen(4399)
```

- [ ] **Step 4: 继续补桥接失败测试**

```js
import { describe, expect, it, vi } from 'vitest'
import { saveImageToProject } from './localImageBridge'

describe('saveImageToProject', () => {
  it('把文件名和 base64 提交给本地桥接服务', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, relativePath: '/generated/test.png' }),
    })

    await saveImageToProject({
      topicTitle: '新建创作',
      fileName: 'test.png',
      imageBase64: 'ZmFrZQ==',
      subDir: 'generated',
    })

    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4399/api/save-image',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })
})
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test -- src/utils/download.test.js src/services/localImageBridge.test.js`
Expected: PASS

### Task 2: 全局预览状态与预览组件

**Files:**
- Modify: `src/store/chat.js`
- Modify: `src/components/ChatArea.vue`
- Modify: `src/components/ImageMessageCard.vue`
- Create: `src/components/ImagePreviewModal.vue`
- Create: `src/components/ImagePreviewModal.test.js`
- Modify: `src/components/ImageMessageCard.test.js`

- [ ] **Step 1: 写失败测试，锁定图片点击后打开预览**

```js
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useChatStore } from '@/store/chat'
import ImageMessageCard from './ImageMessageCard.vue'

describe('ImageMessageCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('点击图片时抛出 preview 事件和图片索引', async () => {
    const wrapper = mount(ImageMessageCard, {
      props: {
        message: {
          id: 'msg-1',
          images: [{ id: 'img-1', url: 'data:image/png;base64,ZmFrZQ==' }],
          model: 'openai/gpt-image-2',
          size: '1024x1024',
        },
      },
    })

    await wrapper.get('.image-item').trigger('click')
    expect(wrapper.emitted('preview')?.[0]?.[0]).toMatchObject({ startIndex: 0 })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- src/components/ImageMessageCard.test.js`
Expected: FAIL，提示没有 `preview` 事件或图片不可点击

- [ ] **Step 3: 在 store 中加入预览状态和打开关闭方法**

```js
const preview = reactive({
  visible: false,
  title: '',
  model: '',
  size: '',
  images: [],
  activeIndex: 0,
})

function openPreview(message, startIndex = 0) {
  preview.visible = true
  preview.title = getTopicById(message.topicId)?.title || '图片预览'
  preview.model = message.model
  preview.size = message.size
  preview.images = message.images || []
  preview.activeIndex = startIndex
}

function closePreview() {
  preview.visible = false
}

function setPreviewIndex(index) {
  preview.activeIndex = index
}
```

- [ ] **Step 4: 创建预览组件并在 ChatArea 中挂载**

```vue
<script setup>
import { computed } from 'vue'

const props = defineProps({
  visible: Boolean,
  images: { type: Array, default: () => [] },
  activeIndex: Number,
  title: String,
  model: String,
  size: String,
})

const emit = defineEmits(['close', 'change', 'download'])

const currentImage = computed(() => props.images[props.activeIndex] || null)

function handlePrev() {
  emit('change', Math.max(props.activeIndex - 1, 0))
}

function handleNext() {
  emit('change', Math.min(props.activeIndex + 1, props.images.length - 1))
}
</script>
```

```vue
<!-- ChatArea.vue -->
<ImagePreviewModal
  :visible="chatStore.preview.visible"
  :images="chatStore.preview.images"
  :active-index="chatStore.preview.activeIndex"
  :title="chatStore.preview.title"
  :model="chatStore.preview.model"
  :size="chatStore.preview.size"
  @close="chatStore.closePreview"
  @change="chatStore.setPreviewIndex"
  @download="handleDownloadCurrentPreview"
/>
```

- [ ] **Step 5: 完成预览层测试**

```js
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ImagePreviewModal from './ImagePreviewModal.vue'

describe('ImagePreviewModal', () => {
  it('切换上一张和下一张时发出 change 事件', async () => {
    const wrapper = mount(ImagePreviewModal, {
      props: {
        visible: true,
        activeIndex: 0,
        images: [
          { id: '1', url: 'data:image/png;base64,ZmFrZQ==' },
          { id: '2', url: 'data:image/png;base64,ZmFrZTI=' },
        ],
      },
    })

    await wrapper.get('[data-action="next"]').trigger('click')
    expect(wrapper.emitted('change')?.[0]).toEqual([1])
  })
})
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npm run test -- src/components/ImageMessageCard.test.js src/components/ImagePreviewModal.test.js`
Expected: PASS

### Task 3: 生成成功后的自动下载与本地落盘接入

**Files:**
- Modify: `src/store/chat.js`
- Modify: `src/components/InputConsole.vue`
- Modify: `src/services/imageSession.js`
- Modify: `src/services/imageSession.test.js`
- Create: `src/store/chat.preview.test.js`

- [ ] **Step 1: 写失败测试，锁定生成成功后的双轨保存行为**

```js
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatStore } from './chat'
import * as downloadModule from '@/utils/download'
import * as bridgeModule from '@/services/localImageBridge'

describe('chat preview persistence', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('生成成功后先触发浏览器下载，再尝试写入项目目录', async () => {
    const store = useChatStore()
    const topicId = store.createTopic('测试主题')
    store.currentTopicId = topicId
    vi.spyOn(downloadModule, 'triggerBrowserDownload').mockImplementation(() => {})
    vi.spyOn(bridgeModule, 'saveImageToProject').mockResolvedValue({
      success: true,
      relativePath: '/generated/test.png',
    })

    await store.completeImageGeneration(
      {
        images: [{ id: 'img-1', url: 'data:image/png;base64,ZmFrZQ==', b64: 'ZmFrZQ==' }],
      },
      '赛博山脉',
    )

    expect(downloadModule.triggerBrowserDownload).toHaveBeenCalled()
    expect(bridgeModule.saveImageToProject).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- src/store/chat.preview.test.js`
Expected: FAIL，提示 `completeImageGeneration` 没有触发下载和桥接保存

- [ ] **Step 3: 改造 store，加入异步保存流程**

```js
import { buildImageFileName, triggerBrowserDownload, buildTimestamp } from '@/utils/download'
import { saveImageToProject } from '@/services/localImageBridge'

async function completeImageGeneration(result, prompt) {
  const topicId = currentTopicId.value
  const draft = ensureDraft(topicId)
  const topic = getTopicById(topicId)
  const stamp = buildTimestamp(new Date())
  const images = await Promise.all(
    (result.images || []).map(async (image, index) => {
      const fileName = buildImageFileName(topic?.title, stamp, index)
      triggerBrowserDownload({ dataUrl: image.url, fileName })

      try {
        const saved = await saveImageToProject({
          topicTitle: topic?.title || 'image-session',
          fileName,
          imageBase64: image.b64 || image.url.split(',')[1],
          subDir: 'generated',
        })

        return {
          ...image,
          localPath: saved.relativePath,
          savedToProject: true,
        }
      } catch {
        return {
          ...image,
          localPath: '',
          savedToProject: false,
        }
      }
    }),
  )

  messages.value.push({
    id: createId(),
    topicId,
    type: 'assistant_images',
    role: 'assistant',
    prompt,
    images,
    model: draft.model,
    size: draft.size,
    quality: draft.quality,
    n: draft.n,
    createdAt: Date.now(),
  })
}
```

- [ ] **Step 4: 调整归一化层，让图片同时保留 `url` 和 `b64`**

```js
// src/services/imageSession.js 对应返回结构应满足：
return {
  images: normalized.data.map((item, index) => ({
    id: item.id || `img-${index + 1}`,
    url: item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url,
    b64: item.b64_json || '',
  })),
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test -- src/store/chat.preview.test.js src/services/imageSession.test.js`
Expected: PASS

### Task 4: 输入区组件化与文档收尾

**Files:**
- Modify: `src/components/InputConsole.vue`
- Modify: `src/components/InputConsole.test.js`
- Modify: `README.md`

- [ ] **Step 1: 写失败测试，锁定不再使用原生 `select`**

```js
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import InputConsole from './InputConsole.vue'

describe('InputConsole', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('底部参数栏不再渲染原生 select', () => {
    const wrapper = mount(InputConsole, {
      global: {
        stubs: {
          NSelect: true,
          NSegmented: true,
        },
      },
    })

    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'NSelect' }).exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- src/components/InputConsole.test.js`
Expected: FAIL，提示仍存在原生 `select`

- [ ] **Step 3: 用 Naive UI 组件替换参数栏**

```vue
<script setup>
import { NSelect, NSegmented } from 'naive-ui'

const sizeOptions = sizes.map((size) => ({ label: size, value: size }))
const countOptions = counts.map((count) => ({ label: `${count} 张`, value: count }))
</script>

<template>
  <div class="left-tools">
    <n-select v-model:value="draft.model" :options="models" class="tool-picker model-select" />
    <n-select v-model:value="draft.size" :options="sizeOptions" class="tool-picker" />
    <n-segmented v-model:value="draft.n" :options="countOptions" class="tool-counts" />
  </div>
</template>
```

- [ ] **Step 4: 更新 README，补充桥接服务启动方式**

```md
## 图片自动保存

1. 启动前端：`npm run dev`
2. 启动本地写盘桥接：`node scripts/image-bridge.mjs`
3. 生成图片后，系统会：
   - 自动下载到浏览器默认下载目录
   - 尝试写入 `public/generated/`

如果桥接服务未启动，图片仍会正常显示和下载，但不会写入项目目录。
```

- [ ] **Step 5: 运行完整验证**

Run: `npm run test`
Expected: PASS

Run: `npm run build`
Expected: Build completed successfully

## 自检

### Spec 覆盖

- 全局预览层：Task 2
- 浏览器自动下载：Task 1、Task 3
- 项目目录自动落盘：Task 1、Task 3
- 图片卡片点击打开预览：Task 2
- 输入区底部改用组件选择器：Task 4
- 落盘失败不阻断主流程：Task 3

### 占位检查

- 已检查计划中没有 `TBD`、`TODO`、`后续补`、`类似 Task N` 之类占位描述。
- 所有测试步骤都包含具体命令和预期结果。
- 所有实现步骤都给出了最小代码骨架。

### 类型一致性

- 预览状态统一使用 `preview.visible`、`preview.images`、`preview.activeIndex`
- 下载工具统一使用 `buildImageFileName()` 和 `triggerBrowserDownload()`
- 本地桥接统一使用 `saveImageToProject()`
- 图片对象统一新增 `b64`、`localPath`、`savedToProject`
