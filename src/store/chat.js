import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import { getDefaultAppConfig } from '@/config/env'
import {
  createTopic as createRemoteTopic,
  getDraft as getRemoteDraft,
  getMessages as getRemoteMessages,
  listTopics,
  saveDraft as saveRemoteDraft,
} from '@/services/chatApi'
import { getSettings, updateSettings } from '@/services/settingsApi'
import { deleteReferenceImage as deleteRemoteReferenceImage } from '@/services/uploadApi'
import { saveImageToProject } from '@/services/localImageBridge'
import { buildImageFileName, buildTimestamp, triggerBrowserDownload } from '@/utils/download'
import { createStatusMessage, createUserPromptMessage } from '@/utils/message'

export const useChatStore = defineStore('chat', () => {
  const defaults = getDefaultAppConfig()

  const appConfig = reactive({
    baseURL: defaults.baseURL,
    apiKey: defaults.apiKey,
    defaultModel: defaults.defaultModel,
    requestMode: defaults.requestMode,
    defaultSize: defaults.defaultSize,
    defaultQuality: defaults.defaultQuality,
    defaultN: defaults.defaultN,
    timeout: defaults.timeout,
  })

  const topics = ref([])
  const currentTopicId = ref('')
  const messages = ref([])
  const drafts = reactive({})
  const settingsVisible = ref(false)
  const lastError = ref('')
  const isBootstrapping = ref(false)
  const preview = reactive({
    visible: false,
    title: '',
    model: '',
    size: '',
    images: [],
    activeIndex: 0,
  })
  const transientDraft = reactive({
    prompt: '',
    model: appConfig.defaultModel,
    size: appConfig.defaultSize,
    quality: appConfig.defaultQuality,
    n: appConfig.defaultN,
    referenceImages: [],
  })
  const draftTimers = new Map()
  let settingsTimer = null

  function createId() {
    return (
      globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
    )
  }

  function ensureDraft(topicId) {
    if (!topicId) return transientDraft

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
      transientDraft.model = appConfig.defaultModel
      transientDraft.size = appConfig.defaultSize
      transientDraft.quality = appConfig.defaultQuality
      transientDraft.n = appConfig.defaultN
      return transientDraft
    }

    return ensureDraft(currentTopicId.value)
  })

  const currentMessages = computed(() =>
    messages.value.filter((message) => message.topicId === currentTopicId.value),
  )

  const runtimeConfig = computed(() => ({
    baseURL: appConfig.baseURL,
    timeout: appConfig.timeout,
    requestMode: appConfig.requestMode,
  }))

  const hasConfig = computed(() => Boolean(appConfig.baseURL))

  const config = computed({
    get: () => currentDraft.value,
    set: (value) => {
      const draft = currentDraft.value
      Object.assign(draft, value)
    },
  })

  async function bootstrap() {
    if (isBootstrapping.value) return

    isBootstrapping.value = true

    try {
      Object.assign(appConfig, defaults, await getSettings())
      topics.value = await listTopics()

      if (topics.value.length) {
        await selectTopic(topics.value[0].id)
      } else {
        await createTopic('新建创作')
      }
    } finally {
      isBootstrapping.value = false
    }
  }

  async function selectTopic(topicId) {
    currentTopicId.value = topicId
    const [nextMessages, nextDraft] = await Promise.all([
      getRemoteMessages(topicId),
      getRemoteDraft(topicId),
    ])

    messages.value = [
      ...messages.value.filter((message) => message.topicId !== topicId),
      ...nextMessages,
    ]
    drafts[topicId] = nextDraft
    return topicId
  }

  async function createTopic(title = '新主题') {
    const topic = await createRemoteTopic(title)
    topics.value.unshift(topic)
    drafts[topic.id] = await getRemoteDraft(topic.id)
    currentTopicId.value = topic.id
    return topic.id
  }

  function addMessage(msg) {
    messages.value.push({
      id: createId(),
      createdAt: Date.now(),
      ...msg,
    })
  }

  async function addUserPrompt(prompt) {
    const topicId = currentTopicId.value || (await createTopic('新建创作'))
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

    scheduleDraftPersist(topicId)
    return topicId
  }

  function addReferenceImages(items) {
    currentDraft.value.referenceImages = [...(currentDraft.value.referenceImages || []), ...items]
    scheduleDraftPersist(currentTopicId.value)
  }

  async function removeReferenceImage(id) {
    const removed = (currentDraft.value.referenceImages || []).find((item) => item.id === id)

    currentDraft.value.referenceImages = (currentDraft.value.referenceImages || []).filter(
      (item) => item.id !== id,
    )

    if (currentTopicId.value && removed?.filePath) {
      await deleteRemoteReferenceImage(currentTopicId.value, id)
    }

    scheduleDraftPersist(currentTopicId.value)
  }

  function serializeDraft(draft) {
    return {
      prompt: draft.prompt || '',
      model: draft.model || appConfig.defaultModel,
      size: draft.size || appConfig.defaultSize,
      quality: draft.quality || appConfig.defaultQuality,
      n: draft.n || appConfig.defaultN,
    }
  }

  function scheduleDraftPersist(topicId) {
    if (!topicId) return

    clearTimeout(draftTimers.get(topicId))
    const timer = setTimeout(() => {
      saveRemoteDraft(topicId, serializeDraft(ensureDraft(topicId))).catch(() => {})
    }, 250)
    draftTimers.set(topicId, timer)
  }

  function scheduleSettingsPersist() {
    clearTimeout(settingsTimer)
    settingsTimer = setTimeout(() => {
      updateSettings({
        baseURL: appConfig.baseURL,
        defaultModel: appConfig.defaultModel,
        defaultSize: appConfig.defaultSize,
        defaultQuality: appConfig.defaultQuality,
        defaultN: appConfig.defaultN,
        requestMode: appConfig.requestMode,
        timeout: appConfig.timeout,
      }).catch(() => {})
    }, 250)
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

        if (image.savedToProject || image.localPath) {
          return {
            ...image,
            localPath: image.localPath || image.url,
            savedToProject: image.savedToProject ?? true,
          }
        }

        if (!image.url?.startsWith('data:')) {
          return {
            ...image,
            localPath: image.localPath || '',
            savedToProject: Boolean(image.savedToProject),
          }
        }

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
    scheduleDraftPersist(topicId)
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
      baseURL: appConfig.baseURL,
      defaultModel: appConfig.defaultModel,
      defaultSize: appConfig.defaultSize,
      defaultQuality: appConfig.defaultQuality,
      defaultN: appConfig.defaultN,
      requestMode: appConfig.requestMode,
      timeout: appConfig.timeout,
    }),
    () => {
      scheduleSettingsPersist()
    },
    { deep: true },
  )

  watch(
    () => (currentTopicId.value ? serializeDraft(ensureDraft(currentTopicId.value)) : null),
    () => {
      scheduleDraftPersist(currentTopicId.value)
    },
    { deep: true },
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
    isBootstrapping,
    runtimeConfig,
    hasConfig,
    config,
    ensureDraft,
    bootstrap,
    selectTopic,
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
