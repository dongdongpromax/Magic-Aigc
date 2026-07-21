<script setup>
import { NInputNumber, NSelect } from 'naive-ui'
import { useChatStore } from '@/store/chat'

/**
 * 通用设置：请求模式 / 超时 / 默认张数
 * 字段失焦即时保存（复用 chat store 的 saveSettings 链路）
 */
const chatStore = useChatStore()

const requestModeOptions = [
  { label: 'OpenRouter 图片模式', value: 'openrouter-image' },
  { label: '聊天封装模式', value: 'openai-chat' },
]

/** 失焦即时保存 */
async function handleBlur() {
  await chatStore.saveSettings()
}
</script>

<template>
  <div class="general-settings" data-role="general-settings">
    <h3 class="panel-title">通用设置</h3>
    <div class="field">
      <label>请求模式</label>
      <n-select
        v-model:value="chatStore.appConfig.requestMode"
        :options="requestModeOptions"
        @blur="handleBlur"
      />
    </div>
    <div class="field">
      <label>超时时间（毫秒）</label>
      <n-input-number
        v-model:value="chatStore.appConfig.timeout"
        :min="30000"
        :step="1000"
        @blur="handleBlur"
      />
    </div>
    <div class="field">
      <label>默认张数</label>
      <n-input-number
        v-model:value="chatStore.appConfig.defaultN"
        :min="1"
        :max="4"
        @blur="handleBlur"
      />
    </div>
    <p class="field-hint">修改失焦后自动保存</p>
  </div>
</template>

<style lang="scss" scoped>
.general-settings {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;

  label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.62);
  }
}

.field-hint {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}
</style>
