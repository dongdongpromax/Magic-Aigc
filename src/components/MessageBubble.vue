<script setup>
import { computed } from 'vue'

const props = defineProps({
  message: {
    type: Object,
    required: true,
  },
})

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
