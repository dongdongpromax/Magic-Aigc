import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import SettingsModal from './SettingsModal.vue'
import ProviderList from './ProviderList.vue'
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

const providers = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeys: ['sk-a'],
    enabled: true,
    color: '#6366f1',
    enabledModels: [],
    modelCount: 0,
    enabledModelCount: 0,
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKeys: [],
    enabled: false,
    color: '#7c3aed',
    enabledModels: [],
    modelCount: 0,
    enabledModelCount: 0,
  },
]

function mountModal() {
  return mount(SettingsModal, {
    props: { show: true },
    attachTo: document.body,
    global: { plugins: [createPinia()] },
  })
}

describe('SettingsModal 骨架', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    api.listProviders.mockResolvedValue(providers)
    api.listProviderModels.mockResolvedValue([])
    document.body.innerHTML = ''
  })

  it('show=false 时不渲染模态', () => {
    mount(SettingsModal, {
      props: { show: false },
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    })
    expect(document.body.querySelector('[data-role="settings-modal"]')).toBeNull()
  })

  it('打开时加载中转站列表并渲染左栏', async () => {
    mountModal()
    await flushPromises()

    expect(api.listProviders).toHaveBeenCalled()
    const items = document.body.querySelectorAll('[data-role="provider-item"]')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain('OpenRouter')
    // 启用的显示 ON 徽标
    expect(items[0].querySelector('[data-role="on-badge"]')).not.toBeNull()
    expect(items[1].querySelector('[data-role="on-badge"]')).toBeNull()
  })

  it('搜索框按名称过滤列表', async () => {
    mountModal()
    await flushPromises()

    const search = document.body.querySelector('[data-role="provider-search"] input')
    search.value = '硅基'
    search.dispatchEvent(new Event('input'))
    await flushPromises()

    const items = document.body.querySelectorAll('[data-role="provider-item"]')
    expect(items).toHaveLength(1)
    expect(items[0].textContent).toContain('硅基流动')
  })

  it('点击列表项选中并加载该家模型', async () => {
    mountModal()
    await flushPromises()

    document.body.querySelectorAll('[data-role="provider-item"]')[1].click()
    await flushPromises()

    expect(api.listProviderModels).toHaveBeenCalledWith('siliconflow')
    // 选中后 Teleport 内节点重建，需重新查询再断言 is-active
    const items = document.body.querySelectorAll('[data-role="provider-item"]')
    expect(items[1].classList.contains('is-active')).toBe(true)
  })

  it('左栏开关切换整家启用状态', async () => {
    api.setProviderEnabled.mockResolvedValue({})
    mountModal()
    await flushPromises()

    const switchEl = document.body.querySelectorAll('[data-action="toggle-provider"]')[1]
    switchEl.click()
    await flushPromises()

    expect(api.setProviderEnabled).toHaveBeenCalledWith('siliconflow', true)
  })

  it('底部「通用」切换到通用设置视图', async () => {
    mountModal()
    await flushPromises()

    document.body.querySelector('[data-action="open-general"]').click()
    await flushPromises()

    expect(document.body.querySelector('[data-role="general-settings"]')).not.toBeNull()
  })

  it('底部「+ 添加」切换到新建视图，提交后创建并返回详情', async () => {
    api.createProvider.mockResolvedValue({
      id: 'custom-1',
      name: '我的站',
      baseUrl: 'https://x.example.com/v1',
      apiKeys: [],
      enabled: true,
      enabledModels: [],
    })
    mountModal()
    await flushPromises()

    document.body.querySelector('[data-action="add-provider"]').click()
    await flushPromises()
    expect(document.body.querySelector('[data-role="create-provider"]')).not.toBeNull()

    // 填名称和地址后提交
    const nameInput = document.body.querySelector('[data-role="create-name"] input')
    nameInput.value = '我的站'
    nameInput.dispatchEvent(new Event('input'))
    const urlInput = document.body.querySelector('[data-role="create-baseurl"] input')
    urlInput.value = 'https://x.example.com/v1'
    urlInput.dispatchEvent(new Event('input'))
    document.body.querySelector('[data-action="submit-create"]').click()
    await flushPromises()

    expect(api.createProvider).toHaveBeenCalledWith({
      name: '我的站',
      baseUrl: 'https://x.example.com/v1',
    })
  })

  it('Esc 关闭模态', async () => {
    const wrapper = mountModal()
    await flushPromises()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()

    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })
})

describe('ProviderList 单元', () => {
  it('无匹配时显示空态', async () => {
    const wrapper = mount(ProviderList, {
      props: { providers, selectedId: '' },
    })

    const search = wrapper.find('[data-role="provider-search"] input')
    await search.setValue('不存在的名字')

    expect(wrapper.text()).toContain('没有匹配的中转站')
  })
})
