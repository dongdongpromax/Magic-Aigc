import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProvidersStore } from './providers'
import * as api from '@/services/providersApi'

vi.mock('@/services/providersApi', () => ({
  listProviders: vi.fn(),
  createProvider: vi.fn(),
  updateProvider: vi.fn(),
  setProviderEnabled: vi.fn(),
  deleteProvider: vi.fn(),
  checkProvider: vi.fn(),
  listProviderModels: vi.fn(),
  fetchProviderModels: vi.fn(),
  addProviderModel: vi.fn(),
  setProviderModelEnabled: vi.fn(),
  deleteProviderModel: vi.fn(),
}))

const openrouter = {
  id: 'openrouter',
  name: 'OpenRouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKeys: ['sk-a'],
  enabled: true,
  color: '#6366f1',
  isBuiltin: true,
  modelCount: 1,
  enabledModelCount: 1,
  enabledModels: [{ modelId: 'openai/gpt-image-2', displayName: 'GPT Image 2' }],
}
const siliconflow = {
  id: 'siliconflow',
  name: '硅基流动',
  baseUrl: 'https://api.siliconflow.cn/v1',
  apiKeys: [],
  enabled: false,
  color: '#7c3aed',
  isBuiltin: true,
  modelCount: 0,
  enabledModelCount: 0,
  enabledModels: [],
}

describe('providers store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    api.listProviders.mockResolvedValue([openrouter, siliconflow])
  })

  it('loadProviders 加载列表并默认选中第一家', async () => {
    const store = useProvidersStore()

    await store.loadProviders()

    expect(store.providers).toHaveLength(2)
    expect(store.selectedProviderId).toBe('openrouter')
  })

  it('enabledProviders 仅含启用中的；hasUsableProvider 要求启用且有 Key', async () => {
    const store = useProvidersStore()
    await store.loadProviders()

    expect(store.enabledProviders.map((p) => p.id)).toEqual(['openrouter'])
    expect(store.hasUsableProvider).toBe(true)

    store.providers[0].apiKeys = []
    expect(store.hasUsableProvider).toBe(false)
  })

  it('toggleProvider 调 API 并同步本地状态', async () => {
    api.setProviderEnabled.mockResolvedValue({})
    const store = useProvidersStore()
    await store.loadProviders()

    await store.toggleProvider('siliconflow', true)

    expect(api.setProviderEnabled).toHaveBeenCalledWith('siliconflow', true)
    expect(store.providers[1].enabled).toBe(true)
  })

  it('selectProvider 加载该家模型列表（缓存，不重复请求）', async () => {
    api.listProviderModels.mockResolvedValue([
      { modelId: 'openai/gpt-image-2', enabled: true, isImage: true, groupName: 'openai' },
    ])
    const store = useProvidersStore()
    await store.loadProviders()

    await store.selectProvider('openrouter')
    await store.selectProvider('openrouter')

    expect(api.listProviderModels).toHaveBeenCalledTimes(1)
    expect(store.currentModels).toHaveLength(1)
  })

  it('saveProvider 即时保存名称/地址/Key 数组', async () => {
    api.updateProvider.mockImplementation(async (id, patch) => ({ ...openrouter, ...patch }))
    const store = useProvidersStore()
    await store.loadProviders()

    await store.saveProvider('openrouter', { apiKeys: ['sk-a', 'sk-b'], baseUrl: 'https://new/v1' })

    expect(api.updateProvider).toHaveBeenCalledWith('openrouter', {
      apiKeys: ['sk-a', 'sk-b'],
      baseUrl: 'https://new/v1',
    })
    expect(store.providers[0].baseUrl).toBe('https://new/v1')
  })

  it('fetchModels 拉取合并后刷新模型列表并返回统计', async () => {
    api.listProviderModels.mockResolvedValue([])
    api.fetchProviderModels.mockResolvedValue({
      added: 2,
      updated: 0,
      total: 2,
      autoEnabled: 1,
      staleModelIds: [],
    })
    const store = useProvidersStore()
    await store.loadProviders()
    await store.selectProvider('openrouter')
    api.listProviderModels.mockResolvedValue([
      { modelId: 'openai/gpt-image-2', enabled: true, isImage: true, groupName: 'openai' },
    ])

    const result = await store.fetchModels('openrouter')

    expect(api.fetchProviderModels).toHaveBeenCalledWith('openrouter')
    expect(result.autoEnabled).toBe(1)
    expect(store.currentModels).toHaveLength(1)
  })

  it('toggleModel 乐观更新开关', async () => {
    api.listProviderModels.mockResolvedValue([
      { modelId: 'openai/gpt-4o', enabled: false, isImage: false, groupName: 'openai' },
    ])
    api.setProviderModelEnabled.mockResolvedValue({})
    const store = useProvidersStore()
    await store.loadProviders()
    await store.selectProvider('openrouter')

    await store.toggleModel('openrouter', 'openai/gpt-4o', true)

    expect(api.setProviderModelEnabled).toHaveBeenCalledWith('openrouter', 'openai/gpt-4o', true)
    expect(store.currentModels[0].enabled).toBe(true)
  })

  it('removeProvider 删除后重置选中项', async () => {
    api.deleteProvider.mockResolvedValue({})
    api.listProviderModels.mockResolvedValue([])
    const store = useProvidersStore()
    await store.loadProviders()
    // 删除后列表接口只剩 siliconflow（removeProvider 内部会强制刷新列表）
    api.listProviders.mockResolvedValue([siliconflow])

    await store.removeProvider('openrouter')

    expect(api.deleteProvider).toHaveBeenCalledWith('openrouter')
    expect(store.providers.map((p) => p.id)).toEqual(['siliconflow'])
    expect(store.selectedProviderId).toBe('siliconflow')
  })
})
