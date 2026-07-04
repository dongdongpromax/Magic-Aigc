<script setup>
import { computed } from 'vue'

const props = defineProps({
  hasConfig: {
    type: Boolean,
    default: false,
  },
  hasError: {
    type: Boolean,
    default: false,
  },
})

const label = computed(() => {
  if (props.hasError) return '连接异常'
  if (props.hasConfig) return '已连接'
  return '未配置'
})
</script>

<template>
  <button class="connection-badge" type="button">
    <span class="dot" :class="{ danger: hasError, success: hasConfig && !hasError }"></span>
    <span>{{ label }}</span>
  </button>
</template>

<style lang="scss" scoped>
.connection-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  background: rgba(18, 18, 18, 0.72);
  color: rgba(255, 255, 255, 0.88);
  font-size: 12px;
  cursor: pointer;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 184, 77, 0.9);
  box-shadow: 0 0 10px rgba(255, 184, 77, 0.35);

  &.success {
    background: rgba(16, 185, 129, 0.92);
    box-shadow: 0 0 10px rgba(16, 185, 129, 0.35);
  }

  &.danger {
    background: rgba(248, 113, 113, 0.92);
    box-shadow: 0 0 10px rgba(248, 113, 113, 0.35);
  }
}
</style>
