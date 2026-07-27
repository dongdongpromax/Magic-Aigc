<script setup>
import { computed } from 'vue'
import { useCopyFeedback } from '@/composables/useCopyFeedback'

const props = defineProps({
  message: {
    type: Object,
    required: true,
  },
})

// 用户消息操作：重试交由父组件（ChatArea）编排还原草稿+runGeneration；
// 复制在本组件内部完成（仅写剪贴板，无需父组件介入）
defineEmits(['retry'])

const { copied, copy } = useCopyFeedback()

const content = computed(() => {
  if (props.message.type === 'user_prompt') return props.message.prompt
  if (props.message.type === 'assistant_text') return props.message.content
  if (props.message.type === 'system_status') return '正在生成图像...'
  return props.message.content || ''
})

const rowClass = computed(() => {
  if (props.message.role === 'user') return 'is-user'
  if (props.message.role === 'system' || props.message.type === 'system_status') return 'is-system'
  return 'is-assistant'
})

const badgeLabel = computed(() => {
  if (props.message.role === 'user') return '你'
  if (props.message.role === 'system' || props.message.type === 'system_status') return '状态'
  return 'AI'
})

const titleLabel = computed(() => {
  if (props.message.role === 'user') return '你的指令'
  if (props.message.role === 'system' || props.message.type === 'system_status') return '生成状态'
  return '图像助手'
})

/** 是否为用户消息（仅用户消息显示复制 + 重试操作栏） */
const isUserMessage = computed(() => props.message.type === 'user_prompt')

/**
 * 用户消息附带的参考图（在气泡中展示「本次发送带了哪些参考图」）
 *
 * 解决痛点：此前用户消息气泡只显示 prompt 文本，加了参考图后视觉上无任何反馈，
 * 让人误以为参考图没随请求一起发给模型。
 *
 * 数据来源优先级：
 * 1. message.meta.referenceImages —— 后端落库后 reload 读出（listMessages 解析 meta_json），
 *    draft_reference_images 已在生成完成时被清空，故 reload 后只能靠 meta 还原。
 * 2. message.draftSnapshot.referenceImages —— 本地刚发送、尚未 reload 时的草稿快照。
 *
 * 归一化为 { url, mimeType, name } 三字段，供模板统一渲染。
 */
const referenceImages = computed(() => {
  const msg = props.message
  const source =
    (Array.isArray(msg.meta?.referenceImages) && msg.meta.referenceImages.length
      ? msg.meta.referenceImages
      : null) ||
    (Array.isArray(msg.draftSnapshot?.referenceImages) && msg.draftSnapshot.referenceImages.length
      ? msg.draftSnapshot.referenceImages
      : null) ||
    []

  return source.map((r) => ({
    url: r.url || r.filePath || '',
    mimeType: r.mimeType || r.type || 'image/png',
    name: r.name || '',
  }))
})

/**
 * 视频参考模式（用于派生首帧/尾帧/参考图角色标签）
 *
 * 仅视频消息有值：本地取 draftSnapshot.videoRefMode，reload 后取 meta.videoRefMode。
 * 图像消息无此字段，refSlotLabel 返回空串（不显示角色标签）。
 */
const videoRefMode = computed(
  () => props.message.meta?.videoRefMode || props.message.draftSnapshot?.videoRefMode || '',
)

/**
 * 按视频参考模式 + 下标派生参考图角色标签
 * 与 InputConsole.refSlotLabel / videoPayload.deriveRole 对齐：
 * - first_last：第 1 张「首帧」、第 2 张「尾帧」
 * - reference：全部「参考图」
 * - first_frame：第 1 张「首帧」
 * - 空（图像消息）：不显示标签
 * @param {number} index 参考图下标
 * @returns {string}
 */
function refSlotLabel(index) {
  if (videoRefMode.value === 'first_last') return index === 0 ? '首帧' : '尾帧'
  if (videoRefMode.value === 'reference') return '参考图'
  if (videoRefMode.value === 'first_frame') return '首帧'
  return ''
}
</script>

