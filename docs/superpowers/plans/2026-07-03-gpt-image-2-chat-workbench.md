# GPT Image-2 对话式图像工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前模拟生图页面重构为可通过 OpenAI 兼容中转站真实请求、支持多主题多轮续聊、具备配置管理与本地持久化的图像工作台。

**Architecture:** 以 Pinia 管理主题、消息、草稿和连接配置；将 AI 请求、响应归一化、本地存储从组件中拆出到独立服务与工具模块；UI 上保留高集成工作台布局，通过消息卡片动作和设置抽屉承载高级能力。

**Tech Stack:** Vue 3、Pinia、Naive UI、Axios、Sass、Vitest、@vue/test-utils、jsdom

---

### Task 1: 建立测试与配置基线

**Files:**
- Create: `docs/superpowers/plans/2026-07-03-gpt-image-2-chat-workbench.md`
- Create: `.env.example`
- Create: `src/config/env.js`
- Create: `src/test/setup.js`
- Create: `src/config/env.test.js`
- Modify: `package.json`
- Modify: `vite.config.js`

- [ ] **Step 1: 写失败测试，定义环境变量解析规则**

```js
// src/config/env.test.js
import { describe, expect, it, vi } from 'vitest'

describe('getDefaultAppConfig', () => {
  it('从 import.meta.env 读取默认配置', async () => {
    vi.stubGlobal('importMetaEnv', {
      VITE_AI_BASE_URL: 'https://demo.example.com/v1',
      VITE_AI_API_KEY: 'demo-key',
      VITE_AI_MODEL: 'gpt-image-2',
      VITE_AI_MODE: 'openai-image',
      VITE_AI_DEFAULT_SIZE: '1024x1024',
      VITE_AI_DEFAULT_QUALITY: 'high',
      VITE_AI_DEFAULT_N: '1',
      VITE_AI_TIMEOUT: '120000',
    })

    const { getDefaultAppConfig } = await import('./env')
    expect(getDefaultAppConfig()).toEqual({
      baseURL: 'https://demo.example.com/v1',
      apiKey: 'demo-key',
      defaultModel: 'gpt-image-2',
      requestMode: 'openai-image',
      defaultSize: '1024x1024',
      defaultQuality: 'high',
      defaultN: 1,
      timeout: 120000,
    })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- src/config/env.test.js`
Expected: FAIL，提示 `Missing script: "test"` 或找不到 `src/config/env.js`

- [ ] **Step 3: 安装测试依赖并补齐脚本**

```json
// package.json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.4",
    "@vue/test-utils": "^2.4.6",
    "jsdom": "^26.1.0",
    "sass": "^1.72.0",
    "vite": "^5.2.0",
    "vitest": "^3.2.4"
  }
}
```

Run: `npm install`
Expected: 新增 `vitest`、`@vue/test-utils`、`jsdom`

- [ ] **Step 4: 实现环境配置模块与测试配置**

```js
// src/config/env.js
const readEnv = () => {
  if (typeof importMetaEnv !== 'undefined') return importMetaEnv
  if (typeof import.meta !== 'undefined' && import.meta.env) return import.meta.env
  return {}
}

export function getDefaultAppConfig() {
  const env = readEnv()

  return {
    baseURL: env.VITE_AI_BASE_URL || '',
    apiKey: env.VITE_AI_API_KEY || '',
    defaultModel: env.VITE_AI_MODEL || 'gpt-image-2',
    requestMode: env.VITE_AI_MODE || 'openai-image',
    defaultSize: env.VITE_AI_DEFAULT_SIZE || '1024x1024',
    defaultQuality: env.VITE_AI_DEFAULT_QUALITY || 'high',
    defaultN: Number(env.VITE_AI_DEFAULT_N || 1),
    timeout: Number(env.VITE_AI_TIMEOUT || 120000),
  }
}
```

```js
// vite.config.js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
})
```

```js
// src/test/setup.js
import { config } from '@vue/test-utils'

config.global.stubs = {
  transition: false,
  teleport: true,
}
```

