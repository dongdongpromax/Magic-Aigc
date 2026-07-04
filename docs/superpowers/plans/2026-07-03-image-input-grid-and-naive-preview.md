# 输入区尺寸网格、多图上传与 Naive 图片预览 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把输入区升级为带尺寸网格弹层和多图上传的图生图工作台，并把全局看图统一切到 Naive UI 图片组件。

**Architecture:** 输入区以 `InputConsole.vue` 为中心，新增“尺寸触发器 + 网格弹层 + 参考图缩略图区 + 多图上传入口”，所有参考图统一进入 `draft.referenceImages`。图片卡片改为 `n-image` / `n-image-group`，请求层把参考图映射为 `dataUrl || url`，自定义预览弹层从主链路移除。

**Tech Stack:** Vue 3、Pinia、Naive UI、Vitest、Sass、OpenRouter Images API

---

## 文件结构

- 修改：`src/components/InputConsole.vue`
  - 把尺寸改成网格弹层，增加多图上传、缩略图带、最多 16 张提示，保留全屏输入态。
- 修改：`src/components/InputConsole.test.js`
  - 增加尺寸弹层、多图上传、上传上限、删除参考图的测试。
- 修改：`src/store/chat.js`
  - 升级 `referenceImages` 数据结构，提供添加和删除参考图的方法。
- 修改：`src/services/imageSession.js`
  - 把 `input_references` 统一映射成 `dataUrl || url`。
- 修改：`src/services/imageSession.test.js`
  - 增加本地上传参考图和历史生成图映射测试。
- 修改：`src/components/ImageMessageCard.vue`
  - 切换为 `n-image` / `n-image-group`，保留消息动作区。
- 修改：`src/components/ImageMessageCard.test.js`
  - 验证 Naive UI 图片组件渲染，而不是原生 `img`。
- 修改：`src/components/ChatArea.vue`
  - 移除自定义图片预览主路径依赖。
- 修改：`src/components/ImagePreviewModal.vue`
  - 停用或删除自定义预览组件。

### Task 1: 参考图数据结构与请求映射

**Files:**
- Modify: `src/store/chat.js`
- Modify: `src/services/imageSession.js`
- Modify: `src/services/imageSession.test.js`
- Create: `src/store/chat.references.test.js`

- [ ] **Step 1: 写失败测试，锁定参考图映射优先级**

```js
import { describe, expect, it } from 'vitest'
import { buildImagePayload } from './imageSession'

describe('buildImagePayload', () => {
  it('优先把参考图映射为 dataUrl，再回退 url', () => {
    const payload = buildImagePayload(
      {
        model: 'openai/gpt-image-2',
        size: 'auto',
        quality: 'high',
        n: 1,
        referenceImages: [
          {
            dataUrl: 'data:image/png;base64,AAAA',
            url: 'blob:http://localhost/ref-1',
          },
          {
            dataUrl: '',
            url: 'https://img.example.com/ref-2.png',
          },
        ],
      },
      '继续细化',
    )

    expect(payload.input_references).toEqual([
      'data:image/png;base64,AAAA',
      'https://img.example.com/ref-2.png',
    ])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- src/services/imageSession.test.js`
Expected: FAIL，提示 `input_references` 仍直接读取 `url`

- [ ] **Step 3: 写 store 测试，锁定新增和删除参考图**

```js
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useChatStore } from './chat'

describe('chat reference images', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('支持向当前草稿追加多张参考图并删除单张', () => {
    const store = useChatStore()
    const topicId = store.createTopic('测试主题')
    store.currentTopicId = topicId

    store.addReferenceImages([
      { id: 'ref-1', name: 'a.png', url: 'blob:a', dataUrl: 'data:a', type: 'image/png' },
      { id: 'ref-2', name: 'b.png', url: 'blob:b', dataUrl: 'data:b', type: 'image/png' },
    ])

    expect(store.currentDraft.referenceImages).toHaveLength(2)

    store.removeReferenceImage('ref-1')

    expect(store.currentDraft.referenceImages).toEqual([
      expect.objectContaining({ id: 'ref-2' }),
    ])
  })
})
```

