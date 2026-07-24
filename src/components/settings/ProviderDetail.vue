<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { NButton, NInput, NSwitch } from 'naive-ui'
import { useProvidersStore } from '@/store/providers'

/**
 * 设置模态右栏：中转站详情
 *
 * 即时保存语义：名称/地址/Key 失焦即保存；开关类即点即存。
 * Key 用多行输入（每行一把，空行忽略），密码遮蔽可切换。
 */
const providersStore = useProvidersStore()

const provider = computed(() => providersStore.selectedProvider)

/** 本地编辑态（与 store 同步，失焦时写回） */
const form = reactive({ name: '', baseUrl: '', apiKeysText: '' })
const showKeys = ref(false)
const modelKeyword = ref('')
const newModelId = ref('')
const fetchResult = ref('')

// 切换选中家时同步本地表单，并清空一次性状态
watch(
  () => provider.value?.id,
  () => {
    syncForm()
    fetchResult.value = ''
    providersStore.checkResult = null
  },
  { immediate: true },
)

/** 把 store 的选中家数据同步进本地表单 */
function syncForm() {
  form.name = provider.value?.name || ''
  form.baseUrl = provider.value?.baseUrl || ''
  form.apiKeysText = (provider.value?.apiKeys || []).join('\n')
}

/** 失焦保存名称 */
async function saveName() {
  if (!provider.value || form.name.trim() === provider.value.name) return
  if (!form.name.trim()) return
  await providersStore.saveProvider(provider.value.id, { name: form.name.trim() })
}

/** 失焦保存地址 */
async function saveBaseUrl() {
  if (!provider.value || form.baseUrl.trim() === provider.value.baseUrl) return
  if (!form.baseUrl.trim()) return
  await providersStore.saveProvider(provider.value.id, { baseUrl: form.baseUrl.trim() })
}

/** 失焦保存 Key：按行拆分、去空行 */
async function saveApiKeys() {
  if (!provider.value) return
  const apiKeys = form.apiKeysText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (apiKeys.join('\n') === (provider.value.apiKeys || []).join('\n')) return
  await providersStore.saveProvider(provider.value.id, { apiKeys })
}

/** 检测全部 Key */
async function handleCheck() {
  if (!provider.value) return
  await providersStore.check(provider.value.id)
}

/** 拉取模型列表并展示统计 */
async function handleFetch() {
  if (!provider.value) return
  fetchResult.value = ''
  try {
    const result = await providersStore.fetchModels(provider.value.id)
    // 新拉取的模型全部默认关闭，需用户手动启用
    fetchResult.value =
      result.added > 0
        ? `新增 ${result.added} 个模型（需手动启用）`
        : `已同步 ${result.total} 个模型（无新增）`
  } catch (err) {
    fetchResult.value = `获取失败：${err?.response?.data?.message || err?.message || '网络错误'}`
  }
}

/** 手动添加模型 */
async function handleAddModel() {
  const modelId = newModelId.value.trim()
  if (!modelId || !provider.value) return
  await providersStore.addModel(provider.value.id, { modelId })
  newModelId.value = ''
}

/** 删除整家中转站：window.confirm 二次确认（自绘模态内嵌套 n-dialog 层级/测试都更复杂，从简） */
async function handleRemoveProvider() {
  if (!provider.value) return
  const ok = window.confirm(
    `确定删除「${provider.value.name}」吗？其模型配置将一并删除，引用它的草稿会回退到默认中转站。`,
  )
  if (!ok) return
  await providersStore.removeProvider(provider.value.id)
}

/** 按关键词过滤 + 按组归类的模型列表 */
const modelGroups = computed(() => {
  const key = modelKeyword.value.trim().toLowerCase()
  const groups = new Map()
  for (const model of providersStore.currentModels) {
    if (key && !model.modelId.toLowerCase().includes(key)) continue
    const group = model.groupName || '其他'
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push(model)
  }
  return [...groups.entries()].map(([name, models]) => ({ name, models }))
})

/** 检测报告的汇总文案 */
const checkSummary = computed(() => {
  const report = providersStore.checkResult
  if (!report) return ''
  return `${report.available}/${report.total} 可用`
})

/**
 * 模型类型 → tag 标签信息（文本 + CSS 类名）
 *
 * 所有模型都打 tag，不只标图像和视频：
 * - image  → 图像（紫）
 * - video  → 视频（橙）
 * - text   → 文本（蓝）
 * - embedding → 嵌入（绿）
 * - audio  → 语音（青）
 * - other  → 其他（灰）
 */