```bash
# .env.example
VITE_AI_BASE_URL=https://your-openai-compatible-gateway.example.com/v1
VITE_AI_API_KEY=your-api-key
VITE_AI_MODEL=gpt-image-2
VITE_AI_MODE=openai-image
VITE_AI_DEFAULT_SIZE=1024x1024
VITE_AI_DEFAULT_QUALITY=high
VITE_AI_DEFAULT_N=1
VITE_AI_TIMEOUT=120000
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test -- src/config/env.test.js`
Expected: PASS，输出 `1 passed`

- [ ] **Step 6: 提交本任务**

```bash
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || git init
git add package.json package-lock.json vite.config.js .env.example src/config/env.js src/config/env.test.js src/test/setup.js docs/superpowers/plans/2026-07-03-gpt-image-2-chat-workbench.md
git commit -m "test: add app config and vitest baseline"
```

### Task 2: 重构消息模型、持久化与 Pinia Store

**Files:**
- Create: `src/utils/storage.js`
- Create: `src/utils/message.js`
- Create: `src/store/chat.test.js`
- Modify: `src/store/chat.js`

- [ ] **Step 1: 写失败测试，锁定主题、草稿、持久化行为**

```js
// src/store/chat.test.js
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useChatStore } from './chat'

describe('chat store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('创建新主题时初始化独立草稿', () => {
    const store = useChatStore()
    const topicId = store.createTopic('海报概念')

    expect(store.currentTopicId).toBe(topicId)
    expect(store.drafts[topicId]).toMatchObject({
      prompt: '',
      model: 'gpt-image-2',
      size: '1024x1024',
    })
  })

  it('提交消息后会写入 localStorage', () => {
    const store = useChatStore()
    store.addUserPrompt('生成一张银白机械风格角色海报')

    const raw = localStorage.getItem('ai-chat-draw:chat-store')
    expect(raw).toContain('银白机械风格')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- src/store/chat.test.js`
Expected: FAIL，提示 `createTopic` 或 `drafts`、`addUserPrompt` 不存在

- [ ] **Step 3: 实现消息工厂与本地存储工具**

```js
// src/utils/message.js
export function createUserPromptMessage(topicId, prompt, draft) {
  return {
    id: crypto.randomUUID(),
    topicId,
    type: 'user_prompt',
    role: 'user',
    prompt,
    draftSnapshot: { ...draft },
    createdAt: Date.now(),
  }
}

export function createStatusMessage(topicId, status, meta = {}) {
  return {
    id: crypto.randomUUID(),
    topicId,
    type: 'system_status',
    role: 'system',
    status,
    meta,
    createdAt: Date.now(),
  }
}
```

```js
// src/utils/storage.js
const STORAGE_KEY = 'ai-chat-draw:chat-store'
const STORAGE_VERSION = 1

export function loadPersistedState() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null

  const parsed = JSON.parse(raw)
  return parsed.version === STORAGE_VERSION ? parsed.payload : null
}

export function savePersistedState(payload) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: STORAGE_VERSION,
      payload,
    }),
  )
}
```

- [ ] **Step 4: 重写 `chat.js`，让主题、消息、草稿、配置分层**

