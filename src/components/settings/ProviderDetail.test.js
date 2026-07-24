import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import ProviderDetail from './ProviderDetail.vue'
import { useProvidersStore } from '@/store/providers'
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
  apiKeys: ['sk-first', 'sk-second'],
  enabled: true,
  color: '#6366f1',
  enabledModels: [],
}

/** 挂载并选中 openrouter，返回 wrapper 与 store */
async function mountDetail() {
  const pinia = createPinia()
  const wrapper = mount(ProviderDetail, {
    attachTo: document.body,
    global: { plugins: [pinia] },
  })
  const store = useProvidersStore()
  await store.loadProviders(true)
  await store.selectProvider('openrouter')
  await flushPromises()
  return { wrapper, store }
}

describe('ProviderDetail', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    api.listProviders.mockResolvedValue([openrouter])
    api.listProviderModels.mockResolvedValue([
      { modelId: 'openai/gpt-image-2', displayName: 'GPT Image 2', enabled: true, isImage: true, modelType: 'image', groupName: 'openai' },
      { modelId: 'openai/gpt-4o', displayName: 'GPT-4o', enabled: false, isImage: false, modelType: 'text', groupName: 'openai' },
      { modelId: 'flux/dev', displayName: 'Flux Dev', enabled: true, isImage: true, modelType: 'image', groupName: 'flux' },
    ])
    document.body.innerHTML = ''
  })

  it('渲染名称、地址、Key（每行一把）与整家开关', async () => {
    mount(ProviderDetail, {
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    })
    // 无选中时的空态
    expect(document.body.querySelector('[data-role="detail-empty"]')).not.toBeNull()

    const { wrapper } = await mountDetail()
    expect(wrapper.find('[data-role="provider-name"] input').element.value).toBe('OpenRouter')
    expect(wrapper.find('[data-role="base-url"] input').element.value).toBe(
      'https://openrouter.ai/api/v1',
    )
    expect(wrapper.find('[data-role="api-keys"] textarea').element.value).toBe(
      'sk-first\nsk-second',
    )
    // 地址预览
    expect(wrapper.text()).toContain('https://openrouter.ai/api/v1/images')
  })

  it('Key 编辑失焦后按行拆分即时保存', async () => {
    api.updateProvider.mockImplementation(async (id, patch) => ({ ...openrouter, ...patch }))
    const { wrapper } = await mountDetail()

    const textarea = wrapper.find('[data-role="api-keys"] textarea')
    await textarea.setValue('sk-a\n\nsk-b\n')
    await textarea.trigger('blur')
    await flushPromises()

    expect(api.updateProvider).toHaveBeenCalledWith('openrouter', {
      apiKeys: ['sk-a', 'sk-b'],
    })
  })

  it('baseUrl 失焦即时保存', async () => {
    api.updateProvider.mockImplementation(async (id, patch) => ({ ...openrouter, ...patch }))
    const { wrapper } = await mountDetail()

    const input = wrapper.find('[data-role="base-url"] input')
    await input.setValue('https://new-gateway.example.com/v1')
    await input.trigger('blur')
    await flushPromises()

    expect(api.updateProvider).toHaveBeenCalledWith('openrouter', {
      baseUrl: 'https://new-gateway.example.com/v1',
    })
  })

  it('检测按钮展示可用数与延迟', async () => {
    api.checkProvider.mockResolvedValue({
      total: 2,
      available: 1,
      results: [
        { tail: '1234', ok: true, latencyMs: 120 },
        { tail: '5678', ok: false, status: 401, latencyMs: 80 },
      ],
    })
    const { wrapper } = await mountDetail()

    await wrapper.find('[data-action="check-keys"]').trigger('click')
    await flushPromises()

    expect(api.checkProvider).toHaveBeenCalledWith('openrouter')
    expect(wrapper.find('[data-role="check-result"]').text()).toContain('1/2 可用')
    expect(wrapper.find('[data-role="check-result"]').text()).toContain('120ms')
    expect(wrapper.find('[data-role="check-result"]').text()).toContain('5678')
  })

  it('模型按组渲染，所有模型带类型标签，开关即时生效', async () => {
    api.setProviderModelEnabled.mockResolvedValue({})
    const { wrapper } = await mountDetail()

    // 两个分组
    expect(wrapper.findAll('[data-role="model-group"]')).toHaveLength(2)
    // 三行模型
    const rows = wrapper.findAll('[data-role="model-row"]')
    expect(rows).toHaveLength(3)
    // 所有模型都带类型 tag（不只标图像和视频）
    expect(rows[0].find('[data-role="model-type-tag"]').exists()).toBe(true)
    expect(rows[1].find('[data-role="model-type-tag"]').exists()).toBe(true)
    expect(rows[2].find('[data-role="model-type-tag"]').exists()).toBe(true)
    // 图像模型标签为「图像」，文本模型标签为「文本」
    expect(rows[0].find('[data-role="model-type-tag"]').text()).toBe('图像')
    expect(rows[1].find('[data-role="model-type-tag"]').text()).toBe('文本')

    // 开关第二行（gpt-4o 启用）
    await rows[1].find('[data-action="toggle-model"]').trigger('click')
    await flushPromises()
    expect(api.setProviderModelEnabled).toHaveBeenCalledWith('openrouter', 'openai/gpt-4o', true)
  })

  it('模型搜索过滤', async () => {
    const { wrapper } = await mountDetail()

    const search = wrapper.find('[data-role="model-search"] input')
    await search.setValue('flux')
    await flushPromises()

    const rows = wrapper.findAll('[data-role="model-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('flux/dev')
  })

  it('获取模型列表按钮触发 fetch 并展示统计 toast', async () => {
    api.fetchProviderModels.mockResolvedValue({
      added: 2,
      updated: 1,
      total: 3,
      staleModelIds: [],
    })
    const { wrapper } = await mountDetail()

    await wrapper.find('[data-action="fetch-models"]').trigger('click')
    await flushPromises()

    expect(api.fetchProviderModels).toHaveBeenCalledWith('openrouter')
    expect(wrapper.find('[data-role="fetch-result"]').text()).toContain('新增 2 个模型')
    // 新拉取的模型全部默认关闭，提示用户需手动启用
    expect(wrapper.find('[data-role="fetch-result"]').text()).toContain('需手动启用')
  })

  it('手动添加模型', async () => {
    api.addProviderModel.mockResolvedValue({ modelId: 'flux/pro', enabled: true })
    const { wrapper } = await mountDetail()

    const input = wrapper.find('[data-role="add-model-input"] input')
    await input.setValue('flux/pro')
    await wrapper.find('[data-action="add-model"]').trigger('click')
    await flushPromises()

    expect(api.addProviderModel).toHaveBeenCalledWith('openrouter', { modelId: 'flux/pro' })
  })

  it('删除模型', async () => {
    api.deleteProviderModel.mockResolvedValue({})
    const { wrapper } = await mountDetail()

    await wrapper.findAll('[data-action="remove-model"]')[0].trigger('click')
    await flushPromises()

    expect(api.deleteProviderModel).toHaveBeenCalledWith('openrouter', 'openai/gpt-image-2')
  })

  it('删除中转站：二次确认后调删除 API', async () => {
    api.deleteProvider.mockResolvedValue({})
    api.listProviderModels.mockResolvedValue([])
    const confirmSpy = vi.fn().mockReturnValue(true)
    vi.stubGlobal('confirm', confirmSpy)
    const { wrapper } = await mountDetail()

    await wrapper.find('[data-action="remove-provider"]').trigger('click')
    await flushPromises()

    expect(confirmSpy).toHaveBeenCalled()
    expect(api.deleteProvider).toHaveBeenCalledWith('openrouter')
    vi.unstubAllGlobals()
  })

  it('删除中转站：取消确认时不调 API', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false))
    const { wrapper } = await mountDetail()

    await wrapper.find('[data-action="remove-provider"]').trigger('click')
    await flushPromises()

    expect(api.deleteProvider).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
