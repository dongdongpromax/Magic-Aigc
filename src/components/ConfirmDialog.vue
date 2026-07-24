<script setup>
import { nextTick, ref, watch } from 'vue'

/**
 * 通用二次确认弹窗
 *
 * 自绘 Teleport 模态，避免依赖 NDialogProvider；
 * 用于删除主题、提交确认等需要二次确认的场景，确保确认动作不会被浏览器静默吞掉。
 *
 * 交互：
 * - 点击「确定」或按 Enter（确认按钮聚焦时）→ emit confirm
 * - 点击「取消」、按 Esc、点击遮罩 → emit cancel
 * - 打开时自动聚焦「确定」按钮，便于键盘 Enter 直接确认
 */
const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: '确认操作' },
  content: { type: String, default: '' },
  confirmText: { type: String, default: '确定' },
  cancelText: { type: String, default: '取消' },
  danger: { type: Boolean, default: false },
})
const emit = defineEmits(['update:show', 'confirm', 'cancel'])

const confirmBtnRef = ref(null)

function close() {
  emit('update:show', false)
}
function handleConfirm() {
  emit('confirm')
  close()
}
function handleCancel() {
  emit('cancel')
  close()
}
function handleKeydown(event) {
  if (!props.show) return
  if (event.key === 'Escape') {
    event.preventDefault()
    handleCancel()
  }
}

// 打开时聚焦确认按钮（Enter 即可确认）；仅监听 Esc 做取消，避免与触发源的 Enter 冲突
watch(
  () => props.show,
  (show) => {
    if (show) nextTick(() => confirmBtnRef.value?.focus())
  },
)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="confirm-overlay"
      data-role="confirm-dialog"
      @click.self="handleCancel"
      @keydown="handleKeydown"
    >
      <div class="confirm-card" :class="{ 'is-danger': danger }" role="alertdialog" aria-modal="true">
        <h3 class="confirm-title">{{ title }}</h3>
        <p v-if="content" class="confirm-content">{{ content }}</p>
        <div class="confirm-actions">
          <button
            type="button"
            class="confirm-btn confirm-btn--cancel"
            data-action="confirm-cancel"
            @click="handleCancel"
          >
            {{ cancelText }}
          </button>
          <button
            ref="confirmBtnRef"
            type="button"
            class="confirm-btn confirm-btn--ok"
            :class="{ 'is-danger': danger }"
            data-action="confirm-confirm"
            @click="handleConfirm"
          >
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
@import '@/styles/variables.scss';

.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.confirm-card {
  width: min(360px, calc(100vw - 48px));
  background: rgba(22, 22, 24, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.confirm-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: $text-primary;
}

.confirm-content {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: $text-secondary;
  white-space: pre-wrap;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.confirm-btn {
  padding: 7px 16px;
  border-radius: 3px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: $text-secondary;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: $text-primary;
  }
}

.confirm-btn--ok {
  background: rgba(59, 130, 246, 0.16);
  border-color: rgba(59, 130, 246, 0.4);
  color: rgba(147, 197, 253, 0.95);

  &:hover {
    background: rgba(59, 130, 246, 0.26);
    color: #fff;
  }

  &.is-danger {
    background: rgba(255, 107, 107, 0.16);
    border-color: rgba(255, 107, 107, 0.4);
    color: rgba(255, 167, 167, 0.95);

    &:hover {
      background: rgba(255, 107, 107, 0.26);
      color: #fff;
    }
  }
}
</style>
