import { onBeforeUnmount, ref } from 'vue'

/**
 * 复制反馈 composable
 *
 * 提供 `copied` 响应式状态与 `copy` 方法：复制成功后 copied 置 true，
 * 1.5 秒后自动复位，供按钮文案在「复制」/「已复制」间切换。
 *
 * 兼容性：navigator.clipboard 在非 HTTPS/非 localhost 环境可能不可用，
 * 此时回退到 document.execCommand('copy') 临时文本框方案。
 *
 * @param {number} resetMs 复制成功后 copied 复位延迟（毫秒），默认 1500
 * @returns {{ copied: import('vue').Ref<boolean>; copy: (text: string) => Promise<boolean> }}
 */
export function useCopyFeedback(resetMs = 1500) {
  const copied = ref(false)
  let resetTimer = null

  function clearTimer() {
    if (resetTimer) {
      clearTimeout(resetTimer)
      resetTimer = null
    }
  }

  /**
   * 复制文本到剪贴板
   * @param {string} text 待复制文本
   * @returns {Promise<boolean>} 是否复制成功
   */
  async function copy(text) {
    if (!text) return false

    // 优先用现代 Clipboard API（HTTPS 或 localhost 下可用）
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text)
        markCopied()
        return true
      } catch {
        // 权限被拒或环境不支持，走 execCommand 回退
      }
    }

    // 回退方案：临时 textarea + execCommand('copy')，兼容旧环境/HTTP
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(textarea)
      if (ok) markCopied()
      return ok
    } catch {
      return false
    }
  }

  /** 标记已复制并启动复位定时器 */
  function markCopied() {
    clearTimer()
    copied.value = true
    resetTimer = setTimeout(() => {
      copied.value = false
      resetTimer = null
    }, resetMs)
  }

  // 组件卸载时清理定时器，避免内存泄漏与卸载后改状态告警
  onBeforeUnmount(clearTimer)

  return { copied, copy }
}
