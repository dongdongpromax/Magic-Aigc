<script setup>
import { onBeforeUnmount, onMounted } from 'vue'

/**
 * 画布浮动菜单（双击创建节点 / 右键上下文菜单共用）
 *
 * 以 fixed 定位显示在指针位置，点击菜单外任意处或按 Esc 关闭。
 * items: [{ key, label, danger? }]
 */
defineProps({
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  items: { type: Array, default: () => [] },
})

const emit = defineEmits(['select', 'close'])

const handleSelect = (key) => {
  emit('select', key)
  emit('close')
}

const handleKeydown = (event) => {
  if (event.key === 'Escape') {
    event.stopPropagation()
    emit('close')
  }
}

onMounted(() => window.addEventListener('keydown', handleKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown, true))
</script>

<template>
  <div class="menu-overlay" @pointerdown="emit('close')" @contextmenu.prevent="emit('close')">
    <div
      class="canvas-menu"
      :style="{ left: `${x}px`, top: `${y}px` }"
      data-testid="canvas-menu"
      @pointerdown.stop
    >
      <button
        v-for="item in items"
        :key="item.key"
        class="menu-item"
        :class="{ danger: item.danger }"
        type="button"
        @click="handleSelect(item.key)"
      >
        {{ item.label }}
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@import '@/styles/variables.scss';

.menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
}

.canvas-menu {
  position: fixed;
  min-width: 148px;
  padding: 6px;
  border-radius: 12px;
  background: rgba(15, 18, 24, 0.97);
  border: 1px solid $border-light;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(16px);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.menu-item {
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: $text-primary;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: rgba(119, 168, 255, 0.14);
  }

  &.danger {
    color: #ff8585;

    &:hover {
      background: rgba(255, 107, 107, 0.14);
    }
  }
}
</style>
