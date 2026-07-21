import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  addProviderModel,
  checkProvider,
  createProvider,
  deleteProvider,
  deleteProviderModel,
  fetchProviderModels,
  listProviderModels,
  listProviders,
  setProviderEnabled,
  setProviderModelEnabled,
  updateProvider,
} from '@/services/providersApi'

/**
 * 中转站 store
 *
 * 状态：providers（列表，含每家 enabledModels 简表）、selectedProviderId、
 * modelsByProvider（设置页选中家的全量模型，按 providerId 缓存）。
 * 聊天输入框的分组选择器直接用 providers[].enabledModels，无需额外请求。
 */
export const useProvidersStore = defineStore('providers', () => {
  const providers = ref([])
  const selectedProviderId = ref('')
  /** @type {import('vue').Ref<Record<string, Array<object>>>} 各家全量模型缓存 */
  const modelsByProvider = ref({})
  const loadingProviders = ref(false)
  const loadingModels = ref(false)
  const checking = ref(false)
  const fetching = ref(false)
  /** @type {import('vue').Ref<object|null>} 最近一次 Key 检测报告 */
  const checkResult = ref(null)

  const enabledProviders = computed(() => providers.value.filter((p) => p.enabled))

  /** 是否存在「启用且有 Key」的可用中转站（chat store 的 hasConfig 读它） */
  const hasUsableProvider = computed(() =>
    enabledProviders.value.some((p) => p.apiKeys?.length > 0),
  )

  const selectedProvider = computed(
    () => providers.value.find((p) => p.id === selectedProviderId.value) || null,
  )

  /** 当前选中家的全量模型（设置页用） */
  const currentModels = computed(() => modelsByProvider.value[selectedProviderId.value] || [])

  /**
   * 加载中转站列表（含 enabledModels 简表）
   * @param {boolean} force 强制刷新
   */
  async function loadProviders(force = false) {
    if (providers.value.length && !force) return
    loadingProviders.value = true
    try {
      providers.value = await listProviders()
      if (!providers.value.find((p) => p.id === selectedProviderId.value)) {
        selectedProviderId.value = providers.value[0]?.id || ''
      }
    } finally {
      loadingProviders.value = false
    }
  }

  /**
   * 选中一家并加载其全量模型（有缓存则不重复请求）
   * @param {string} id
   * @param {boolean} force 强制刷新模型
   */
  async function selectProvider(id, force = false) {
    selectedProviderId.value = id
    checkResult.value = null
    if (!id) return
    if (!force && modelsByProvider.value[id]) return
    loadingModels.value = true
    try {
      modelsByProvider.value[id] = await listProviderModels(id)
    } finally {
      loadingModels.value = false
    }
  }

  /** 新建自定义中转站并选中 */
  async function addProvider(payload) {
    const created = await createProvider(payload)
    providers.value.push(created)
    await selectProvider(created.id, true)
    return created
  }

  /** 即时保存名称/地址/Key 数组/请求模式 */
  async function saveProvider(id, patch) {
    const updated = await updateProvider(id, patch)
    const index = providers.value.findIndex((p) => p.id === id)
    if (index >= 0) providers.value[index] = { ...providers.value[index], ...updated }
    return updated
  }

  /** 整家开关 */
  async function toggleProvider(id, enabled) {
    await setProviderEnabled(id, enabled)
    const provider = providers.value.find((p) => p.id === id)
    if (provider) provider.enabled = enabled
  }

  /** 删除中转站（连带其模型缓存），重置选中项 */
  async function removeProvider(id) {
    await deleteProvider(id)
    providers.value = providers.value.filter((p) => p.id !== id)
    delete modelsByProvider.value[id]
    if (selectedProviderId.value === id) {
      selectedProviderId.value = providers.value[0]?.id || ''
    }
    // 列表变化会影响聊天选择器，整体强制刷新一次拿最新 enabledModels
    await loadProviders(true)
  }

  /** 检测当前选中家的 Key */
  async function check(id) {
    checking.value = true
    checkResult.value = null
    try {
      checkResult.value = await checkProvider(id)
      return checkResult.value
    } finally {
      checking.value = false
    }
  }

  /** 代理拉取上游模型并合并，刷新缓存与列表统计 */
  async function fetchModels(id) {
    fetching.value = true
    try {
      const result = await fetchProviderModels(id)
      modelsByProvider.value[id] = await listProviderModels(id)
      await loadProviders(true) // enabledModels 简表已变，刷新
      return result
    } finally {
      fetching.value = false
    }
  }

  /** 手动添加模型 */
  async function addModel(id, payload) {
    await addProviderModel(id, payload)
    modelsByProvider.value[id] = await listProviderModels(id)
    await loadProviders(true)
  }

  /** 单模型开关（乐观更新缓存） */
  async function toggleModel(id, modelId, enabled) {
    await setProviderModelEnabled(id, modelId, enabled)
    const models = modelsByProvider.value[id] || []
    const model = models.find((m) => m.modelId === modelId)
    if (model) model.enabled = enabled
    // enabledModels 简表变化，刷新列表（不阻塞 UI）
    loadProviders(true)
  }

  /** 移除模型 */
  async function removeModel(id, modelId) {
    await deleteProviderModel(id, modelId)
    modelsByProvider.value[id] = (modelsByProvider.value[id] || []).filter(
      (m) => m.modelId !== modelId,
    )
    loadProviders(true)
  }

  return {
    providers,
    selectedProviderId,
    modelsByProvider,
    loadingProviders,
    loadingModels,
    checking,
    fetching,
    checkResult,
    enabledProviders,
    hasUsableProvider,
    selectedProvider,
    currentModels,
    loadProviders,
    selectProvider,
    addProvider,
    saveProvider,
    toggleProvider,
    removeProvider,
    check,
    fetchModels,
    addModel,
    toggleModel,
    removeModel,
  }
})
