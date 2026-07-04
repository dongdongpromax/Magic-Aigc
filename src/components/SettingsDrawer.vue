<script setup>
import { computed } from 'vue'
import { NDrawer, NDrawerContent, NInput, NInputNumber, NSelect } from 'naive-ui'
import { useChatStore } from '@/store/chat'

const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:show'])
const store = useChatStore()

const requestModeOptions = [
  { label: 'OpenRouter 图片模式', value: 'openrouter-image' },
  { label: '聊天封装模式', value: 'openai-chat' },
]

const visible = computed({
  get: () => props.show,
  set: (value) => emit('update:show', value),
})
</script>

<template>
  <n-drawer v-model:show="visible" :width="420" placement="right">
    <n-drawer-content title="连接设置" closable>
      <div class="settings-form">
        <div class="field">
          <label>中转站地址</label>
          <n-input v-model:value="store.appConfig.baseURL" placeholder="https://your-gateway.example.com/v1" />
        </div>
        <div class="field">
          <label>API Key</label>
          <n-input
            v-model:value="store.appConfig.apiKey"
            type="password"
            show-password-on="click"
            placeholder="输入中转站密钥"
          />
        </div>
        <div class="field">
          <label>默认模型</label>
          <n-input v-model:value="store.appConfig.defaultModel" placeholder="openai/gpt-image-2" />
        </div>
        <div class="field">
          <label>请求模式</label>
          <n-select v-model:value="store.appConfig.requestMode" :options="requestModeOptions" />
        </div>
        <div class="field grid-two">
          <div>
            <label>超时时间</label>
            <n-input-number v-model:value="store.appConfig.timeout" :min="30000" :step="1000" />
          </div>
          <div>
            <label>默认张数</label>
            <n-input-number v-model:value="store.appConfig.defaultN" :min="1" :max="4" />
          </div>
        </div>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<style lang="scss" scoped>
.settings-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
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

.grid-two {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
</style>
