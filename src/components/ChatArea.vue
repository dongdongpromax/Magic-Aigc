<script setup>
import { computed, onMounted } from 'vue'
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

const handleRefine = (message) => {
  chatStore.currentDraft.referenceImages = message.images.map((image) => ({
    id: image.id,
    name: image.localPath?.split('/').pop() || `reference-${image.id}.png`,
    type: 'image/png',
    url: image.url,
    dataUrl: image.url?.startsWith('data:') ? image.url : '',
    sourceMessageId: message.id,
  }))
}

const handleRetry = (message) => {
  const draft = chatStore.currentDraft
  draft.prompt = message.prompt || ''
  draft.model = message.model || draft.model
  draft.size = message.size || draft.size
  draft.quality = message.quality || draft.quality
  draft.n = message.n || draft.n
}

const handleReference = (message) => {
  handleRefine(message)
}

const handleDownload = async (message) => {
  const image = message.images?.[0]
  if (!image?.url) return

  triggerBrowserDownload({
    dataUrl: image.url,
    fileName: `${chatStore.currentTopicId || 'image'}-${Date.now()}.png`,
  })
}

onMounted(() => {
  chatStore.bootstrap()
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