- [ ] **Step 4: 写最小实现，补齐 `referenceImages` 管理和请求映射**

```js
// src/store/chat.js
function addReferenceImages(items) {
  currentDraft.value.referenceImages = [
    ...(currentDraft.value.referenceImages || []),
    ...items,
  ]
}

function removeReferenceImage(id) {
  currentDraft.value.referenceImages = (currentDraft.value.referenceImages || []).filter(
    (item) => item.id !== id,
  )
}
```

```js
// src/services/imageSession.js
export function buildImagePayload(draft, prompt) {
  const payload = {
    model: normalizeModelId(draft.model),
    prompt,
    size: draft.size,
    quality: draft.quality,
    n: draft.n,
  }

  if (draft.referenceImages?.length) {
    payload.input_references = draft.referenceImages.map((item) => item.dataUrl || item.url)
  }

  return payload
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test -- src/services/imageSession.test.js src/store/chat.references.test.js`
Expected: PASS

### Task 2: 输入区尺寸网格与多图上传

**Files:**
- Modify: `src/components/InputConsole.vue`
- Modify: `src/components/InputConsole.test.js`

- [ ] **Step 1: 写失败测试，锁定尺寸网格和上传限制**

```js
it('点击尺寸触发器后显示网格弹层', async () => {
  const wrapper = mount(InputConsole, { global: { plugins: [pinia] } })

  await wrapper.get('[data-action="open-size-grid"]').trigger('click')

  expect(wrapper.find('[data-panel="size-grid"]').exists()).toBe(true)
  expect(wrapper.text()).toContain('1:1 · 1024×1024')
  expect(wrapper.text()).toContain('auto')
})

it('上传超过 16 张参考图时阻止继续加入', async () => {
  const wrapper = mount(InputConsole, { global: { plugins: [pinia] } })
  const store = useChatStore()
  store.addReferenceImages(Array.from({ length: 16 }).map((_, index) => ({
    id: `ref-${index}`,
    name: `${index}.png`,
    type: 'image/png',
    url: `blob:${index}`,
    dataUrl: `data:${index}`,
  })))

  await wrapper.get('[data-action="add-reference"]').trigger('change')

  expect(wrapper.text()).toContain('最多上传 16 张参考图')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- src/components/InputConsole.test.js`
Expected: FAIL，提示不存在尺寸网格触发器或上传提示

- [ ] **Step 3: 写最小实现，增加尺寸网格触发器和参考图区**

```vue
<script setup>
const maxReferenceImages = 16
const isSizePanelVisible = ref(false)

function selectSize(value) {
  draft.value.size = value
  isSizePanelVisible.value = false
}
</script>

<template>
  <div class="reference-strip" v-if="draft.referenceImages.length">
    <div v-for="image in draft.referenceImages" :key="image.id" class="reference-card">
      <img :src="image.url" :alt="image.name" />
      <button type="button" @click="chatStore.removeReferenceImage(image.id)">移除</button>
    </div>
  </div>

  <div class="tool-chip size-trigger">
    <button type="button" data-action="open-size-grid" @click="isSizePanelVisible = !isSizePanelVisible">
      尺寸
    </button>
    <div v-if="isSizePanelVisible" data-panel="size-grid" class="size-grid-panel">
      <button
        v-for="item in sizeOptions"
        :key="item.value"
        type="button"
        @click="selectSize(item.value)"
      >
        {{ item.label }}
      </button>
    </div>
  </div>

  <label class="tool-btn upload-trigger">
    <input
      data-action="add-reference"
      type="file"
      accept="image/png,image/jpeg,image/webp"
      multiple
      @change="handleReferenceUpload"
    />
    <span>图片</span>
  </label>
</template>
```

- [ ] **Step 4: 实现上传解析逻辑**

