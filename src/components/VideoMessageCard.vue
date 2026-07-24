<script setup>
import { computed } from 'vue'

const props = defineProps({
  message: {
    type: Object,
    required: true,
  },
})

// 视频消息不支持「设为首帧」：首帧必须是图片，而视频文件（video/mp4）无法作为
// image_url 传给上游（Seedance 会拒绝）。如需以某帧为起点，请上传首帧参考图。
defineEmits(['refine', 'download', 'retry'])

/**
 * 视频列表：优先 message.videos，否则从 message.images 筛选 video/* 类型项
 *
 * 后者兼容刷新后从后端 message_images 表读出的数据：
 * listMessages 把所有媒体行（含 video/mp4）读入 images 数组，
 * 前端按 mimeType 前缀区分视频与图片。
 */
const videoList = computed(() => {
  const msg = props.message
  if (Array.isArray(msg.videos) && msg.videos.length) return msg.videos
  return (msg.images || []).filter((item) => item.mimeType?.startsWith('video/'))
})

/** 视频时长展示文案（秒） */
const durationLabel = computed(() => {
  const d = props.message.duration ?? props.message.meta?.duration
  return d ? `${d}秒` : ''
})

/** 视频清晰度展示文案（480p/720p/1080p/4k） */
const resolutionLabel = computed(() => {
  return props.message.resolution || props.message.meta?.resolution || ''
})

/**
 * 参考模式展示文案（首帧 / 首尾帧 / 多图参考）
 * 多图参考附带张数（取参考图数量），让用户一眼看出本次生成的引用方式
 */
const refModeLabel = computed(() => {
  const mode = props.message.videoRefMode || props.message.meta?.videoRefMode
  if (mode === 'first_last') return '首尾帧'
  if (mode === 'reference') {
    const count = props.message.meta?.refImageCount || 0
    return count ? `多图参考 ${count} 张` : '多图参考'
  }
  if (mode === 'first_frame') return '首帧'
  return ''
})
</script>

<template>
  <div class="message-row is-assistant" data-role="message-row">
    <div class="video-message-card" data-role="message-body">
      <div class="card-header">
        <span class="role-tag">AI</span>
        <span class="role-title">视频结果</span>
        <span class="meta-sep">·</span>
        <span class="meta-item">{{ message.model }}</span>
        <template v-if="message.meta?.providerName">
          <span class="meta-sep">·</span>
          <span class="meta-item" data-role="provider-name">{{ message.meta.providerName }}</span>
        </template>
        <template v-if="message.ratio || message.meta?.ratio">
          <span class="meta-sep">·</span>
          <span class="meta-item">{{ message.ratio || message.meta?.ratio }}</span>
        </template>
        <template v-if="durationLabel">
          <span class="meta-sep">·</span>
          <span class="meta-item">{{ durationLabel }}</span>
        </template>
        <template v-if="resolutionLabel">
          <span class="meta-sep">·</span>
          <span class="meta-item">{{ resolutionLabel }}</span>
        </template>
        <template v-if="refModeLabel">
          <span class="meta-sep">·</span>
          <span class="meta-item" data-role="ref-mode">{{ refModeLabel }}</span>
        </template>
      </div>

      <div class="video-grid">
        <div
          v-for="video in videoList"
          :key="video.id || video.url"
          data-role="video-frame"
          class="video-frame"
        >
          <video
            :src="video.url"
            controls
            preload="metadata"
            class="video-item"
          ></video>
        </div>
      </div>

      <div class="action-row">
        <button type="button" @click="$emit('refine', message)">继续细化</button>
        <button type="button" @click="$emit('retry', message)">再次生成</button>
        <button type="button" @click="$emit('download', message)">下载视频</button>
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

.video-message-card {
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
  background: rgba(255, 107, 53, 0.16);
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

.video-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.video-frame {
  width: 100%;
  justify-self: start;
  align-self: start;
}

.video-item {
  width: 100%;
  max-width: 720px;
  max-height: 480px;
  border-radius: 16px;
  background: #000;
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
  .video-message-card {
    padding: 14px;
  }
}
</style>
