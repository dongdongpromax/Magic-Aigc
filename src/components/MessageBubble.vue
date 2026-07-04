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
</script>

<template>
  <div class="message-bubble" :class="[message.role, message.type]">
    <div class="bubble-inner">{{ content }}</div>
  </div>
</template>

<style lang="scss" scoped>
.message-bubble {
  display: flex;
  width: 100%;

  &.user {
    justify-content: flex-end;
  }

  &.assistant,
  &.system {
    justify-content: flex-start;
  }
}

.bubble-inner {
  max-width: min(720px, 80%);
  padding: 14px 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.message-bubble.user .bubble-inner {
  border-radius: 18px 18px 6px 18px;
}

.message-bubble.system_status .bubble-inner,
.message-bubble.system .bubble-inner {
  color: rgba(255, 255, 255, 0.68);
}
</style>