const MODEL_TYPE_TAGS = {
  image: { label: '图像', cls: 'tag-image' },
  video: { label: '视频', cls: 'tag-video' },
  text: { label: '文本', cls: 'tag-text' },
  embedding: { label: '嵌入', cls: 'tag-embedding' },
  audio: { label: '语音', cls: 'tag-audio' },
  other: { label: '其他', cls: 'tag-other' },
}

/**
 * 取模型类型 tag 信息
 * 优先用后端返回的 modelType，回退用 isImage/isVideo 推断（兼容旧数据）
 * @param {{ modelType?: string; isImage?: boolean; isVideo?: boolean }} model
 * @returns {{ label: string; cls: string }}
 */
function modelTag(model) {
  let type = model.modelType
  if (!type) {
    // 旧数据无 modelType 字段，用 isImage/isVideo 回退推断
    if (model.isVideo) type = 'video'
    else if (model.isImage) type = 'image'
    else type = 'other'
  }
  return MODEL_TYPE_TAGS[type] || MODEL_TYPE_TAGS.other
}
</script>

<template>
  <div v-if="!provider" class="detail-empty" data-role="detail-empty">
    <p>选择左侧中转站查看详情，或点击「+ 添加」创建新的中转站</p>
  </div>

  <div v-else class="provider-detail" data-role="provider-detail">
    <!-- 顶行：名称 + 整家开关 + 删除按钮 -->
    <div class="detail-header">
      <h3 class="detail-title" data-role="detail-title">
        <n-input
          v-model:value="form.name"
          size="small"
          class="name-input"
          data-role="provider-name"
          @blur="saveName"
        />
      </h3>
      <n-switch
        :value="provider.enabled"
        data-action="toggle-detail-provider"
        @update:value="providersStore.toggleProvider(provider.id, $event)"
      />
      <button
        type="button"
        class="remove-provider-btn"
        data-action="remove-provider"
        @click="handleRemoveProvider"
      >删除</button>
    </div>

    <!-- API 密钥 -->
    <div class="field">
      <div class="field-label-row">
        <label>API 密钥</label>
        <div class="field-actions">
          <button
            type="button"
            class="link-btn"
            data-action="toggle-keys-visibility"
            @click="showKeys = !showKeys"
          >{{ showKeys ? '隐藏' : '显示' }}</button>
          <n-button
            size="tiny"
            :loading="providersStore.checking"
            data-action="check-keys"
            @click="handleCheck"
          >检测</n-button>
        </div>
      </div>
      <!-- 始终用 textarea 承载多行 Key；隐藏时用 CSS 遮蔽（password input 是单行，会吞换行） -->
      <n-input
        v-model:value="form.apiKeysText"
        type="textarea"
        :autosize="{ minRows: 2, maxRows: 5 }"
        :class="{ 'keys-masked': !showKeys }"
        placeholder="每行一把密钥，多把轮询使用"
        data-role="api-keys"
        @blur="saveApiKeys"
      />
      <p class="field-hint">多个密钥换行分隔，请求时轮询使用</p>
      <div v-if="providersStore.checkResult" class="check-result" data-role="check-result">
        <span :class="{ ok: providersStore.checkResult.available > 0 }">{{ checkSummary }}</span>
        <span
          v-for="item in providersStore.checkResult.results"
          :key="item.tail"
          class="check-item"
          :class="{ ok: item.ok }"
        >
          …{{ item.tail }} · {{ item.ok ? `${item.latencyMs}ms` : `失败${item.status ? ` (${item.status})` : ''}` }}
        </span>
      </div>
    </div>

    <!-- API 地址 -->
    <div class="field">
      <label>API 地址</label>
      <n-input
        v-model:value="form.baseUrl"
        placeholder="https://your-gateway.example.com/v1"
        data-role="base-url"
        @blur="saveBaseUrl"
      />
      <p class="field-hint">预览：{{ form.baseUrl || '…' }}/images</p>
    </div>

    <!-- 模型区 -->
    <div class="models-section">
      <div class="models-header">
        <span class="models-title">模型 · {{ providersStore.currentModels.length }}</span>
        <n-input
          v-model:value="modelKeyword"
          size="small"
          placeholder="搜索模型"
          class="model-search"
          data-role="model-search"
        />
        <n-button
          size="small"
          :loading="providersStore.fetching"
          data-action="fetch-models"
          @click="handleFetch"
        >获取模型列表</n-button>
      </div>
      <p v-if="fetchResult" class="fetch-result" data-role="fetch-result">{{ fetchResult }}</p>

      <div class="add-model-row">
        <n-input
          v-model:value="newModelId"
          size="small"
          placeholder="手动添加模型 ID，如 flux/pro"
          data-role="add-model-input"
          @keydown.enter="handleAddModel"
        />
        <n-button size="small" data-action="add-model" @click="handleAddModel">+ 添加</n-button>
      </div>

      <div v-if="providersStore.loadingModels" class="models-empty">加载中…</div>
      <div v-else-if="!providersStore.currentModels.length" class="models-empty">
        暂无模型，点击「获取模型列表」或手动添加
      </div>

      <div v-for="group in modelGroups" :key="group.name" class="model-group" data-role="model-group">
        <div class="group-name">{{ group.name }}</div>
        <div
          v-for="model in group.models"
          :key="model.modelId"
          class="model-row"
          :class="{ 'is-off': !model.enabled }"
          data-role="model-row"
        >
          <span class="model-id" :title="model.modelId">{{ model.modelId }}</span>
          <span class="model-type-tag" :class="modelTag(model).cls" data-role="model-type-tag">{{ modelTag(model).label }}</span>
          <n-switch
            :value="model.enabled"
            size="small"
            data-action="toggle-model"
            @update:value="providersStore.toggleModel(provider.id, model.modelId, $event)"
          />
          <button
            type="button"
            class="remove-btn"
            data-action="remove-model"
            @click="providersStore.removeModel(provider.id, model.modelId)"
          >删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.detail-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.4);
  font-size: 13px;
}