```js
// src/store/chat.js
import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import { getDefaultAppConfig } from '@/config/env'
import { createStatusMessage, createUserPromptMessage } from '@/utils/message'
import { loadPersistedState, savePersistedState } from '@/utils/storage'

export const useChatStore = defineStore('chat', () => {
  const defaults = getDefaultAppConfig()
  const restored = loadPersistedState()

  const appConfig = reactive(restored?.appConfig || {
    baseURL: defaults.baseURL,
    apiKey: defaults.apiKey,
    defaultModel: defaults.defaultModel,
    requestMode: defaults.requestMode,
    defaultSize: defaults.defaultSize,
    defaultQuality: defaults.defaultQuality,
    defaultN: defaults.defaultN,
    timeout: defaults.timeout,
  })

  const topics = ref(restored?.topics || [])
  const messages = ref(restored?.messages || [])
  const drafts = reactive(restored?.drafts || {})
  const currentTopicId = ref(restored?.currentTopicId || '')

  function ensureDraft(topicId) {
    drafts[topicId] ||= {
      prompt: '',
      model: appConfig.defaultModel,
      size: appConfig.defaultSize,
      quality: appConfig.defaultQuality,
      n: appConfig.defaultN,
      referenceImages: [],
    }
    return drafts[topicId]
  }

  function createTopic(title = '新主题') {
    const id = crypto.randomUUID()
    topics.value.unshift({
      id,
      title,
      coverImage: null,
      lastPrompt: '',
      updatedAt: Date.now(),
      messageCount: 0,
      status: 'idle',
    })
    currentTopicId.value = id
    ensureDraft(id)
    return id
  }

  function addUserPrompt(prompt) {
    const topicId = currentTopicId.value || createTopic()
    const draft = ensureDraft(topicId)
    messages.value.push(createUserPromptMessage(topicId, prompt, draft))
    messages.value.push(createStatusMessage(topicId, 'generating'))
  }

  watch(
    () => ({
      appConfig,
      topics: topics.value,
      messages: messages.value,
      drafts,
      currentTopicId: currentTopicId.value,
    }),
    (payload) => savePersistedState(payload),
    { deep: true },
  )

  return {
    appConfig,
    topics,
    messages,
    drafts,
    currentTopicId,
    createTopic,
    addUserPrompt,
    ensureDraft,
  }
})
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test -- src/store/chat.test.js`
Expected: PASS，输出 `2 passed`

- [ ] **Step 6: 提交本任务**

```bash
git add src/utils/storage.js src/utils/message.js src/store/chat.js src/store/chat.test.js
git commit -m "feat: add chat state model and persistence"
```

### Task 3: 实现 AI 客户端与响应归一化

**Files:**
- Create: `src/services/aiClient.js`
- Create: `src/services/imageSession.js`
- Create: `src/utils/normalize.js`
- Create: `src/services/imageSession.test.js`

- [ ] **Step 1: 写失败测试，锁定图像响应归一化**

```js
// src/services/imageSession.test.js
import { describe, expect, it } from 'vitest'
import { normalizeImageResponse } from '@/utils/normalize'

describe('normalizeImageResponse', () => {
  it('兼容 url 返回格式', () => {
    const result = normalizeImageResponse({
      data: [{ url: 'https://img.example.com/1.png' }],
    })

    expect(result.images).toEqual([
      {
        id: expect.any(String),
        url: 'https://img.example.com/1.png',
        width: null,
        height: null,
      },
    ])
  })

  it('兼容 b64_json 返回格式', () => {
    const result = normalizeImageResponse({
      data: [{ b64_json: 'ZmFrZQ==' }],
    })

    expect(result.images[0].url.startsWith('data:image/png;base64,')).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- src/services/imageSession.test.js`
Expected: FAIL，提示 `normalizeImageResponse` 不存在

- [ ] **Step 3: 实现基础请求客户端**

```js
// src/services/aiClient.js
import axios from 'axios'

export function createAiClient(config) {
  return axios.create({
    baseURL: config.baseURL,
    timeout: config.timeout,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
  })
}
```

- [ ] **Step 4: 实现归一化与图像会话服务**

```js
// src/utils/normalize.js
export function normalizeImageResponse(payload) {
  return {
    images: (payload.data || []).map((item) => ({
      id: crypto.randomUUID(),
      url: item.url || `data:image/png;base64,${item.b64_json}`,
      width: item.width || null,
      height: item.height || null,
    })),
    revisedPrompt: payload.revised_prompt || '',
  }
}
```