```js
async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function handleReferenceUpload(event) {
  const files = Array.from(event.target.files || [])
  const remain = maxReferenceImages - draft.value.referenceImages.length

  if (files.length > remain) {
    uploadHint.value = '最多上传 16 张参考图'
  }

  const accepted = files.slice(0, remain)
  const parsed = await Promise.all(
    accepted.map(async (file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      type: file.type,
      url: URL.createObjectURL(file),
      dataUrl: await fileToDataUrl(file),
      sourceMessageId: null,
    })),
  )

  chatStore.addReferenceImages(parsed)
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test -- src/components/InputConsole.test.js`
Expected: PASS

### Task 3: Naive UI 图片组件替换自定义预览

**Files:**
- Modify: `src/components/ImageMessageCard.vue`
- Modify: `src/components/ImageMessageCard.test.js`
- Modify: `src/components/ChatArea.vue`
- Modify: `src/components/ImagePreviewModal.vue`

- [ ] **Step 1: 写失败测试，锁定 `n-image-group` 渲染**

```js
import { mount } from '@vue/test-utils'
import { NImage, NImageGroup } from 'naive-ui'
import { describe, expect, it } from 'vitest'
import ImageMessageCard from './ImageMessageCard.vue'

describe('ImageMessageCard', () => {
  it('使用 Naive UI 图片组件渲染结果图', () => {
    const wrapper = mount(ImageMessageCard, {
      props: {
        message: {
          images: [
            { id: '1', url: 'https://img.example.com/1.png' },
            { id: '2', url: 'https://img.example.com/2.png' },
          ],
          model: 'openai/gpt-image-2',
          size: 'auto',
        },
      },
    })

    expect(wrapper.findComponent(NImageGroup).exists()).toBe(true)
    expect(wrapper.findAllComponents(NImage)).toHaveLength(2)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- src/components/ImageMessageCard.test.js`
Expected: FAIL，提示当前仍渲染原生 `img`

- [ ] **Step 3: 写最小实现，替换图片卡片为 `n-image-group`**

```vue
<script setup>
import { NImage, NImageGroup } from 'naive-ui'
</script>

<template>
  <div class="image-grid">
    <n-image-group>
      <n-image
        v-for="image in message.images"
        :key="image.id"
        :src="image.url"
        object-fit="cover"
        class="image-item"
      />
    </n-image-group>
  </div>
</template>
```

- [ ] **Step 4: 断开 `ChatArea` 对自定义预览弹层的依赖**

```vue
<!-- ChatArea.vue -->
<template>
  <div class="chat-area">
    <!-- 保留消息动作和下载逻辑 -->
    <!-- 删除 ImagePreviewModal 挂载 -->
  </div>
</template>
```

```vue
<!-- ImagePreviewModal.vue -->
<template>
  <div class="image-preview-modal-deprecated"></div>
</template>
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test -- src/components/ImageMessageCard.test.js src/components/ImagePreviewModal.test.js`
Expected: PASS，必要时同步更新旧预览组件测试为“已停用”

### Task 4: 整体验证与文档收口

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新 README，补充图生图上传说明**

```md
## 图生图参考图

- 输入框底栏支持上传参考图
- 最多上传 16 张
- 支持 `png`、`jpg`、`jpeg`、`webp`
- 历史生成图也可以通过“设为参考图”进入同一条图生图链路
```

- [ ] **Step 2: 运行全量验证**

Run: `npm run test`
Expected: PASS

Run: `npm run build`
Expected: Build completed successfully

## 自检

### Spec 覆盖

- 尺寸网格弹层：Task 2
- 输入框内多图上传：Task 2
- 最多 16 张提示：Task 2
- `referenceImages` 结构升级：Task 1
- `input_references` 映射：Task 1
- Naive UI 图片组件替换预览：Task 3
- 自定义预览主路径下线：Task 3

### 占位检查

- 已检查无 `TBD`、`TODO`、`类似 Task N` 等占位描述。
- 每个任务都包含明确测试命令和预期结果。
- 每个实现步骤都给出了最小代码骨架。

### 类型一致性

- 参考图统一使用 `id`、`name`、`type`、`url`、`dataUrl`、`sourceMessageId`
- 请求映射统一使用 `dataUrl || url`
- 输入区尺寸面板统一使用 `isSizePanelVisible`
- 参考图管理统一使用 `addReferenceImages()` 与 `removeReferenceImage()`
