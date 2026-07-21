<script setup>
import { computed, reactive, watch } from 'vue'
import { NButton, NDrawer, NDrawerContent, NInput, NInputNumber, NSelect } from 'naive-ui'
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

/**
 * 改动1: 本地表单副本
 *
 * 编辑期间只改 form，不触碰 store.appConfig，避免触发任何副作用；
 * 点「保存」才把 form 写回 appConfig 并调 saveSettings 持久化到后端。
 */
const form = reactive({
  baseURL: '',
  defaultModel: '',
  requestMode: 'openrouter-image',
  timeout: 1200000,
  defaultN: 1,
  defaultSize: 'auto',
  defaultQuality: 'high',
})

// 抽屉打开时同步 store.appConfig 到本地表单，并重置保存状态
watch(
  () => props.show,
  (show) => {
    if (show) {
      Object.assign(form, store.appConfig)
      store.settingsSaveStatus = 'idle'
    }
  },
)

const statusText = computed(() => {
  switch (store.settingsSaveStatus) {
    case 'saving':
      return '保存中…'
    case 'saved':
      return '已保存'
    case 'error':
      return '保存失败'
    default:
      return ''
  }
})

const isSaving = computed(() => store.settingsSaveStatus === 'saving')

/**
 * 改动1: 点「保存」先把本地表单写回 appConfig，再调 store.saveSettings 持久化
 */
async function handleSave() {
  Object.assign(store.appConfig, form)
  await store.saveSettings()
}
</script>

<template>
  <n-drawer v-model:show="visible" :width="420" placement="right">
    <n-drawer-content title="连接设置" closable>
      <div class="notice">
        图像生成的 API 密钥由后端 <code>server/.env</code> 统一管理，此处仅配置服务地址与默认参数。
      </div>

      <div class="settings-form">
        <div class="field">
          <label>中转站地址</label>
          <n-input v-model:value="form.baseURL" placeholder="https://your-gateway.example.com/v1" />
        </div>
        <div class="field">
          <label>默认模型</label>
          <n-input v-model:value="form.defaultModel" placeholder="openai/gpt-image-2" />
        </div>
        <div class="field">
          <label>请求模式</label>
          <n-select v-model:value="form.requestMode" :options="requestModeOptions" />
        </div>
        <div class="field grid-two">
          <div>
            <label>超时时间</label>
            <n-input-number v-model:value="form.timeout" :min="30000" :step="1000" />
          </div>
          <div>
            <label>默认张数</label>
            <n-input-number v-model:value="form.defaultN" :min="1" :max="4" />
          </div>
        </div>
      </div>

      <template #footer>
        <div class="footer-bar">
          <span class="status" :class="store.settingsSaveStatus">{{ statusText }}</span>
          <n-button type="primary" :loading="isSaving" @click="handleSave">保存</n-button>
        </div>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>

<style lang="scss" scoped>
.notice {
  margin-bottom: 16px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(119, 168, 255, 0.08);
  border: 1px solid rgba(119, 168, 255, 0.18);
  color: rgba(255, 255, 255, 0.78);
  font-size: 12px;
  line-height: 1.6;

  code {
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.92);
    font-size: 11px;
  }
}

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

.footer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.status {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);

  &.saving {
    color: rgba(119, 168, 255, 0.9);
  }

  &.saved {
    color: rgba(16, 185, 129, 0.92);
  }

  &.error {
    color: rgba(248, 113, 113, 0.92);
  }
}
</style>