```js
// src/services/imageSession.js
import { createAiClient } from './aiClient'
import { normalizeImageResponse } from '@/utils/normalize'

export async function requestImages(config, draft, prompt) {
  const client = createAiClient(config)
  const response = await client.post('/images/generations', {
    model: draft.model,
    prompt,
    size: draft.size,
    quality: draft.quality,
    n: draft.n,
  })

  return normalizeImageResponse(response.data)
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test -- src/services/imageSession.test.js`
Expected: PASS，输出 `2 passed`

- [ ] **Step 6: 提交本任务**

```bash
git add src/services/aiClient.js src/services/imageSession.js src/utils/normalize.js src/services/imageSession.test.js
git commit -m "feat: add ai client and image response normalization"
```

### Task 4: 完成设置抽屉与连接状态组件

**Files:**
- Create: `src/components/SettingsDrawer.vue`
- Create: `src/components/ConnectionBadge.vue`
- Create: `src/components/ConnectionBadge.test.js`
- Modify: `src/components/ChatArea.vue`
- Modify: `src/App.vue`

- [ ] **Step 1: 写失败测试，锁定连接状态标签**

```js
// src/components/ConnectionBadge.test.js
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ConnectionBadge from './ConnectionBadge.vue'

describe('ConnectionBadge', () => {
  it('缺少配置时显示未配置', () => {
    const wrapper = mount(ConnectionBadge, {
      props: {
        hasConfig: false,
        hasError: false,
      },
    })

    expect(wrapper.text()).toContain('未配置')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- src/components/ConnectionBadge.test.js`
Expected: FAIL，提示 `ConnectionBadge.vue` 不存在

- [ ] **Step 3: 实现设置抽屉和连接状态**

```vue
<!-- src/components/ConnectionBadge.vue -->
<script setup>
const props = defineProps({
  hasConfig: Boolean,
  hasError: Boolean,
})

const label = props.hasError ? '连接异常' : props.hasConfig ? '已连接' : '未配置'
</script>

<template>
  <button class="connection-badge" type="button">
    <span class="dot"></span>
    <span>{{ label }}</span>
  </button>
</template>
```

```vue
<!-- src/components/SettingsDrawer.vue -->
<script setup>
import { computed } from 'vue'
import { NDrawer, NDrawerContent, NInput, NInputNumber, NSelect } from 'naive-ui'
import { useChatStore } from '@/store/chat'

const props = defineProps({
  show: Boolean,
})

const emit = defineEmits(['update:show'])
const store = useChatStore()

const modeOptions = [
  { label: '图片生成模式', value: 'openai-image' },
  { label: '聊天封装模式', value: 'openai-chat' },
]

const visible = computed({
  get: () => props.show,
  set: (value) => emit('update:show', value),
})
</script>
```

- [ ] **Step 4: 挂载到主界面顶部**

```vue
<!-- src/components/ChatArea.vue -->
<script setup>
import { ref } from 'vue'
import ConnectionBadge from './ConnectionBadge.vue'
import SettingsDrawer from './SettingsDrawer.vue'
import { useChatStore } from '@/store/chat'

const store = useChatStore()
const showSettings = ref(false)
</script>
```

```vue
<!-- src/App.vue -->
<template>
  <n-config-provider :theme="darkTheme" :theme-overrides="themeOverrides" class="provider-wrap">
    <n-message-provider>
      <MainLayout />
    </n-message-provider>
  </n-config-provider>
</template>
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test -- src/components/ConnectionBadge.test.js`
Expected: PASS，输出 `1 passed`

- [ ] **Step 6: 提交本任务**

```bash
git add src/components/SettingsDrawer.vue src/components/ConnectionBadge.vue src/components/ConnectionBadge.test.js src/components/ChatArea.vue src/App.vue
git commit -m "feat: add connection badge and settings drawer"
```

### Task 5: 构建消息气泡和图片结果卡片

**Files:**
- Create: `src/components/MessageBubble.vue`
- Create: `src/components/ImageMessageCard.vue`
- Create: `src/components/ImageMessageCard.test.js`
- Modify: `src/components/ChatArea.vue`

