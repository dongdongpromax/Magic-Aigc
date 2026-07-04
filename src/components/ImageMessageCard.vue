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
</template>

<style lang="scss" scoped>
.image-message-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border-radius: 20px;
  background: rgba(17, 20, 28, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.meta-row {
  display: flex;
  gap: 10px;
  color: rgba(255, 255, 255, 0.56);
  font-size: 12px;
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
  }
}
</style>