.provider-detail {
  padding: 20px 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.detail-title {
  margin: 0;
  flex: 1;
  min-width: 0;
}

.name-input {
  max-width: 320px;
  font-size: 15px;
  font-weight: 600;
}

.remove-provider-btn {
  border: 1px solid rgba(248, 113, 113, 0.25);
  background: rgba(248, 113, 113, 0.08);
  color: rgba(248, 113, 113, 0.85);
  padding: 5px 12px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    background: rgba(248, 113, 113, 0.16);
    color: rgba(248, 113, 113, 1);
  }
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

.field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.field-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.link-btn {
  border: none;
  background: none;
  padding: 0;
  font-size: 12px;
  color: rgba(119, 168, 255, 0.85);
  cursor: pointer;
}

.field-hint {
  margin: 0;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.38);
}

/* Key 隐藏态：CSS 遮蔽字符（等效 password 的圆点），保留 textarea 多行能力 */
.keys-masked :deep(textarea) {
  -webkit-text-security: disc;
  text-security: disc;
}

.check-result {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);

  .ok {
    color: rgba(16, 185, 129, 0.95);
  }
}

.check-item {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(248, 113, 113, 0.12);

  &.ok {
    background: rgba(16, 185, 129, 0.12);
  }
}

.models-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  padding-top: 16px;
}

.models-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.models-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
}

.model-search {
  flex: 1;
  max-width: 220px;
  margin-left: auto;
}

.fetch-result {
  margin: 0;
  font-size: 12px;
  color: rgba(16, 185, 129, 0.9);
}

.add-model-row {
  display: flex;
  gap: 8px;
}

.models-empty {
  padding: 20px;
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}

.model-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.group-name {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.45);
  padding: 6px 4px 2px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.model-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 9px;

  &:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  &.is-off .model-id {
    opacity: 0.5;
  }
}

.model-id {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.85);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 模型类型 tag：所有模型都打标签，按类型分色 */
.model-type-tag {
  font-size: 10px;
  padding: 1px 7px;
  border-radius: 999px;
  flex-shrink: 0;
  font-weight: 500;
}

.tag-image {
  background: rgba(99, 102, 241, 0.18);
  color: rgba(165, 180, 252, 0.95);
}

.tag-video {
  background: rgba(255, 107, 53, 0.18);
  color: rgba(255, 159, 112, 0.95);
}

.tag-text {
  background: rgba(59, 130, 246, 0.18);
  color: rgba(147, 197, 253, 0.95);
}

.tag-embedding {
  background: rgba(16, 185, 129, 0.18);
  color: rgba(110, 231, 183, 0.95);
}

.tag-audio {
  background: rgba(6, 182, 212, 0.18);
  color: rgba(103, 232, 249, 0.95);
}

.tag-other {
  background: rgba(148, 163, 184, 0.18);
  color: rgba(203, 213, 225, 0.9);
}

.remove-btn {
  border: none;
  background: none;
  padding: 2px 6px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  border-radius: 6px;

  &:hover {
    color: rgba(248, 113, 113, 0.95);
    background: rgba(248, 113, 113, 0.1);
  }
}
</style>