- [ ] **Step 1: 写失败测试，锁定图片卡片动作**

```js
// src/components/ImageMessageCard.test.js
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ImageMessageCard from './ImageMessageCard.vue'

describe('ImageMessageCard', () => {
  it('渲染继续细化和下载原图动作', () => {
    const wrapper = mount(ImageMessageCard, {
      props: {
        message: {
          images: [{ id: '1', url: 'https://img.example.com/1.png' }],
          model: 'gpt-image-2',
          size: '1024x1024',
        },
      },
    })

    expect(wrapper.text()).toContain('继续细化')
    expect(wrapper.text()).toContain('下载原图')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- src/components/ImageMessageCard.test.js`
Expected: FAIL，提示 `ImageMessageCard.vue` 不存在

- [ ] **Step 3: 实现通用消息气泡与图片卡片**

```vue
<!-- src/components/MessageBubble.vue -->
<script setup>
defineProps({
  message: {
    type: Object,
    required: true,
  },
})
</script>

<template>
  <div class="message-bubble" :class="message.role">
    <div v-if="message.type === 'user_prompt'" class="text-bubble">{{ message.prompt }}</div>
    <div v-else-if="message.type === 'system_status'" class="status-bubble">正在生成</div>
    <div v-else class="text-bubble">{{ message.content }}</div>
  </div>
</template>
```

```vue
<!-- src/components/ImageMessageCard.vue -->
<script setup>
const emit = defineEmits(['refine', 'download', 'retry', 'reference'])

defineProps({
  message: {
    type: Object,
    required: true,
  },
})
</script>

<template>
  <div class="image-message-card">
    <div class="image-grid">
      <img v-for="image in message.images" :key="image.id" :src="image.url" alt="生成结果" />
    </div>
    <div class="action-row">
      <button @click="$emit('refine', message)">继续细化</button>
      <button @click="$emit('retry', message)">再次生成</button>
      <button @click="$emit('reference', message)">设为参考图</button>
      <button @click="$emit('download', message)">下载原图</button>
    </div>
  </div>
</template>
```

- [ ] **Step 4: 将 `ChatArea.vue` 改成按消息类型分发组件**

```vue
<!-- src/components/ChatArea.vue -->
<template>
  <div class="messages-container" v-if="currentMessages.length">
    <template v-for="message in currentMessages" :key="message.id">
      <ImageMessageCard
        v-if="message.type === 'assistant_images'"
        :message="message"
        @refine="handleRefine"
        @retry="handleRetry"
        @reference="handleReference"
        @download="handleDownload"
      />
      <MessageBubble v-else :message="message" />
    </template>
  </div>
</template>
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test -- src/components/ImageMessageCard.test.js`
Expected: PASS，输出 `1 passed`

- [ ] **Step 6: 提交本任务**

```bash
git add src/components/MessageBubble.vue src/components/ImageMessageCard.vue src/components/ImageMessageCard.test.js src/components/ChatArea.vue
git commit -m "feat: add message bubble and image card actions"
```

### Task 6: 重写输入控制台并接通真实生成流程

**Files:**
- Create: `src/components/InputConsole.test.js`
- Modify: `src/components/InputConsole.vue`
- Modify: `src/store/chat.js`
- Modify: `src/services/imageSession.js`

- [ ] **Step 1: 写失败测试，锁定输入发送与草稿更新**

```js
// src/components/InputConsole.test.js
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import InputConsole from './InputConsole.vue'

describe('InputConsole', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('输入提示词后启用发送按钮', async () => {
    const wrapper = mount(InputConsole, {
      global: {
        plugins: [createPinia()],
      },
    })

    await wrapper.find('textarea').setValue('生成一张冷银色机械大厅')
    expect(wrapper.find('.send-btn').attributes('disabled')).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- src/components/InputConsole.test.js`
Expected: FAIL，提示发送按钮状态或 store 结构不匹配

- [ ] **Step 3: 改造 `InputConsole.vue`，只保留主频参数并接入真实请求**

