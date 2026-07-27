<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Maximize2, Minimize2 } from 'lucide-vue-next'
import { useChatStore } from '@/store/chat'
import { useProvidersStore } from '@/store/providers'
import { getPromptDetail } from '@/services/promptApi'
import { triggerBrowserDownload } from '@/utils/download'
import ImageMessageCard from './ImageMessageCard.vue'
import VideoMessageCard from './VideoMessageCard.vue'
import InputConsole from './InputConsole.vue'
import MessageBubble from './MessageBubble.vue'
import SettingsModal from './settings/SettingsModal.vue'

const chatStore = useChatStore()
const providersStore = useProvidersStore()
const route = useRoute()
const router = useRouter()

const currentMessages = computed(() => {
  return chatStore.currentMessages
})

/**
 * 消息列表滚动控制
 *
 * 切换到历史会话时，默认定位到最近一条消息（滚到底部），而非停留在顶部。
 * 新增消息（生成中/生成完成）时，仅在用户已接近底部的情况下自动跟随，
 * 避免用户主动上滑查阅历史时被强制拉回底部。
 */
const messagesContainerRef = ref(null)
// 切换主题后待强制滚到底的标记（由 currentTopicId 变化置位，消息渲染后消费）
let pendingScrollToBottom = false

/** 把消息容器滚动到底部（定位到最近一条记录） */
function scrollToBottom() {
  const el = messagesContainerRef.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

/** 用户当前是否停在接近底部的位置（用于新增消息时判断是否跟随） */
function isNearBottom() {
  const el = messagesContainerRef.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < 120
}

// 切换主题：置位「待滚到底」，等该主题消息加载并渲染后再消费
watch(
  () => chatStore.currentTopicId,
  () => {
    pendingScrollToBottom = true
  },
)

// 消息列表变化：主题切换后强制滚到底；否则仅在接近底部时跟随新消息
watch(
  currentMessages,
  () => {
    // flush:post 确保在 DOM 更新后执行；容器未渲染（空会话）时跳过，等有内容再处理
    if (!messagesContainerRef.value) return
    if (pendingScrollToBottom || isNearBottom()) {
      scrollToBottom()
    }
    pendingScrollToBottom = false
  },
  { flush: 'post' },
)

/**
 * P0-7: 「继续细化」——把消息的图片设为参考图，并把 prompt 设为该消息的 prompt
 *
 * 参考图通过 chatStore.addReferenceFromMessage 持久化到后端 draft_reference_images 表，
 * 不再直接修改本地状态导致刷新丢失。
 *
 * 视频消息的 images 全是 video/mp4，不能作为首帧参考图（addReferenceFromMessage 会
 * 过滤 image/* 并误报「该消息没有可设为参考图的图片」），因此视频消息只回填 prompt。
 *
 * @param {{ id: string; type: string; prompt?: string; images?: Array<object> }} message 历史消息
 */
const handleRefine = async (message) => {
  // 先把 prompt 回填到草稿（细化的起点）
  if (message.prompt) {
    chatStore.currentDraft.prompt = message.prompt
  }
  // 视频消息没有可设为参考图的图片，跳过避免误报错误
  if (message.type === 'assistant_videos') return
  // 参考图走后端持久化
  await chatStore.addReferenceFromMessage(message)
}

/**
 * 「再次生成」——把消息的参数回填到草稿，用户可调整后重新生成
 */
const handleRetry = (message) => {
  const draft = chatStore.currentDraft
  draft.prompt = message.prompt || ''
  draft.model = message.model || draft.model
  if (message.type === 'assistant_videos') {
    // 视频消息回填 ratio/duration/resolution/videoRefMode（替代图像的 size/quality/n）
    draft.ratio = message.ratio || message.meta?.ratio || draft.ratio
    draft.duration = message.duration ?? message.meta?.duration ?? draft.duration
    draft.resolution = message.resolution || message.meta?.resolution || draft.resolution
    draft.videoRefMode = message.videoRefMode || message.meta?.videoRefMode || draft.videoRefMode
  } else {
    draft.size = message.size || draft.size
    draft.quality = message.quality || draft.quality
    draft.n = message.n || draft.n
  }
}

/**
 * 「重试」——用户消息专用，用该消息的草稿快照还原参数后直接重新发送
 *
 * 与「再次生成」的区别：再次生成仅回填参数需手动点发送；
 * 重试还原草稿后立即调 runGeneration 触发生成，无需手动操作。
 *
 * 用户消息创建时已快照完整草稿（createUserPromptMessage 的 draftSnapshot），
 * 含 prompt + model + providerId + 参数 + 参考图，可直接还原复用。
 *
 * @param {{ prompt?: string; draftSnapshot?: object }} message 历史用户消息
 */
const handleDirectRetry = async (message) => {
  if (chatStore.isGenerating) return
  const snapshot = message.draftSnapshot
  if (!snapshot) return

  // 还原草稿让输入框显示被重试的 prompt 与参数（同步操作，无竞态）
  chatStore.restoreDraft(snapshot)

  const prompt = (message.prompt || snapshot.prompt || '').trim()
  if (!prompt) return

  // 捕获快照传给 runGeneration（深拷贝参考图防引用共享）
  const draftSnapshot = {
    ...snapshot,
    referenceImages: (snapshot.referenceImages || []).map((img) => ({ ...img })),
  }
  await chatStore.runGeneration(prompt, draftSnapshot)
}

/**
 * P0-7: 「设为参考图」——调 store action 持久化到后端
 */
const handleReference = (message) => {
  chatStore.addReferenceFromMessage(message)
}

/**
 * 下载原图
 */
const handleDownload = async (message) => {
  const image = message.images?.[0]
  if (!image?.url) return

  triggerBrowserDownload({
    dataUrl: image.url,
    fileName: `${chatStore.currentTopicId || 'image'}-${Date.now()}.png`,
  })
}

/**
 * 下载视频
 * 取首个视频 url（/files/generated/xxx.mp4 形式），触发浏览器下载
 */
const handleDownloadVideo = async (message) => {
  const video = message.videos?.[0] || message.images?.find((i) => i.mimeType?.startsWith('video/'))
  if (!video?.url) return

  triggerBrowserDownload({
    dataUrl: video.url,
    fileName: `${chatStore.currentTopicId || 'video'}-${Date.now()}.mp4`,
  })
}

/**
 * 检查 pending 视频任务状态
 * 用户在 pending 卡片上点「检查状态」时触发，调 store action 回查上游任务
 */
const handleCheckPending = async (message) => {
  await chatStore.checkPendingVideoMessage(message)
}

/**
 * 改动2: Esc 退出聊天区全屏
 */
function handleWindowKeydown(event) {
  if (event.key === 'Escape' && chatStore.isChatFullscreen) {
    chatStore.toggleChatFullscreen()
  }
}

/**
 * 按提示词类型自动选中第一个启用的对应类型模型
 *
 * 一键使用提示词时，根据 prompt.type 切换到匹配的模型：
 * - video → 第一个 isVideo=true 的启用模型
 * - image → 第一个 isImage=true 的启用模型
 * - audio / text → 保持当前模型（项目暂无音频/文本生成模型）
 *
 * @param {string} type 提示词类型
 */
function selectModelByPromptType(type) {
  if (type !== 'video' && type !== 'image') return
  const providers = providersStore.enabledProviders
  for (const provider of providers) {
    if (!provider.enabledModels) continue
    const model = provider.enabledModels.find((m) =>
      type === 'video' ? m.isVideo : m.isImage,
    )
    if (model) {
      const draft = chatStore.currentDraft
      draft.providerId = provider.id
      draft.model = model.modelId
      return
    }
  }
}

/**
 * 一键使用提示词：从 route.query.promptId 加载提示词，填充 draft.prompt 并按类型选模型
 *
 * 流程：
 * 1. 检测 query.promptId，立即清除 query（router.replace），避免刷新重复填充
 * 2. 确保 providers 已加载（才能按类型选模型）
 * 3. 调 getPromptDetail 拉取提示词详情
 * 4. 填充 draft.prompt，按 type 自动选模型
 * 5. draft 变更会触发 store 的 watch 自动持久化
 *
 * 失败时写 lastError，不阻断页面渲染。
 */
async function applyPromptFromQuery() {
  const promptId = route.query.promptId
  if (!promptId) return

  // 立即清除 query，避免刷新或返回时重复填充
  await router.replace({ query: {} })

  try {
    // 确保 providers 已加载，才能按类型选模型
    await providersStore.loadProviders()
    const prompt = await getPromptDetail(String(promptId))
    if (!prompt) return

    const draft = chatStore.currentDraft
    draft.prompt = prompt.content || ''
    selectModelByPromptType(prompt.type)
  } catch (err) {
    chatStore.lastError = `加载提示词失败：${err?.response?.data?.message || err?.message || ''}`
  }
}

onMounted(async () => {
  chatStore.bootstrap()
  window.addEventListener('keydown', handleWindowKeydown)
  // bootstrap 后处理一键使用提示词的 query（不阻塞渲染，失败仅写 lastError）
  await applyPromptFromQuery()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
})
</script>

<template>
  <div class="chat-area scene-visible">
    <div class="header-actions">
      <button
        class="fullscreen-btn"
        type="button"
        data-action="toggle-fullscreen"
        :title="chatStore.isChatFullscreen ? '退出全屏' : '全屏对话'"
        @click="chatStore.toggleChatFullscreen"
      >
        <Minimize2 v-if="chatStore.isChatFullscreen" :size="16" />
        <Maximize2 v-else :size="16" />
      </button>
    </div>

    <div class="messages-container" ref="messagesContainerRef" v-if="currentMessages.length > 0">
      <template v-for="message in currentMessages" :key="message.id">
        <ImageMessageCard
          v-if="message.type === 'assistant_images'"
          :message="message"
          @refine="handleRefine"
          @retry="handleRetry"
          @reference="handleReference"
          @download="handleDownload"
        />
        <VideoMessageCard
          v-else-if="message.type === 'assistant_videos'"
          :message="message"
          @refine="handleRefine"
          @retry="handleRetry"
          @download="handleDownloadVideo"
          @check-pending="handleCheckPending"
        />
        <MessageBubble v-else :message="message" @retry="handleDirectRetry" />
      </template>
    </div>

    <div class="empty-state" v-else>
      <div class="empty-copy">
        <h1>开始视觉创作</h1>
        <p>输入一句要求，或先设置参考图、尺寸与生成张数。</p>
      </div>
    </div>

    <div class="input-container">
      <InputConsole />
    </div>

    <SettingsModal
      :show="chatStore.settingsVisible"
      @update:show="chatStore.settingsVisible = $event"
    />
  </div>
</template>

<style lang="scss" scoped>
@import '@/styles/variables.scss';

.chat-area {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  background: transparent;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(circle at 52% 18%, rgba(108, 255, 214, 0.05), transparent 22%),
      linear-gradient(180deg, rgba(5, 7, 11, 0.12), rgba(5, 7, 11, 0.28));
    z-index: 0;
  }
}