<template>
  <div class="message-row" :class="[rowClass, message.type]" data-role="message-row">
    <!-- 改动3: 系统状态居中胶囊 + spinner 动画 -->
    <div v-if="rowClass === 'is-system'" class="status-pill" data-role="message-body">
      <span class="spinner"></span>
      <span>{{ content }}</span>
    </div>

    <!-- 改动3: 用户/AI 消息改为现代卡片式（去掉左侧 avatar 徽章栏） -->
    <div v-else class="message-card" data-role="message-body">
      <div class="card-header">
        <span class="role-tag">{{ badgeLabel }}</span>
        <span class="role-title">{{ titleLabel }}</span>
      </div>
      <div class="card-content">{{ content }}</div>

      <!-- 用户消息参考图：展示本次发送附带的参考图，避免误以为没发出 -->
      <div
        v-if="isUserMessage && referenceImages.length"
        class="reference-row"
        data-role="reference-row"
      >
        <div
          v-for="(img, index) in referenceImages"
          :key="img.url + index"
          class="reference-thumb"
          :data-role="`reference-thumb-${index}`"
        >
          <img :src="img.url" :alt="img.name || '参考图'" loading="lazy" />
          <span v-if="refSlotLabel(index)" class="ref-role-tag">{{ refSlotLabel(index) }}</span>
        </div>
      </div>

      <!-- 用户消息操作栏：复制 prompt + 重试（直接重新发送） -->
      <div v-if="isUserMessage" class="action-row" data-role="user-action-row">
        <button type="button" data-action="copy" @click="copy(message.prompt)">
          {{ copied ? '已复制' : '复制' }}
        </button>
        <button type="button" data-action="retry" @click="$emit('retry', message)">重试</button>
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

/* 改动3: 系统状态居中胶囊 + 旋转 spinner */
.message-row.is-system {
  justify-content: center;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.72);
  font-size: 13px;
}

.spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.18);
  border-top-color: rgba(119, 168, 255, 0.9);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 改动3: 用户/AI 消息卡片 */
.message-card {
  max-width: min(720px, 100%);
  padding: 14px 16px;
  border-radius: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.role-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
}

.role-title {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.card-content {
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  line-height: 1.75;
  white-space: pre-wrap;
}

/* 用户消息参考图缩略图行：紧凑横排，确认参考图已随请求发出 */
.reference-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}

.reference-thumb {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 3px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.25);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

/* 视频「首帧/尾帧/参考图」角色标签：左下角小角标 */
.ref-role-tag {
  position: absolute;
  left: 0;
  bottom: 0;
  padding: 1px 4px;
  font-size: 10px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.95);
  background: rgba(0, 0, 0, 0.62);
  border-top-right-radius: 3px;
}


/* 用户消息操作栏：复制 + 重试，靠右对齐匹配用户卡片方向 */
.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;

  button {
    padding: 5px 12px;
    border-radius: 3px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.82);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
    }
  }
}

/* 改动3: 用户消息靠右蓝色调卡片 */
.message-row.is-user {
  justify-content: flex-end;

  .message-card {
    max-width: min(640px, 100%);
    border-radius: 18px 18px 4px 18px;
    background:
      linear-gradient(180deg, rgba(119, 168, 255, 0.16) 0%, rgba(78, 126, 240, 0.1) 100%);
    border: 1px solid rgba(119, 168, 255, 0.24);

    .role-tag {
      background: rgba(119, 168, 255, 0.24);
    }
  }
}

/* 改动3: AI 消息靠左浅底卡片 */
.message-row.is-assistant {
  justify-content: flex-start;

  .message-card {
    border-radius: 4px 18px 18px 18px;
    background: rgba(255, 255, 255, 0.045);
    border: 1px solid rgba(255, 255, 255, 0.08);

    .role-tag {
      background: rgba(42, 255, 204, 0.16);
    }
  }
}

@media (max-width: 640px) {
  .message-card {
    max-width: 100%;
  }
}
</style>