```vue
<!-- src/components/InputConsole.vue -->
<script setup>
import { computed, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { useChatStore } from '@/store/chat'
import { requestImages } from '@/services/imageSession'

const store = useChatStore()
const message = useMessage()
const isLoading = ref(false)

const draft = computed(() => store.currentDraft)
const disabled = computed(() => !draft.value.prompt.trim() || isLoading.value)

async function handleSend() {
  if (disabled.value) return
  if (!store.hasConfig) {
    store.openSettings()
    return
  }

  isLoading.value = true
  const prompt = draft.value.prompt
  store.addUserPrompt(prompt)

  try {
    const result = await requestImages(store.runtimeConfig, draft.value, prompt)
    store.completeImageGeneration(result, prompt)
  } catch (error) {
    store.failImageGeneration(error)
    message.error(store.getReadableError(error))
  } finally {
    isLoading.value = false
  }
}
</script>
```

- [ ] **Step 4: 在 store 中补齐运行时辅助方法**

```js
// src/store/chat.js
const settingsVisible = ref(false)
const lastError = ref('')
const currentDraft = computed(() => ensureDraft(currentTopicId.value || createTopic()))
const hasConfig = computed(() => Boolean(appConfig.baseURL && appConfig.apiKey))
const runtimeConfig = computed(() => ({
  baseURL: appConfig.baseURL,
  apiKey: appConfig.apiKey,
  timeout: appConfig.timeout,
  requestMode: appConfig.requestMode,
}))

function openSettings() {
  settingsVisible.value = true
}

function closeSettings() {
  settingsVisible.value = false
}

function completeImageGeneration(result, prompt) {
  const topicId = currentTopicId.value
  const generatingIndex = [...messages.value]
    .reverse()
    .findIndex((item) => item.topicId === topicId && item.type === 'system_status' && item.status === 'generating')

  if (generatingIndex >= 0) {
    messages.value.splice(messages.value.length - 1 - generatingIndex, 1)
  }

  messages.value.push({
    id: crypto.randomUUID(),
    topicId,
    type: 'assistant_images',
    role: 'assistant',
    prompt,
    revisedPrompt: result.revisedPrompt,
    images: result.images,
    model: currentDraft.value.model,
    size: currentDraft.value.size,
    quality: currentDraft.value.quality,
    n: currentDraft.value.n,
    sourceMessageId: currentDraft.value.referenceImages[0]?.sourceMessageId || null,
    createdAt: Date.now(),
  })

  const topic = topics.value.find((item) => item.id === topicId)
  topic.coverImage = result.images[0]?.url || null
  topic.lastPrompt = prompt
  topic.updatedAt = Date.now()
  topic.messageCount += 2
  topic.status = 'idle'
  currentDraft.value.prompt = ''
  currentDraft.value.referenceImages = []
  lastError.value = ''
}

function failImageGeneration(error) {
  const topicId = currentTopicId.value
  const readable = getReadableError(error)
  const lastIndex = messages.value.findLastIndex(
    (item) => item.topicId === topicId && item.type === 'system_status' && item.status === 'generating',
  )

  if (lastIndex >= 0) {
    messages.value.splice(lastIndex, 1, {
      id: crypto.randomUUID(),
      topicId,
      type: 'assistant_text',
      role: 'assistant',
      content: readable,
      createdAt: Date.now(),
    })
  }

  const topic = topics.value.find((item) => item.id === topicId)
  topic.status = 'error'
  topic.updatedAt = Date.now()
  lastError.value = readable
}

function getReadableError(error) {
  return error?.response?.data?.error?.message || error?.message || '图像生成失败，请检查中转站配置'
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test -- src/components/InputConsole.test.js`
Expected: PASS，输出 `1 passed`

- [ ] **Step 6: 提交本任务**

```bash
git add src/components/InputConsole.vue src/components/InputConsole.test.js src/store/chat.js src/services/imageSession.js
git commit -m "feat: connect input console to live image generation"
```

