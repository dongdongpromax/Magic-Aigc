import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { NSelect } from 'naive-ui'
import InputConsole from './InputConsole.vue'
import { useChatStore } from '@/store/chat'
import { requestImages } from '@/services/imageSession'
import { useProvidersStore } from '@/store/providers'
import * as uploadApiModule from '@/services/uploadApi'

vi.mock('@/services/imageSession', () => ({
  requestImages: vi.fn(),
}))

/**
 * 向 providers store 注入两家中转站：
 * openrouter 启用（含 2 个启用模型）；siliconflow 停用（不应出现在选择器）
 */
function seedProviders() {
  const providersStore = useProvidersStore()
  providersStore.providers = [
    {
      id: 'openrouter',
      name: 'OpenRouter',
      color: '#6366f1',
      enabled: true,
      apiKeys: ['sk-a'],
      enabledModels: [
        { modelId: 'openai/gpt-image-2', displayName: 'GPT Image 2' },
        { modelId: 'flux/dev', displayName: '' },
      ],
    },
    {
      id: 'siliconflow',
      name: '硅基流动',
      color: '#10b981',
      enabled: false,
      apiKeys: [],
      enabledModels: [{ modelId: 'qwen/image', displayName: 'Qwen Image' }],
    },
  ]
}

describe('InputConsole', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('将输入同步到当前草稿并启用发送按钮', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    seedProviders()

    const wrapper = mount(InputConsole, {
      global: {
        plugins: [pinia],
      },
    })

    const store = useChatStore()
    const sendButton = wrapper.find('.send-btn')

    expect(sendButton.attributes('disabled')).toBeDefined()

    await wrapper.find('textarea').setValue('生成一张冷银色机械大厅')

    expect(store.currentDraft.prompt).toBe('生成一张冷银色机械大厅')
    expect(sendButton.attributes('disabled')).toBeUndefined()
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.findAll('.n-base-selection')).toHaveLength(2)
  })

  it('点击尺寸触发器后显示网格弹层', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    seedProviders()

    const wrapper = mount(InputConsole, {
      global: {
        plugins: [pinia],
      },
    })

    await wrapper.get('[data-action="open-size-grid"]').trigger('click')

    expect(wrapper.find('[data-panel="size-grid"]').exists()).toBe(true)
    expect(wrapper.get('[data-panel="size-grid"]').attributes('data-placement')).toBe('top')
    expect(wrapper.text()).toContain('auto')
    expect(wrapper.text()).toContain('1:1')
    expect(wrapper.text()).toContain('1024×1024')
    expect(wrapper.text()).toContain('16:9')
    expect(wrapper.text()).toContain('1536×864')
    expect(wrapper.findAllComponents(NSelect)).toHaveLength(2)
  })

  it('上传超过 16 张参考图时显示上限提示', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const wrapper = mount(InputConsole, {
      global: {
        plugins: [pinia],
      },
    })

    const store = useChatStore()
    store.addReferenceImages(
      Array.from({ length: 16 }).map((_, index) => ({
        id: `ref-${index}`,
        name: `${index}.png`,
        type: 'image/png',
        url: `blob:${index}`,
        dataUrl: `data:${index}`,
        sourceMessageId: null,
      })),
    )

    const file = new File(['demo'], 'overflow.png', { type: 'image/png' })
    const input = wrapper.get('[data-action="add-reference"]')

    Object.defineProperty(input.element, 'files', {
      value: [file],
      configurable: true,
    })

    await input.trigger('change')

    expect(wrapper.text()).toContain('最多上传 16 张参考图')
  })

  it('显示参考图缩略条并支持移除单张', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const store = useChatStore()
    store.addReferenceImages([
      {
        id: 'ref-1',
        name: 'scene-01.png',
        type: 'image/png',
        url: 'blob:scene-01',
        dataUrl: 'data:scene-01',
        sourceMessageId: null,
      },
    ])

    const wrapper = mount(InputConsole, {
      global: {
        plugins: [pinia],
      },
    })

    expect(wrapper.findAll('[data-role="reference-card"]')).toHaveLength(1)

    await wrapper.get('[data-action="remove-reference"]').trigger('click')

    expect(store.currentDraft.referenceImages).toHaveLength(0)
  })

  it('上传参考图时调用后端上传接口并写入当前草稿', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const wrapper = mount(InputConsole, {
      global: {
        plugins: [pinia],
      },
    })

    const store = useChatStore()
    vi.spyOn(store, 'createTopic').mockResolvedValue('topic-1')
    vi.spyOn(uploadApiModule, 'uploadReferenceImages').mockResolvedValue([
      {
        id: 'ref-1',
        name: 'scene.png',
        filePath: '/files/references/scene.png',
        mimeType: 'image/png',
        sourceMessageId: null,
      },
    ])

    const file = new File(['demo'], 'scene.png', { type: 'image/png' })
    const input = wrapper.get('[data-action="add-reference"]')

    Object.defineProperty(input.element, 'files', {
      value: [file],
      configurable: true,
    })

    await input.trigger('change')

    expect(uploadApiModule.uploadReferenceImages).toHaveBeenCalledWith('topic-1', [file])
    expect(store.currentDraft.referenceImages[0]).toMatchObject({
      filePath: '/files/references/scene.png',
      url: '/files/references/scene.png',
    })
  })

  it('粘贴图片时上传为参考图并阻止默认粘贴行为', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const wrapper = mount(InputConsole, {
      global: {
        plugins: [pinia],
      },
    })

    const store = useChatStore()
    vi.spyOn(store, 'createTopic').mockResolvedValue('topic-1')
    vi.spyOn(uploadApiModule, 'uploadReferenceImages').mockResolvedValue([
      {
        id: 'ref-paste-1',
        name: 'paste.png',
        filePath: '/files/references/paste.png',
        mimeType: 'image/png',
        sourceMessageId: null,
      },
    ])

    // 构造带图片的剪贴板事件：jsdom 的 ClipboardEvent.clipboardData 不可写，
    // 用 Object.defineProperty 注入伪 items 列表
    const file = new File(['demo'], 'image.png', { type: 'image/png' })
    const event = new Event('paste', { cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: {
        items: [
          {
            type: 'image/png',
            getAsFile: () => file,
          },
        ],
      },
      configurable: true,
    })
    const preventDefault = vi.spyOn(event, 'preventDefault')

    wrapper.find('textarea').element.dispatchEvent(event)
    await flushPromises()

    expect(preventDefault).toHaveBeenCalled()
    expect(uploadApiModule.uploadReferenceImages).toHaveBeenCalledWith('topic-1', [expect.any(File)])
    expect(store.currentDraft.referenceImages[0]).toMatchObject({
      filePath: '/files/references/paste.png',
      url: '/files/references/paste.png',
    })
  })

  it('粘贴纯文本时不触发上传且放行默认粘贴行为', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const wrapper = mount(InputConsole, {
      global: {
        plugins: [pinia],
      },
    })

    vi.spyOn(uploadApiModule, 'uploadReferenceImages').mockResolvedValue([])

    const event = new Event('paste', { cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: {
        items: [
          {
            type: 'text/plain',
            getAsFile: () => null,
          },
        ],
      },
      configurable: true,
    })
    const preventDefault = vi.spyOn(event, 'preventDefault')

    wrapper.find('textarea').element.dispatchEvent(event)
    await flushPromises()

    expect(preventDefault).not.toHaveBeenCalled()
    expect(uploadApiModule.uploadReferenceImages).not.toHaveBeenCalled()
  })

  it('模型选择器按中转站分组渲染选项', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    seedProviders()

    const wrapper = mount(InputConsole, {
      global: { plugins: [pinia] },
    })

    const modelSelect = wrapper.findAllComponents(NSelect)[0]
    const options = modelSelect.props('options')

    // 停用的一家不出现在选项里
    expect(options).toHaveLength(1)
    expect(options[0].type).toBe('group')
    expect(options[0].label).toBe('OpenRouter')
    expect(options[0].children).toHaveLength(2)
    expect(options[0].children[0]).toMatchObject({
      label: 'GPT Image 2 · OpenRouter',
      value: 'openrouter::openai/gpt-image-2',
    })
    // 无 displayName 的模型回退显示 modelId
    expect(options[0].children[1].label).toBe('flux/dev · OpenRouter')
  })

  it('选中模型拆存为 draft.providerId + draft.model', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    seedProviders()

    const wrapper = mount(InputConsole, {
      global: { plugins: [pinia] },
    })
    const store = useChatStore()

    const modelSelect = wrapper.findAllComponents(NSelect)[0]
    modelSelect.vm.$emit('update:value', 'openrouter::flux/dev')

    expect(store.currentDraft.providerId).toBe('openrouter')
    expect(store.currentDraft.model).toBe('flux/dev')
  })

  it('无任何启用模型时显示引导入口，点击打开设置模态', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    // 不 seed：providers 为空 → 无可用模型

    const wrapper = mount(InputConsole, {
      global: { plugins: [pinia] },
    })
    const store = useChatStore()

    const entry = wrapper.find('[data-action="open-settings-empty"]')
    expect(entry.exists()).toBe(true)
    await entry.trigger('click')
    expect(store.settingsVisible).toBe(true)
  })

  it('发送时 requestImages 的 draft 携带 providerId', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    seedProviders()

    const wrapper = mount(InputConsole, {
      global: { plugins: [pinia] },
    })
    const store = useChatStore()
    vi.spyOn(store, 'addUserPrompt').mockResolvedValue('topic-1')
    vi.spyOn(store, 'completeImageGeneration').mockResolvedValue()
    requestImages.mockResolvedValue({ images: [], revisedPrompt: '' })

    store.currentDraft.providerId = 'openrouter'
    store.currentDraft.model = 'openai/gpt-image-2'
    await wrapper.find('textarea').setValue('画一只猫')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    expect(requestImages).toHaveBeenCalledWith(
      'topic-1',
      expect.objectContaining({
        draft: expect.objectContaining({
          providerId: 'openrouter',
          model: 'openai/gpt-image-2',
        }),
      }),
    )
  })
})
