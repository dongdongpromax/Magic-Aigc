<script setup>
import { reactive, ref } from 'vue'
import { NButton, NInput } from 'naive-ui'
import { useProvidersStore } from '@/store/providers'

/** 新建自定义中转站表单（创建后自动选中进入详情） */
const emit = defineEmits(['created', 'cancel'])
const providersStore = useProvidersStore()

const form = reactive({ name: '', baseUrl: '' })
const saving = ref(false)
const error = ref('')

/** 提交创建：校验非空 → 调 store.addProvider → 通知父级切回详情视图 */
async function handleSubmit() {
  if (!form.name.trim() || !form.baseUrl.trim()) {
    error.value = '名称和 API 地址不能为空'
    return
  }
  saving.value = true
  error.value = ''
  try {
    await providersStore.addProvider({ name: form.name.trim(), baseUrl: form.baseUrl.trim() })
    emit('created')
  } catch (err) {
    error.value = err?.response?.data?.message || '创建失败，请稍后重试'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="create-provider" data-role="create-provider">
    <h3 class="panel-title">添加中转站</h3>
    <div class="field">
      <label>名称</label>
      <n-input v-model:value="form.name" placeholder="如：我的中转站" data-role="create-name" />
    </div>
    <div class="field">
      <label>API 地址</label>
      <n-input
        v-model:value="form.baseUrl"
        placeholder="https://your-gateway.example.com/v1"
        data-role="create-baseurl"
      />
    </div>
    <p v-if="error" class="form-error" data-role="create-error">{{ error }}</p>
    <div class="form-actions">
      <n-button size="small" @click="emit('cancel')">取消</n-button>
      <n-button
        size="small"
        type="primary"
        :loading="saving"
        data-action="submit-create"
        @click="handleSubmit"
        >创建</n-button
      >
    </div>
  </div>
</template>

<style lang="scss" scoped>
.create-provider {
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

.form-error {
  margin: 0;
  font-size: 12px;
  color: rgba(248, 113, 113, 0.92);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