### Task 7: 打磨侧边栏、空状态与主题行为

**Files:**
- Create: `src/components/Sidebar.test.js`
- Modify: `src/components/Sidebar.vue`
- Modify: `src/components/ChatArea.vue`
- Modify: `src/components/MainLayout.vue`
- Modify: `src/styles/main.scss`
- Modify: `src/styles/variables.scss`

- [ ] **Step 1: 写失败测试，锁定主题创建与选中态**

```js
// src/components/Sidebar.test.js
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import Sidebar from './Sidebar.vue'
import { useChatStore } from '@/store/chat'

describe('Sidebar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('点击新建创作后新增主题', async () => {
    const wrapper = mount(Sidebar, {
      global: {
        plugins: [createPinia()],
      },
    })

    const store = useChatStore()
    const beforeCount = store.topics.length
    await wrapper.find('.action-btn').trigger('click')
    expect(store.topics.length).toBe(beforeCount + 1)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- src/components/Sidebar.test.js`
Expected: FAIL，提示旧版 store 与新组件行为不匹配

- [ ] **Step 3: 改造侧边栏和空状态文案**

```vue
<!-- src/components/Sidebar.vue -->
<template>
  <div class="sidebar">
    <div class="sidebar-header">
      <div class="brand">
        <span>图像工作台</span>
      </div>
      <button class="action-btn" type="button" @click="handleNewTopic">新建创作</button>
      <div class="search-box">
        <input v-model="keyword" type="text" placeholder="搜索主题" />
      </div>
    </div>
  </div>
</template>
```

```vue
<!-- src/components/ChatArea.vue -->
<div class="empty-state" v-else>
  <h1>开始与 GPT Image-2 一起创作</h1>
  <p>输入一句要求，或先设置参考图与尺寸参数。</p>
</div>
```

- [ ] **Step 4: 打磨布局和样式变量**

```scss
// src/styles/variables.scss
$bg-base: #05070b;
$bg-panel: rgba(15, 18, 24, 0.82);
$text-primary: rgba(255, 255, 255, 0.92);
$text-secondary: rgba(255, 255, 255, 0.62);
$accent-color: #77a8ff;
$accent-glow: rgba(119, 168, 255, 0.35);
$sidebar-width: 288px;
```

```scss
// src/styles/main.scss
body {
  background:
    radial-gradient(circle at top, rgba(74, 113, 255, 0.12), transparent 28%),
    #05070b;
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test -- src/components/Sidebar.test.js`
Expected: PASS，输出 `1 passed`

- [ ] **Step 6: 提交本任务**

```bash
git add src/components/Sidebar.vue src/components/Sidebar.test.js src/components/ChatArea.vue src/components/MainLayout.vue src/styles/main.scss src/styles/variables.scss
git commit -m "feat: polish sidebar and empty state experience"
```

### Task 8: 全量验证与交付检查

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 补充 README 的启动与配置说明**

```md
## 启动方式

1. 复制 `.env.example` 为 `.env.local`
2. 填写中转站 `baseURL` 和 `apiKey`
3. 运行 `npm install`
4. 运行 `npm run dev`

## 测试

- `npm run test`
- `npm run build`
```

- [ ] **Step 2: 跑完整测试集**

Run: `npm run test`
Expected: PASS，所有 `*.test.js` 通过

- [ ] **Step 3: 跑生产构建**

Run: `npm run build`
Expected: PASS，输出 `dist/` 产物且无编译错误

- [ ] **Step 4: 手动验收主流程**

Run:

```bash
npm run dev
```

Expected:
- 首屏未配置时可打开设置抽屉
- 配置有效后连接状态变为 `已连接`
- 输入 prompt 可返回真实图片消息
- 图片卡片支持继续细化、再次生成、设为参考图、下载原图
- 刷新后主题、消息、配置仍在

- [ ] **Step 5: 提交本任务**

```bash
git add README.md
git commit -m "docs: document image workbench setup and verification"
```
