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
    <!-- 改动3: 去掉左侧 avatar 徽章栏，整张卡片靠左展示 -->
    <div class="image-message-card" data-role="message-body">
      <div class="card-header">
        <span class="role-tag">AI</span>
        <span class="role-title">图像结果</span>
        <span class="meta-sep">·</span>
        <span class="meta-item">{{ message.model }}</span>
        <span class="meta-sep">·</span>
        <span class="meta-item">{{ message.size }}</span>
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
  align-items: flex-start;
}

.image-message-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
  min-width: 0;
  padding: 16px 18px;
  border-radius: 4px 18px 18px 18px;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.role-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(42, 255, 204, 0.16);
  color: rgba(255, 255, 255, 0.9);
}

.role-title {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.meta-sep {
  color: rgba(255, 255, 255, 0.25);
  font-size: 12px;
}

.meta-item {
  color: rgba(255, 255, 255, 0.56);
  font-size: 12px;
  word-break: break-all;
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

@media (max-width: 640px) {
  .image-message-card {
    padding: 14px;
  }
}
</style>