.scene-visible > * {
  position: relative;
  z-index: 1;
}

.header-actions {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  gap: 12px;
  z-index: 10;
}

/* 改动2: 全屏切换按钮 */
.fullscreen-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(18, 18, 18, 0.72);
  color: rgba(255, 255, 255, 0.88);
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.14);
  }
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}

.empty-copy {
  max-width: 620px;
  text-align: center;

  h1 {
    margin: 0 0 12px;
    font-size: 32px;
    font-weight: 600;
    color: transparent;
    background: linear-gradient(180deg, #ffffff 0%, rgba(255, 255, 255, 0.52) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    letter-spacing: 1px;
    text-shadow: 0 4px 24px rgba(255, 255, 255, 0.1);
  }

  p {
    margin: 0;
    color: $text-secondary;
    font-size: 14px;
    line-height: 1.7;
  }
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 40px clamp(20px, 4vw, 48px);
  display: flex;
  flex-direction: column;
  gap: 20px;
  z-index: 1;
  align-items: center;
}

.messages-container > * {
  width: min(1040px, 100%);
}

.input-container {
  padding: 0 clamp(20px, 4vw, 48px) 40px;
  z-index: 10;
  display: flex;
  justify-content: center;
}

.input-container > * {
  width: min(1040px, 100%);
}
</style>
