import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import { getDefaultAppConfig } from '@/config/env'
import { saveImageToProject } from '@/services/localImageBridge'
import { buildImageFileName, buildTimestamp, triggerBrowserDownload } from '@/utils/download'
import { createStatusMessage, createUserPromptMessage } from '@/utils/message'
import { loadPersistedState, savePersistedState } from '@/utils/storage'

export const useChatStore = defineStore('chat', () => {
  const defaults = getDefaultAppConfig()
  const restored = loadPersistedState()
  const restoredAppConfig = restored?.appConfig || {}
  const normalizedDefaultSize =
    restoredAppConfig.defaultSize && restoredAppConfig.defaultSize !== '1024x1024'
      ? restoredAppConfig.defaultSize
      : defaults.defaultSize

  const appConfig = reactive({
    baseURL: defaults.baseURL,
    apiKey: defaults.apiKey,
    defaultModel: defaults.defaultModel,
    requestMode: defaults.requestMode,
    defaultSize: normalizedDefaultSize,
    defaultQuality: defaults.defaultQuality,
    defaultN: defaults.defaultN,
    timeout: defaults.timeout,
    ...restoredAppConfig,
    defaultSize: normalizedDefaultSize,
  })

  const topics = ref(restored?.topics || [])
  const currentTopicId = ref(restored?.currentTopicId || '')
  const messages = ref(restored?.messages || [])
  const drafts = reactive(restored?.drafts || {})
  const settingsVisible = ref(false)
  const lastError = ref('')
  const preview = reactive({
    visible: false,
    title: '',
    model: '',
    size: '',
    images: [],
    activeIndex: 0,
  })

  function createId() {
    return (
      globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
    )
  }

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

  function getTopicById(topicId) {
    return topics.value.find((topic) => topic.id === topicId) || null
  }

  const currentDraft = computed(() => {
    if (!currentTopicId.value) {
      const id = createTopic()
      return ensureDraft(id)
    }

    return ensureDraft(currentTopicId.value)
  })

  const currentMessages = computed(() =>
    messages.value.filter((message) => message.topicId === currentTopicId.value),
  )

  const runtimeConfig = computed(() => ({
    baseURL: appConfig.baseURL,
    apiKey: appConfig.apiKey,
    timeout: appConfig.timeout,
    requestMode: appConfig.requestMode,
  }))

  const hasConfig = computed(() => Boolean(appConfig.baseURL && appConfig.apiKey))

  const config = computed({
    get: () => currentDraft.value,
    set: (value) => {
      const draft = currentDraft.value
      Object.assign(draft, value)
    },
  })

  function createTopic(title = '新主题') {
    const id = createId()
    const newTopic = {
      id,
      title,
      coverImage: null,
      lastPrompt: '',
      updatedAt: Date.now(),
      messageCount: 0,
      status: 'idle',
    }

    topics.value.unshift(newTopic)
    currentTopicId.value = id
    ensureDraft(id)
    return id
  }

  function addMessage(msg) {
    messages.value.push({
      id: createId(),
      createdAt: Date.now(),
      ...msg,
    })
  }

  function addUserPrompt(prompt) {
    const topicId = currentTopicId.value || createTopic()
    const draft = ensureDraft(topicId)

    messages.value.push(createUserPromptMessage(topicId, prompt, draft))
    messages.value.push(createStatusMessage(topicId, 'generating'))

    const topic = getTopicById(topicId)

    if (topic) {
      topic.lastPrompt = prompt
      topic.updatedAt = Date.now()
      topic.messageCount = messages.value.filter((message) => message.topicId === topicId).length
      topic.status = 'generating'
    }
  }

  function addReferenceImages(items) {
    currentDraft.value.referenceImages = [...(currentDraft.value.referenceImages || []), ...items]
  }

  function removeReferenceImage(id) {
    currentDraft.value.referenceImages = (currentDraft.value.referenceImages || []).filter(
      (item) => item.id !== id,
    )
  }

  async function completeImageGeneration(result, prompt) {
    const topicId = currentTopicId.value
    const draft = ensureDraft(topicId)
    const topic = getTopicById(topicId)
    const latestGeneratingIndex = messages.value.findLastIndex(
      (message) =>
        message.topicId === topicId &&
        message.type === 'system_status' &&
        message.status === 'generating',
    )

    if (latestGeneratingIndex >= 0) {
      messages.value.splice(latestGeneratingIndex, 1)
    }

    const stamp = buildTimestamp(new Date())
    const images = await Promise.all(
      (result.images || []).map(async (image, index) => {
        const fileName = buildImageFileName(topic?.title, stamp, index)
        const imageBase64 = image.b64 || image.url?.split(',')[1] || ''

        triggerBrowserDownload({
          dataUrl: image.url,
          fileName,
        })

        try {
          const saved = await saveImageToProject({
            topicTitle: topic?.title || 'image-session',
            fileName,
            imageBase64,
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
      revisedPrompt: result.revisedPrompt || '',
      images,
      model: draft.model,
      size: draft.size,
      quality: draft.quality,
      n: draft.n,
      sourceMessageId: draft.referenceImages[0]?.sourceMessageId || null,
      createdAt: Date.now(),
    })

    if (topic) {
      topic.coverImage = images?.[0]?.url || null
      topic.lastPrompt = prompt
      topic.updatedAt = Date.now()
      topic.messageCount = messages.value.filter((message) => message.topicId === topicId).length
      topic.status = 'idle'
    }

    draft.prompt = ''
    draft.referenceImages = []
    lastError.value = ''
  }

  function failImageGeneration(error) {
    const topicId = currentTopicId.value
    const readableError = getReadableError(error)
    const latestGeneratingIndex = messages.value.findLastIndex(
      (message) =>
        message.topicId === topicId &&
        message.type === 'system_status' &&
        message.status === 'generating',
    )

    if (latestGeneratingIndex >= 0) {
      messages.value.splice(latestGeneratingIndex, 1)
    }

    messages.value.push({
      id: createId(),
      topicId,
      type: 'assistant_text',
      role: 'assistant',
      content: readableError,
      createdAt: Date.now(),
    })

    const topic = getTopicById(topicId)

    if (topic) {
      topic.updatedAt = Date.now()
      topic.messageCount = messages.value.filter((message) => message.topicId === topicId).length
      topic.status = 'error'
    }

    lastError.value = readableError
  }

  function openSettings() {
    settingsVisible.value = true
  }

  function closeSettings() {
    settingsVisible.value = false
  }

  function openPreview(message, startIndex = 0) {
    preview.visible = true
    preview.title = getTopicById(message.topicId)?.title || '图片预览'
    preview.model = message.model || ''
    preview.size = message.size || ''
    preview.images = message.images || []
    preview.activeIndex = startIndex
  }

  function closePreview() {
    preview.visible = false
    preview.activeIndex = 0
  }

  function setPreviewIndex(index) {
    const nextIndex = Math.max(0, Math.min(index, preview.images.length - 1))
    preview.activeIndex = Number.isFinite(nextIndex) ? nextIndex : 0
  }

  function getReadableError(error) {
    return (
      error?.response?.data?.error?.message || error?.message || '图像生成失败，请检查中转站配置'
    )
  }

  watch(
    () => ({
      appConfig: { ...appConfig },
      topics: topics.value,
      messages: messages.value,
      drafts: JSON.parse(JSON.stringify(drafts)),
      currentTopicId: currentTopicId.value,
    }),
    (payload) => {
      savePersistedState(payload)
    },
    { deep: true, flush: 'sync' },
  )

  return {
    appConfig,
    topics,
    currentTopicId,
    messages,
    drafts,
    currentDraft,
    currentMessages,
    preview,
    settingsVisible,
    lastError,
    runtimeConfig,
    hasConfig,
    config,
    ensureDraft,
    createTopic,
    addMessage,
    addUserPrompt,
    addReferenceImages,
    removeReferenceImage,
    completeImageGeneration,
    failImageGeneration,
    openSettings,
    closeSettings,
    openPreview,
    closePreview,
    setPreviewIndex,
    getReadableError,
  }
})
