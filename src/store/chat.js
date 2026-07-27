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
import { requestImages } from '@/services/imageSession'
import { requestVideo, checkPendingVideo } from '@/services/videoSession'
import { updateBackendConfig } from '@/services/backendClient'
import { buildImageFileName, buildTimestamp, triggerBrowserDownload } from '@/utils/download'
import { MAX_REFERENCE_IMAGES } from '@/utils/constants'
import { createStatusMessage, createUserPromptMessage } from '@/utils/message'
import { useProvidersStore } from '@/store/providers'

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
  // hasConfig 改为读 providers store：存在「启用且有 Key」的中转站才可用
  const providersStore = useProvidersStore()

  const appConfig = reactive({
    baseURL: defaults.baseURL,
    apiKey: defaults.apiKey,
    defaultModel: defaults.defaultModel,
    requestMode: defaults.requestMode,
    defaultSize: defaults.defaultSize,
    defaultQuality: defaults.defaultQuality,
    defaultN: defaults.defaultN,
    // 视频模型默认参数（通用设置按模型类型分区持久化）
    defaultRatio: defaults.defaultRatio,
    defaultDuration: defaults.defaultDuration,
    defaultResolution: defaults.defaultResolution,
    defaultVideoRefMode: defaults.defaultVideoRefMode,
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
    providerId: '',
    size: appConfig.defaultSize,
    quality: appConfig.defaultQuality,
    n: appConfig.defaultN,
    referenceImages: [],
    // 视频生成参数：默认值取自 appConfig（通用设置可配置），刷新回默认值（不持久化到 drafts 表）
    ratio: appConfig.defaultRatio,
    duration: appConfig.defaultDuration,
    resolution: appConfig.defaultResolution,
    // 视频参考模式（持久化到 drafts.video_ref_mode，与参考图同步防刷新错配）
    videoRefMode: appConfig.defaultVideoRefMode,
  })
  /** @type {Map<string, ReturnType<typeof setTimeout>>} 草稿防抖定时器（按 topicId 索引） */
  const draftTimers = new Map()

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
      providerId: '',
      size: appConfig.defaultSize,
      quality: appConfig.defaultQuality,
      n: appConfig.defaultN,
      referenceImages: [],
      // 视频生成参数：默认值取自 appConfig（通用设置可配置），不持久化到 drafts 表
      ratio: appConfig.defaultRatio,
      duration: appConfig.defaultDuration,
      resolution: appConfig.defaultResolution,
      // 视频参考模式（持久化到 drafts.video_ref_mode，与参考图同步防刷新错配）
      videoRefMode: appConfig.defaultVideoRefMode,
    }

    // 后端 getDraft 不返回 ratio/duration/resolution（内存态不持久化），
    // selectTopic/createTopic 会用后端返回值整体覆盖 drafts[topicId]，
    // 导致这些字段变 undefined、n-select 显示空。此处兜底补默认值（取自 appConfig）。
    if (drafts[topicId].ratio == null) drafts[topicId].ratio = appConfig.defaultRatio
    if (drafts[topicId].duration == null) drafts[topicId].duration = appConfig.defaultDuration
    if (drafts[topicId].resolution == null) drafts[topicId].resolution = appConfig.defaultResolution
    // videoRefMode 后端会返回，但旧草稿可能为空，兜底防 undefined
    if (drafts[topicId].videoRefMode == null) drafts[topicId].videoRefMode = appConfig.defaultVideoRefMode

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

  const hasConfig = computed(() => providersStore.hasUsableProvider)

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
      const [settings] = await Promise.all([getSettings(), providersStore.loadProviders()])
      Object.assign(appConfig, defaults, settings)
      // 同步后端连接参数到 axios 实例：用户在设置中改的 baseURL/timeout 对后续请求生效
      updateBackendConfig(appConfig)
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
    // 切换前 flush 当前主题的 pending 草稿，避免快速来回切换时
    // 本地未保存输入被 getRemoteDraft 返回的后端旧值整体覆盖而丢失
    if (currentTopicId.value && currentTopicId.value !== topicId) {
      await flushDraftPersist(currentTopicId.value)
    }

    currentTopicId.value = topicId
    const [nextMessages, nextDraft] = await Promise.all([
      getRemoteMessages(topicId),
      getRemoteDraft(topicId),
    ])

    // 改动5: 保留内存中该主题 pending 的消息，避免生成中切走再切回时消息丢失
    // - generating 状态消息后端永不存（saveGeneratedConversation 只存 done 状态），必留
    // - user_prompt 若后端没存（生成未完成）则保留；已存（生成完成）则丢弃避免重复
    const remoteUserPrompts = new Set(
      nextMessages.filter((m) => m.type === 'user_prompt').map((m) => m.prompt),
    )
    const keptPending = messages.value.filter(
      (message) =>
        message.topicId === topicId &&
        ((message.type === 'system_status' && message.status === 'generating') ||
          (message.type === 'user_prompt' && !remoteUserPrompts.has(message.prompt))),
    )

    messages.value = [...messages.value.filter((m) => m.topicId !== topicId), ...nextMessages, ...keptPending].sort(
      (a, b) => a.createdAt - b.createdAt,
    )
    drafts[topicId] = nextDraft
    return topicId
  }

  /**
   * 创建新主题
   * @param {string} title
   * @returns {Promise<string>} 新主题 ID
   */
  async function createTopic(title = '新主题') {
    // 新建主题前 flush 当前主题 pending 草稿，避免丢失未保存输入
    if (currentTopicId.value) {
      await flushDraftPersist(currentTopicId.value)
    }

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

      // 仅登记图片为参考图：视频文件（mimeType video/*）不能作为首帧图片传给上游
      const imageIds = (message.images || [])
        .filter((image) => image.mimeType?.startsWith('image/'))
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
      providerId: draft.providerId || '',
      size: draft.size || appConfig.defaultSize,
      quality: draft.quality || appConfig.defaultQuality,
      n: draft.n || appConfig.defaultN,
      // 视频参考模式持久化（与参考图同步，防刷新错配）
      videoRefMode: draft.videoRefMode || 'first_frame',
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
      // 执行后立即清除记录，使 draftTimers 准确反映「是否有 pending 未执行定时器」，
      // 让 flushDraftPersist 能正确区分 pending 与已执行，避免重复保存
      draftTimers.delete(topicId)
      // P1-3: 取消静默吞错，让用户感知保存失败
      saveRemoteDraft(topicId, serializeDraft(ensureDraft(topicId))).catch((err) => {
        lastError.value = `草稿保存失败：${err?.message || ''}`
      })
    }, 250)
    draftTimers.set(topicId, timer)
  }

  /**
   * 同步 flush 指定主题的 pending 草稿（取消防抖定时器并立即保存）
   *
   * 用于切换主题前确保本地修改落盘，避免 selectTopic/createTopic 用后端旧值
   * 覆盖尚未保存的本地输入（快速来回切换时输入丢失的根因）。
   * 无 pending 定时器时直接返回，不产生额外网络请求。
   * @param {string} topicId 主题 ID
   * @returns {Promise<void>}
   */
  async function flushDraftPersist(topicId) {
    if (!topicId) return
    const timer = draftTimers.get(topicId)
    if (!timer) return // 无 pending 修改，无需保存

    clearTimeout(timer)
    draftTimers.delete(topicId)
    try {
      await saveRemoteDraft(topicId, serializeDraft(ensureDraft(topicId)))
    } catch (err) {
      lastError.value = `草稿保存失败：${err?.message || ''}`
    }
  }

  /**
   * 改动1: 设置保存状态（idle/saving/saved/error）
   *
   * 替代原 watch 自动防抖保存。SettingsDrawer 用本地副本编辑，点「保存」才调 saveSettings，
   * 通过此状态反馈保存结果，解决用户"保存无效"的体感问题。
   */
  const settingsSaveStatus = ref('idle')

  /**
   * 改动1: 显式保存设置到后端
   *
   * 调 updateSettings（PUT /api/settings）持久化 baseURL/模型/尺寸/张数/请求模式/超时，
   * 成功后用返回值回填 appConfig 并置 saved，失败置 error 并写 lastError。
   * @returns {Promise<boolean>} 是否保存成功
   */
  async function saveSettings() {
    settingsSaveStatus.value = 'saving'
    try {
      const saved = await updateSettings({
        baseURL: appConfig.baseURL,
        defaultModel: appConfig.defaultModel,
        defaultSize: appConfig.defaultSize,
        defaultQuality: appConfig.defaultQuality,
        defaultN: appConfig.defaultN,
        requestMode: appConfig.requestMode,
        timeout: appConfig.timeout,
        defaultRatio: appConfig.defaultRatio,
        defaultDuration: appConfig.defaultDuration,
        defaultResolution: appConfig.defaultResolution,
        defaultVideoRefMode: appConfig.defaultVideoRefMode,
      })
      Object.assign(appConfig, saved)
      // 保存后同步 axios 实例的 baseURL/timeout，确保新值立即对后续请求生效
      updateBackendConfig(appConfig)
      settingsSaveStatus.value = 'saved'
      lastError.value = ''
      return true
    } catch (err) {
      settingsSaveStatus.value = 'error'
      lastError.value = `设置保存失败：${err?.message || ''}`
      return false
    }
  }

  /**
   * 改动2: 聊天区全屏状态（隐藏侧栏，消息+输入铺满整个窗口）
   *
   * 提升到 store 便于 MainLayout/ChatArea/Sidebar 联动 + Esc 监听统一。
   */
  const isChatFullscreen = ref(false)

  function toggleChatFullscreen() {
    isChatFullscreen.value = !isChatFullscreen.value
  }

  /**
   * 生成中状态（图像/视频生成统一标记）
   *
   * 替代 InputConsole 本地的 isLoading，提升到 store 后：
   * - InputConsole 发送与 ChatArea 重试共用同一把锁，防止并发生成
   * - 发送按钮 disabled 状态、重试按钮 disabled 状态都读它
   */
  const isGenerating = ref(false)

  /**
   * 图像生成完成后的处理：下载图片、追加 assistant 消息、更新主题
   *
   * P1-4: 移除 localImageBridge 调用，因为后端 generateImageMessage
   * 已把 b64 写入 server/storage/generated/ 并返回 localPath。
   *
   * @param {{ images?: Array<object>; revisedPrompt?: string }} result 后端返回结果
   * @param {string} prompt 用户 prompt
   */
  async function completeImageGeneration(result, prompt, originTopicId = currentTopicId.value) {
    // 改动5: 绑定发起时的 originTopicId，生成中切换主题后结果仍正确归位发起主题，
    // 不污染切换后主题的草稿，也不让原主题 generating 状态卡死
    const topicId = originTopicId
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
      meta: { providerName: result.providerName || '' },
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
  function failImageGeneration(error, originTopicId = currentTopicId.value) {
    // 改动5: 绑定发起时的 originTopicId，失败消息归位发起主题
    const topicId = originTopicId
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

  /**
   * 视频生成完成后的处理：追加 assistant_videos 消息、更新主题
   *
   * 平行于 completeImageGeneration，区别：
   * - 消息 type 为 'assistant_videos'
   * - 不触发浏览器自动下载（视频文件大，体验差；用户可手动点下载按钮）
   * - meta 含 ratio/duration/resolution
   *
   * @param {{ videos?: Array<object>; providerName?: string; ratio?: string; duration?: number; resolution?: string }} result 后端返回结果
   * @param {string} prompt 用户 prompt
   * @param {string} originTopicId 发起时的主题 ID（生成中切换主题后结果仍归位发起主题）
   */
  async function completeVideoGeneration(result, prompt, originTopicId = currentTopicId.value) {
    // 绑定发起时的 originTopicId，生成中切换主题后结果仍正确归位发起主题
    const topicId = originTopicId
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

    // pending 分支：轮询超时但上游任务仍在后台运行
    // 保存 pending 消息（含 taskId/providerId），用户可点「检查状态」回查
    if (result.status === 'pending') {
      messages.value.push({
        id: result.pendingMessageId || createId(),
        topicId,
        type: 'assistant_videos',
        role: 'assistant',
        status: 'pending',
        prompt,
        videos: [],
        images: [],
        model: draft.model,
        ratio: result.ratio || draft.ratio,
        duration: result.duration ?? draft.duration,
        resolution: result.resolution || draft.resolution,
        videoRefMode: result.videoRefMode || draft.videoRefMode || 'first_frame',
        taskId: result.taskId || null,
        providerId: result.providerId || null,
        meta: {
          providerName: result.providerName || '',
          ratio: result.ratio || draft.ratio,
          duration: result.duration ?? draft.duration,
          resolution: result.resolution || draft.resolution,
          videoRefMode: result.videoRefMode || draft.videoRefMode || 'first_frame',
          status: 'pending',
          taskId: result.taskId || null,
        },
        createdAt: Date.now(),
      })

      if (topic) {
        topic.lastPrompt = prompt
        topic.updatedAt = Date.now()
        topic.status = 'idle'
      }

      // 后端已清参考图 + 重置草稿，前端同步
      draft.prompt = ''
      draft.referenceImages = []
      lastError.value = ''
      scheduleDraftPersist(topicId)
      return
    }

    const videos = (result.videos || []).map((video) => ({
      ...video,
      localPath: video.localPath || '',
      savedToProject: Boolean(video.localPath),
    }))

    messages.value.push({
      id: createId(),
      topicId,
      type: 'assistant_videos',
      role: 'assistant',
      prompt,
      videos,
      // images 字段兼容：ChatArea/VideoMessageCard 可从 images 读取（reload 后从 message_images 表读出）
      images: videos,
      model: draft.model,
      ratio: result.ratio || draft.ratio,
      duration: result.duration ?? draft.duration,
      resolution: result.resolution || draft.resolution,
      // 视频参考模式写入消息体，供 retry 回填与卡片 meta 展示
      videoRefMode: result.videoRefMode || draft.videoRefMode || 'first_frame',
      sourceMessageId: draft.referenceImages[0]?.sourceMessageId || null,
      meta: {
        providerName: result.providerName || '',
        ratio: result.ratio || draft.ratio,
        duration: result.duration ?? draft.duration,
        resolution: result.resolution || draft.resolution,
        videoRefMode: result.videoRefMode || draft.videoRefMode || 'first_frame',
      },
      createdAt: Date.now(),
    })

    if (topic) {
      topic.coverImage = videos?.[0]?.url || null
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
   * 视频生成失败处理：移除 generating 状态消息，追加错误消息
   * @param {Error} error
   * @param {string} originTopicId 发起时的主题 ID
   */
  function failVideoGeneration(error, originTopicId = currentTopicId.value) {
    // 绑定发起时的 originTopicId，失败消息归位发起主题
    const topicId = originTopicId
    const readableError = getReadableError(error, '视频生成失败，请检查中转站配置')
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

  /**
   * 检查 pending 视频任务状态：调后端 retry-video 端点回查上游任务
   *
   * 三种结果：
   * - done：上游任务已成功，后端已下载落盘 + 补全消息 → 前端更新消息为已完成
   * - pending：仍在生成中 → 提示用户稍后再试
   * - error：上游失败 → 透传错误信息
   *
   * @param {{ id: string; topicId: string; status?: string }} message pending 消息对象
   */
  async function checkPendingVideoMessage(message) {
    const topicId = message.topicId
    const messageId = message.id
    if (!topicId || !messageId) return

    try {
      const result = await checkPendingVideo(topicId, messageId)

      if (result.status === 'done') {
        // 上游已完成：更新 pending 消息为已完成状态，填充视频数据
        const idx = messages.value.findIndex((m) => m.id === messageId)
        if (idx >= 0) {
          const video = {
            ...result.video,
            localPath: result.video?.localPath || '',
            savedToProject: Boolean(result.video?.localPath),
          }
          messages.value[idx] = {
            ...messages.value[idx],
            status: 'done',
            videos: [video],
            images: [video],
            meta: {
              ...messages.value[idx].meta,
              status: 'done',
            },
          }
        }

        // 更新主题封面为首个视频 url
        const topic = getTopicById(topicId)
        if (topic && result.video?.url) {
          topic.coverImage = result.video.url
        }

        lastError.value = ''
      } else {
        // 仍在生成中
        lastError.value = result.message || '视频仍在生成中，请稍后再试'
      }
    } catch (error) {
      lastError.value = getReadableError(error, '检查视频状态失败')
    }
  }

  /**
   * 判断草稿快照对应的模型是否为视频模型
   *
   * 从 providersStore 查 providerId + modelId 的 isVideo 标记，
   * 与 InputConsole 的 selectedModelInfo 逻辑一致。
   * 模型未找到（已禁用/删除）时回退为图像模型，避免误走视频分支。
   * @param {{ providerId?: string; model?: string }} draftSnapshot
   * @returns {boolean}
   */
  function isDraftVideoModel(draftSnapshot) {
    const pid = draftSnapshot?.providerId
    const mid = draftSnapshot?.model
    if (!pid || !mid) return false
    const provider = providersStore.enabledProviders.find((p) => p.id === pid)
    if (!provider?.enabledModels) return false
    const model = provider.enabledModels.find((m) => m.modelId === mid)
    return Boolean(model?.isVideo)
  }

  /**
   * 从草稿快照还原当前主题草稿的生成参数
   *
   * 用于「重试」：把历史用户消息的 draftSnapshot 还原到当前草稿，
   * 让输入框显示被重试的 prompt 与参数，随后由 runGeneration 直接发起生成。
   *
   * 还原字段：prompt + model + providerId + 图像参数(size/quality/n) +
   * 视频参数(ratio/duration/resolution/videoRefMode) + referenceImages。
   * 参考图深拷贝避免引用共享导致后续修改污染快照。
   * @param {{ prompt?: string; model?: string; providerId?: string; size?: string; quality?: string; n?: number; ratio?: string; duration?: number; resolution?: string; videoRefMode?: string; referenceImages?: Array<object> }} snapshot
   */
  function restoreDraft(snapshot) {
    if (!snapshot) return
    const draft = currentDraft.value
    draft.prompt = snapshot.prompt || ''
    draft.model = snapshot.model || draft.model
    draft.providerId = snapshot.providerId || draft.providerId
    draft.size = snapshot.size || draft.size
    draft.quality = snapshot.quality || draft.quality
    draft.n = snapshot.n || draft.n
    draft.ratio = snapshot.ratio || draft.ratio
    draft.duration = snapshot.duration ?? draft.duration
    draft.resolution = snapshot.resolution || draft.resolution
    draft.videoRefMode = snapshot.videoRefMode || draft.videoRefMode
    draft.referenceImages = (snapshot.referenceImages || []).map((img) => ({ ...img }))
    scheduleDraftPersist(currentTopicId.value)
  }

  /**
   * 生成流程编排（图像/视频统一入口）
   *
   * 从 InputConsole.handleSend 抽取，让发送与「重试」共用同一套生成流程：
   * addUserPrompt（建用户消息+状态消息）→ requestImages/requestVideo（调后端）
   * → complete/fail（写结果消息+清理草稿）。
   *
   * 调用方需在 await 之前捕获 draftSnapshot 传入，避免 await 期间切换主题
   * 导致参数错位（与原 handleSend 的竞态修复保持一致）。
   *
   * @param {string} prompt 用户 prompt（已 trim）
   * @param {object} draftSnapshot 发起时的草稿快照（含 model/providerId/参数/参考图）
   * @returns {Promise<void>}
   */
  async function runGeneration(prompt, draftSnapshot) {
    if (isGenerating.value) return
    // 在任何 await 之前确定视频/图像分支，避免快照与分支错位
    const wasVideoModel = isDraftVideoModel(draftSnapshot)
    isGenerating.value = true
    let originTopicId = ''

    try {
      originTopicId = await addUserPrompt(prompt)
      if (wasVideoModel) {
        const result = await requestVideo(originTopicId, { prompt, draft: draftSnapshot })
        await completeVideoGeneration(result, prompt, originTopicId)
      } else {
        const result = await requestImages(originTopicId, { prompt, draft: draftSnapshot })
        await completeImageGeneration(result, prompt, originTopicId)
      }
    } catch (error) {
      if (wasVideoModel) {
        failVideoGeneration(error, originTopicId)
      } else {
        failImageGeneration(error, originTopicId)
      }
    } finally {
      isGenerating.value = false
    }
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
  function getReadableError(error, fallback = '图像生成失败，请检查中转站配置') {
    return (
      error?.response?.data?.message || error?.response?.data?.error?.message || error?.message || fallback
    )
  }

  /**
   * P2-1: 清理所有草稿定时器，防止 HMR 场景下内存泄漏
   */
  function dispose() {
    draftTimers.forEach((timer) => clearTimeout(timer))
    draftTimers.clear()
  }

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
    settingsSaveStatus,
    isChatFullscreen,
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
    completeVideoGeneration,
    failVideoGeneration,
    checkPendingVideoMessage,
    isGenerating,
    restoreDraft,
    runGeneration,
    saveSettings,
    toggleChatFullscreen,
    openSettings,
    closeSettings,
    openPreview,
    closePreview,
    setPreviewIndex,
    getReadableError,
    dispose,
  }
})
