<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { Maximize2, Minimize2 } from 'lucide-vue-next'
import { useChatStore } from '@/store/chat'
import { triggerBrowserDownload } from '@/utils/download'
import ConnectionBadge from './ConnectionBadge.vue'
import ImageMessageCard from './ImageMessageCard.vue'
import InputConsole from './InputConsole.vue'
import MessageBubble from './MessageBubble.vue'
import SettingsDrawer from './SettingsDrawer.vue'

const chatStore = useChatStore()

const currentMessages = computed(() => {
  return chatStore.currentMessages
})

/**
 * P0-7: 「继续细化」——把消息的图片设为参考图，并把 prompt 设为该消息的 prompt
 *
 * 参考图通过 chatStore.addReferenceFromMessage 持久化到后端 draft_reference_images 表，
 * 不再直接修改本地状态导致刷新丢失。
 *
 * @param {{ id: string; prompt?: string; images?: Array<object> }} message 历史消息
 */
const handleRefine = async (message) => {
  // 先把 prompt 回填到草稿（细化的起点）
  if (message.prompt) {
    chatStore.currentDraft.prompt = message.prompt
  }
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
  draft.size = message.size || draft.size
  draft.quality = message.quality || draft.quality
  draft.n = message.n || draft.n
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
 * 改动2: Esc 退出聊天区全屏
 */
function handleWindowKeydown(event) {
  if (event.key === 'Escape' && chatStore.isChatFullscreen) {
    chatStore.toggleChatFullscreen()
  }
}

onMounted(() => {
  chatStore.bootstrap()
  window.addEventListener('keydown', handleWindowKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
})
</script>

<template>
  <div class="chat-area scene-visible">
    <div class="header-actions">
      <ConnectionBadge
        :has-config="chatStore.hasConfig"
        :has-error="Boolean(chatStore.lastError)"
        @click="chatStore.openSettings"
      />
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

    <div class="messages-container" v-if="currentMessages.length > 0">
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

    <div class="empty-state" v-else>
      <div class="empty-copy">
        <h1>开始与 GPT Image-2 一起创作</h1>
        <p>输入一句要求，或先设置参考图、尺寸与生成张数。</p>
      </div>
    </div>

    <div class="input-container">
      <InputConsole />
    </div>

    <SettingsDrawer
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
