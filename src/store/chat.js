import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import { getDefaultAppConfig } from '@/config/env'
import {
  createTopic as createRemoteTopic,
  deleteTopic as deleteRemoteTopic,
  getDraft as getRemoteDraft,
  getMessages as getRemoteMessages,
  listTopics,
  saveDraft as saveRemoteDraft,
} from '@/services/chatApi'
import { getSettings, updateSettings } from '@/services/settingsApi'
import {
  deleteReferenceImage as deleteRemoteReferenceImage,
  registerReferenceFromMessage,
} from '@/services/uploadApi'
import { buildImageFileName, buildTimestamp, triggerBrowserDownload } from '@/utils/download'
import { MAX_REFERENCE_IMAGES } from '@/utils/constants'
import { createStatusMessage, createUserPromptMessage } from '@/utils/message'

/**
 * 聊天 store
 *
 * 状态管理核心：
 * - 主题列表、消息列表、草稿（含参考图）统一存入后端 MySQL
 * - 前端只保留 UI 状态（弹层显隐、加载态等）
 *
 * 数据持久化链路：
 * - 草稿/设置变更通过防抖定时器批量保存到后端
 * - 参考图上传/删除立即同步后端
 * - 「设为参考图」通过 registerReferenceFromMessage 调后端 API 持久化
 */
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
  // P0-7: 「设为参考图」防双击 loading
  const isAddingReference = ref(false)
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
  /** @type {Map<string, ReturnType<typeof setTimeout>>} 草稿防抖定时器（按 topicId 索引） */
  const draftTimers = new Map()
  /** @type {ReturnType<typeof setTimeout> | null} 设置防抖定时器 */
  let settingsTimer = null

  /**
   * 生成唯一 ID
   * @returns {string}
   */
  function createId() {
    return (
      globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
    )
  }

  /**
   * 确保指定主题的草稿存在，不存在则初始化为默认值
   * @param {string} topicId 主题 ID
   * @returns {object} 草稿对象
   */
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

  /**
   * 根据 ID 查找主题
   * @param {string} topicId
   * @returns {object|null}
   */
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

  /**
   * 初始化：拉取设置、主题列表，选中第一个主题或创建新主题
   */
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

  /**
   * 选中指定主题，拉取其消息和草稿
   * @param {string} topicId
   * @returns {Promise<string>}
   */
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

  /**
   * 创建新主题
   * @param {string} title
   * @returns {Promise<string>} 新主题 ID
   */
  async function createTopic(title = '新主题') {
    const topic = await createRemoteTopic(title)
    topics.value.unshift(topic)
    drafts[topic.id] = await getRemoteDraft(topic.id)
    currentTopicId.value = topic.id
    return topic.id
  }

  /**
   * P0-8: 删除主题
   *
   * 调后端 DELETE /api/topics/:topicId（事务级联清理 5 表 + 文件），
   * 然后从前端状态移除该主题、消息、草稿。
   * 若删除的是当前主题，切到列表第一个；列表空则创建新主题。
   *
   * @param {string} topicId
   */
  async function deleteTopic(topicId) {
    if (!topicId) return

    await deleteRemoteTopic(topicId)

    // 从前端状态移除
    topics.value = topics.value.filter((topic) => topic.id !== topicId)
    messages.value = messages.value.filter((message) => message.topicId !== topicId)
    delete drafts[topicId]

    // 清理该主题的防抖定时器
    const timer = draftTimers.get(topicId)
    if (timer) {
      clearTimeout(timer)
      draftTimers.delete(topicId)
    }

    // 若删的是当前主题，切到列表第一个或新建
    if (currentTopicId.value === topicId) {
      if (topics.value.length) {
        await selectTopic(topics.value[0].id)
      } else {
        await createTopic('新建创作')
      }
    }
  }

  /**
   * 追加消息到列表
   * @param {object} msg
   */
  function addMessage(msg) {
    messages.value.push({
      id: createId(),
      createdAt: Date.now(),
      ...msg,
    })
  }

  /**
   * 追加用户 prompt 消息和 generating 状态消息
   * @param {string} prompt
   * @returns {Promise<string>} 主题 ID
   */
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

  /**
   * 上传参考图后追加到当前草稿
   * @param {Array<object>} items
   */
  function addReferenceImages(items) {
    currentDraft.value.referenceImages = [...(currentDraft.value.referenceImages || []), ...items]
    scheduleDraftPersist(currentTopicId.value)
  }

  /**
   * P0-7: 「设为参考图」——把历史消息的图片登记为当前主题的参考图
   *
   * 调后端 POST /api/topics/:topicId/references/from-message 持久化到 draft_reference_images 表，
   * 复用 message_images.file_path，不复制文件。
   * 包含 16 张上限校验，超限截断并提示。
   *
   * @param {{ id: string; images?: Array<object> }} message 历史消息
   */
  async function addReferenceFromMessage(message) {
    const topicId = currentTopicId.value
    if (!topicId || !message?.id) return

    // 防双击
    if (isAddingReference.value) return
    isAddingReference.value = true

    try {
      const currentCount = (currentDraft.value.referenceImages || []).length
      const remain = MAX_REFERENCE_IMAGES - currentCount

      if (remain <= 0) {
        lastError.value = `参考图已达 ${MAX_REFERENCE_IMAGES} 张上限`
        return
      }

      // 截断到剩余配额，避免超限
      const imageIds = (message.images || [])
        .slice(0, remain)
        .map((image) => image.id)
        .filter(Boolean)

      if (!imageIds.length) {
        lastError.value = '该消息没有可设为参考图的图片'
        return
      }

      try {
        const { referenceImages } = await registerReferenceFromMessage(topicId, {
          messageId: message.id,
          imageIds,
        })
        currentDraft.value.referenceImages = referenceImages
        lastError.value = ''
      } catch (err) {
        lastError.value = getReadableError(err)
      }
    } finally {
      isAddingReference.value = false
    }
  }

  /**
   * 移除单个参考图（前端状态 + 后端 DELETE）
   * @param {string} id
   */
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

  /**
   * 序列化草稿为可持久化的对象（不含 referenceImages，参考图单独管理）
   * @param {object} draft
   * @returns {object}
   */
  function serializeDraft(draft) {
    return {
      prompt: draft.prompt || '',
      model: draft.model || appConfig.defaultModel,
      size: draft.size || appConfig.defaultSize,
      quality: draft.quality || appConfig.defaultQuality,
      n: draft.n || appConfig.defaultN,
    }
  }

  /**
   * 防抖持久化草稿（250ms 内多次变更只保存一次）
   * @param {string} topicId
   */
  function scheduleDraftPersist(topicId) {
    if (!topicId) return

    clearTimeout(draftTimers.get(topicId))
    const timer = setTimeout(() => {
      // P1-3: 取消静默吞错，让用户感知保存失败
      saveRemoteDraft(topicId, serializeDraft(ensureDraft(topicId))).catch((err) => {
        lastError.value = `草稿保存失败：${err?.message || ''}`
      })
    }, 250)
    draftTimers.set(topicId, timer)
  }

  /**
   * 防抖持久化设置
   */
  function scheduleSettingsPersist() {
    clearTimeout(settingsTimer)
    settingsTimer = setTimeout(() => {
      // P1-3: 取消静默吞错
      updateSettings({
        baseURL: appConfig.baseURL,
        defaultModel: appConfig.defaultModel,
        defaultSize: appConfig.defaultSize,
        defaultQuality: appConfig.defaultQuality,
        defaultN: appConfig.defaultN,
        requestMode: appConfig.requestMode,
        timeout: appConfig.timeout,
      }).catch((err) => {
        lastError.value = `设置保存失败：${err?.message || ''}`
      })
    }, 250)
  }

  /**
   * 图像生成完成后的处理：下载图片、追加 assistant 消息、更新主题
   *
   * P1-4: 移除 localImageBridge 调用，因为后端 generateImageMessage
   * 已把 b64 写入 server/storage/generated/ 并返回 localPath。
   *
   * @param {{ images?: Array<object>; revisedPrompt?: string }} result 后端返回结果
   * @param {string} prompt 用户 prompt
   */
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
    const images = (result.images || []).map((image, index) => {
      const fileName = buildImageFileName(topic?.title, stamp, index)

      // 触发浏览器下载（P1-5: 支持相对路径）
      triggerBrowserDownload({
        dataUrl: image.url,
        fileName,
      })

      // P1-4: 直接用后端返回的 localPath/savedToProject，不再调本地桥接
      // 后端返回 data URL 且无 localPath 时，savedToProject = false
      const hasLocalPath = Boolean(image.localPath)
      const isDataUrl = image.url?.startsWith('data:')

      return {
        ...image,
        localPath: hasLocalPath ? image.localPath : '',
        savedToProject: hasLocalPath ? true : Boolean(image.savedToProject) && !isDataUrl,
      }
    })

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

  /**
   * 图像生成失败处理：移除 generating 状态消息，追加错误消息
   * @param {Error} error
   */
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

  /**
   * 提取可读错误消息
   * @param {Error} error
   * @returns {string}
   */
  function getReadableError(error) {
    return (
      error?.response?.data?.message || error?.response?.data?.error?.message || error?.message || '图像生成失败，请检查中转站配置'
    )
  }

  /**
   * P2-1: 清理所有定时器，防止 HMR 场景下内存泄漏
   */
  function dispose() {
    draftTimers.forEach((timer) => clearTimeout(timer))
    draftTimers.clear()
    if (settingsTimer) {
      clearTimeout(settingsTimer)
      settingsTimer = null
    }
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
    isAddingReference,
    runtimeConfig,
    hasConfig,
    config,
    ensureDraft,
    bootstrap,
    selectTopic,
    createTopic,
    deleteTopic,
    addMessage,
    addUserPrompt,
    addReferenceImages,
    addReferenceFromMessage,
    removeReferenceImage,
    completeImageGeneration,
    failImageGeneration,
    openSettings,
    closeSettings,
    openPreview,
    closePreview,
    setPreviewIndex,
    getReadableError,
    dispose,
  }
})
