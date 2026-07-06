<script setup>
import { NImage, NImageGroup } from 'naive-ui'

const imageFrameStyle = {
  maxWidth: '720px',
  maxHeight: '420px',
}

const emit = defineEmits(['refine', 'download', 'retry', 'reference'])

defineProps({
  message: {
    type: Object,
    required: true,
  },
})
</script>

<template>
  <div class="message-row is-assistant" data-role="message-row">
    <div class="message-side">
      <div class="message-badge" data-role="message-badge">AI</div>
      <div class="message-meta">
        <strong data-role="message-title">图像结果</strong>
        <span>{{ message.model }}</span>
      </div>
    </div>

    <div class="image-message-card">
      <div class="meta-row">
        <span>{{ message.model }}</span>
        <span>{{ message.size }}</span>
      </div>

      <div class="image-grid">
        <n-image-group>
          <div
            v-for="image in message.images"
            :key="image.id"
            data-role="image-frame"
            class="image-frame"
            :style="imageFrameStyle"
          >
            <n-image :src="image.url" alt="生成结果" object-fit="contain" class="image-item" />
          </div>
        </n-image-group>
      </div>

      <div class="action-row">
        <button type="button" @click="emit('refine', message)">继续细化</button>
        <button type="button" @click="emit('retry', message)">再次生成</button>
        <button type="button" @click="emit('reference', message)">设为参考图</button>
        <button type="button" @click="emit('download', message)">下载原图</button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.message-row {
  display: flex;
  width: 100%;
  gap: 16px;
  align-items: flex-start;
}

.message-side {
  width: 112px;
  flex-shrink: 0;
  display: grid;
  gap: 10px;
  padding-top: 4px;
}

.message-badge {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.96);
  background:
    linear-gradient(180deg, rgba(42, 255, 204, 0.18) 0%, rgba(22, 126, 125, 0.16) 100%),
    rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(42, 255, 204, 0.22);
  box-shadow:
    0 12px 24px rgba(0, 0, 0, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.message-meta {
  display: grid;
  gap: 4px;

  strong {
    font-size: 12px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.88);
    letter-spacing: 0.02em;
  }

  span {
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    line-height: 1.5;
    word-break: break-all;
  }
}

.image-message-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
  min-width: 0;
  padding: 18px;
  border-radius: 10px 22px 22px 22px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.045) 0%, rgba(255, 255, 255, 0.02) 100%),
    rgba(10, 12, 18, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow:
    0 18px 48px rgba(0, 0, 0, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.meta-row {
  display: flex;
  gap: 10px;
  color: rgba(255, 255, 255, 0.56);
  font-size: 12px;
  flex-wrap: wrap;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.image-grid :deep(.n-image) {
  width: 100%;
  height: 100%;
}

.image-frame {
  width: 100%;
  justify-self: start;
  align-self: start;
}

.image-item:deep(img) {
  width: 100%;
  height: 100%;
  min-height: 220px;
  max-height: 420px;
  border-radius: 16px;
  cursor: zoom-in;
  box-shadow:
    0 18px 40px rgba(0, 0, 0, 0.45),
    0 0 0 1px rgba(255, 255, 255, 0.08);
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;

  button {
    padding: 8px 12px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.88);
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.14);
    }
  }
}

@media (max-width: 860px) {
  .message-row {
    gap: 12px;
  }

  .message-side {
    width: 72px;
  }
}

@media (max-width: 640px) {
  .message-row {
    gap: 10px;
  }

  .message-side {
    width: 54px;
  }

  .message-meta {
    display: none;
  }

  .image-message-card {
    padding: 16px;
  }
}
</style>
