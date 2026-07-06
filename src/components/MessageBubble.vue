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
    <div class="message-side" data-role="message-side">
      <div class="message-badge" data-role="message-badge">{{ badgeLabel }}</div>
      <div class="message-meta">
        <strong data-role="message-title">{{ titleLabel }}</strong>
      </div>
    </div>

    <div
      class="message-body"
      :class="{ 'compact-status': rowClass === 'is-system' }"
      data-role="message-body"
    >
      <div class="bubble-inner">{{ content }}</div>
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
    linear-gradient(180deg, rgba(83, 136, 255, 0.28) 0%, rgba(52, 80, 148, 0.22) 100%),
    rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(116, 164, 255, 0.28);
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
}

.message-body {
  flex: 1;
  min-width: 0;

  &.compact-status {
    max-width: 100%;
  }
}

.bubble-inner {
  max-width: min(860px, 100%);
  padding: 16px 18px;
  border-radius: 22px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.045) 0%, rgba(255, 255, 255, 0.02) 100%),
    rgba(10, 12, 18, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  line-height: 1.75;
  white-space: pre-wrap;
  box-shadow:
    0 18px 48px rgba(0, 0, 0, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.message-row.is-user {
  justify-content: flex-end;

  .message-side {
    order: 2;
    width: 92px;
    justify-items: end;
    text-align: right;
  }

  .message-body {
    display: flex;
    justify-content: flex-end;
  }

  .bubble-inner {
    max-width: min(700px, 100%);
    border-radius: 22px 22px 10px 22px;
    background:
      linear-gradient(180deg, rgba(78, 126, 240, 0.26) 0%, rgba(46, 76, 156, 0.18) 100%),
      rgba(14, 20, 34, 0.92);
    border-color: rgba(92, 146, 255, 0.24);
  }
}

.message-row.is-assistant {
  .bubble-inner {
    border-radius: 10px 22px 22px 22px;
  }

  .message-badge {
    background:
      linear-gradient(180deg, rgba(42, 255, 204, 0.18) 0%, rgba(22, 126, 125, 0.16) 100%),
      rgba(255, 255, 255, 0.04);
    border-color: rgba(42, 255, 204, 0.22);
  }
}

.message-row.is-system {
  align-items: center;

  .message-side {
    width: 92px;
  }

  .message-badge {
    width: 36px;
    height: 36px;
    border-radius: 12px;
    background:
      linear-gradient(180deg, rgba(255, 185, 76, 0.2) 0%, rgba(148, 92, 32, 0.14) 100%),
      rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 185, 76, 0.2);
  }

  .bubble-inner {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 10px 14px;
    border-radius: 999px;
    color: rgba(255, 255, 255, 0.72);
    font-size: 13px;
    background: rgba(255, 255, 255, 0.04);
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

  .bubble-inner {
    max-width: 100%;
    padding: 14px 16px;
  }
}
</style>
