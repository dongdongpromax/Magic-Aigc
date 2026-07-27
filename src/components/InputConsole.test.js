import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { NSelect } from 'naive-ui'
import InputConsole from './InputConsole.vue'
import { useChatStore } from '@/store/chat'
import { requestImages } from '@/services/imageSession'
import { requestVideo } from '@/services/videoSession'
import { useProvidersStore } from '@/store/providers'
import * as uploadApiModule from '@/services/uploadApi'

vi.mock('@/services/imageSession', () => ({
  requestImages: vi.fn(),
}))

vi.mock('@/services/videoSession', () => ({
  requestVideo: vi.fn(),
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
    // ConfirmDialog 通过 Teleport 挂到 body，测试间清理避免串扰
    document.body.innerHTML = ''
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
    // 参数面板未展开时只有模型选择器 1 个 NSelect（张数/比例等收纳在面板内）
    expect(wrapper.findAll('.n-base-selection')).toHaveLength(1)
  })

  it('点击参数按钮展开面板，显示尺寸网格与张数选择器', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    seedProviders()

    const wrapper = mount(InputConsole, {
      global: {
        plugins: [pinia],
      },
    })

    const store = useChatStore()
    // 未选模型时参数按钮不显示，先选中图像模型
    store.currentDraft.providerId = 'openrouter'
    store.currentDraft.model = 'openai/gpt-image-2'
    await flushPromises()

    // 点击参数按钮展开面板
    await wrapper.get('[data-action="open-params"]').trigger('click')

    // 参数面板容器存在且朝上弹出
    expect(wrapper.find('[data-panel="params"]').exists()).toBe(true)
    expect(wrapper.get('[data-panel="params"]').attributes('data-placement')).toBe('top')
    // 面板内含尺寸网格
    expect(wrapper.find('[data-panel="size-grid"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('自动')
    expect(wrapper.text()).toContain('1:1')
    expect(wrapper.text()).toContain('1024×1024')
    expect(wrapper.text()).toContain('16:9')
    expect(wrapper.text()).toContain('1536×864')
    // 展开后 NSelect = 模型选择器（张数改分段按钮）
    expect(wrapper.findAllComponents(NSelect)).toHaveLength(1)
  })

  it('参数按钮显示当前参数摘要文案', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    seedProviders()

    const wrapper = mount(InputConsole, {
      global: { plugins: [pinia] },
    })
    const store = useChatStore()

    // 选中图像模型后参数按钮才显示
    store.currentDraft.providerId = 'openrouter'
    store.currentDraft.model = 'openai/gpt-image-2'
    // 图像模式默认：尺寸 auto + 张数 1
    store.currentDraft.size = 'auto'
    store.currentDraft.n = 1
    await flushPromises()
    const paramBtn = wrapper.find('[data-action="open-params"]')
    expect(paramBtn.text()).toContain('自动')
    expect(paramBtn.text()).toContain('1张')

    // 切换尺寸后摘要同步更新
    store.currentDraft.size = '1536x864'
    store.currentDraft.n = 3
    await flushPromises()
    expect(paramBtn.text()).toContain('16:9')
    expect(paramBtn.text()).toContain('3张')
  })

  it('视频模式参数面板显示比例/时长/清晰度', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    // 注入含视频模型的中转站
    const providersStore = useProvidersStore()
    providersStore.providers = [
      {
        id: 'volcengine',
        name: '火山方舟',
        color: '#ff6b35',
        enabled: true,
        apiKeys: ['sk-vol'],
        enabledModels: [
          { modelId: 'seedance-1-0', displayName: 'Seedance 1.0', isVideo: true },
        ],
      },
    ]

    const wrapper = mount(InputConsole, {
      global: { plugins: [pinia] },
    })
    const store = useChatStore()
    store.currentDraft.providerId = 'volcengine'
    store.currentDraft.model = 'seedance-1-0'
    await flushPromises()

    // 视频模式摘要包含比例和清晰度
    const paramBtn = wrapper.find('[data-action="open-params"]')
    expect(paramBtn.text()).toContain('16:9')
    expect(paramBtn.text()).toContain('720p')

    // 展开面板显示视频参数控件
    await paramBtn.trigger('click')
    expect(wrapper.find('[data-panel="params"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('参考模式')
    expect(wrapper.text()).toContain('比例')
    expect(wrapper.text()).toContain('时长')
    expect(wrapper.text()).toContain('清晰度')
    // 展开后 NSelect = 模型 + 时长 = 2（参考模式/比例/清晰度改分段按钮）
    expect(wrapper.findAllComponents(NSelect)).toHaveLength(2)
  })

  it('上传超过 16 张参考图时显示上限提示', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    seedProviders()

    const wrapper = mount(InputConsole, {
      global: {
        plugins: [pinia],
      },
    })

    const store = useChatStore()
    // 选中图像模型后参考图上传按钮才显示
    store.currentDraft.providerId = 'openrouter'
    store.currentDraft.model = 'openai/gpt-image-2'
    await flushPromises()
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

    // 已满 16 张时上传被截断；按钮角标显示 16/16，完整提示移到 title
    const uploadTrigger = wrapper.find('.upload-trigger')
    expect(wrapper.text()).toContain('16/16')
    expect(uploadTrigger.attributes('title')).toContain('已添加 16 / 16 张参考图')
    expect(store.currentDraft.referenceImages).toHaveLength(16)
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
    seedProviders()

    const wrapper = mount(InputConsole, {
      global: {
        plugins: [pinia],
      },
    })

    const store = useChatStore()
    store.currentDraft.providerId = 'openrouter'
    store.currentDraft.model = 'openai/gpt-image-2'
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

    await flushPromises()

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

  it('发送时 runGeneration 收到的快照携带 providerId', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    seedProviders()

    const wrapper = mount(InputConsole, {
      global: { plugins: [pinia] },
    })
    const store = useChatStore()
    // 生成流程已抽取到 store.runGeneration，此处 spy 验证 InputConsole 传入了正确快照
    const runGenSpy = vi.spyOn(store, 'runGeneration').mockResolvedValue()

    store.currentDraft.providerId = 'openrouter'
    store.currentDraft.model = 'openai/gpt-image-2'
    await wrapper.find('textarea').setValue('画一只猫')
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    expect(runGenSpy).toHaveBeenCalledWith(
      '画一只猫',
      expect.objectContaining({
        providerId: 'openrouter',
        model: 'openai/gpt-image-2',
      }),
    )
  })

  it('Shift+Enter 不触发发送（放行换行），且不弹确认框', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    seedProviders()

    const wrapper = mount(InputConsole, { global: { plugins: [pinia] } })
    const store = useChatStore()
    requestImages.mockResolvedValue({ images: [], revisedPrompt: '' })

    store.currentDraft.providerId = 'openrouter'
    store.currentDraft.model = 'openai/gpt-image-2'
    await wrapper.find('textarea').setValue('画一只猫')

    // Shift+Enter：默认换行，不应发送、不应弹确认
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter', shiftKey: true })
    await flushPromises()

    expect(requestImages).not.toHaveBeenCalled()
    // Teleport 在测试中被 stub（见 setup.js），内容原地渲染，用 wrapper 查询
    expect(wrapper.find('[data-role="confirm-dialog"]').exists()).toBe(false)
  })

  it('Enter 弹出提交确认，确认后才发送', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    seedProviders()

    const wrapper = mount(InputConsole, { global: { plugins: [pinia] } })
    const store = useChatStore()
    // 生成流程已抽取到 store.runGeneration，此处 spy 验证「确认后才触发发送」
    const runGenSpy = vi.spyOn(store, 'runGeneration').mockResolvedValue()

    store.currentDraft.providerId = 'openrouter'
    store.currentDraft.model = 'openai/gpt-image-2'
    await wrapper.find('textarea').setValue('画一只猫')

    // Enter：弹确认框，尚未发送
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter', shiftKey: false })
    await flushPromises()

    // Teleport 在测试中被 stub，内容原地渲染，用 wrapper 查询
    expect(wrapper.find('[data-role="confirm-dialog"]').exists()).toBe(true)
    expect(runGenSpy).not.toHaveBeenCalled()

    // 点击「确定提交」后才发送
    await wrapper.find('[data-action="confirm-confirm"]').trigger('click')
    await flushPromises()

    expect(runGenSpy).toHaveBeenCalledWith(
      '画一只猫',
      expect.objectContaining({
        providerId: 'openrouter',
        model: 'openai/gpt-image-2',
      }),
    )
  })

  it('Enter 提交确认取消时不发送', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    seedProviders()

    const wrapper = mount(InputConsole, { global: { plugins: [pinia] } })
    const store = useChatStore()
    requestImages.mockResolvedValue({ images: [], revisedPrompt: '' })

    store.currentDraft.providerId = 'openrouter'
    store.currentDraft.model = 'openai/gpt-image-2'
    await wrapper.find('textarea').setValue('画一只猫')

    await wrapper.find('textarea').trigger('keydown', { key: 'Enter', shiftKey: false })
    await flushPromises()

    // 点击「取消」
    await wrapper.find('[data-action="confirm-cancel"]').trigger('click')
    await flushPromises()

    expect(requestImages).not.toHaveBeenCalled()
  })

  it('视频参数面板含参考模式选择器，默认首帧', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const providersStore = useProvidersStore()
    providersStore.providers = [
      {
        id: 'volcengine',
        name: '火山方舟',
        color: '#ff6b35',
        enabled: true,
        apiKeys: ['sk'],
        enabledModels: [{ modelId: 'seedance-1-0', displayName: 'Seedance 1.0', isVideo: true }],
      },
    ]
    const wrapper = mount(InputConsole, { global: { plugins: [pinia] } })
    const store = useChatStore()
    store.currentDraft.providerId = 'volcengine'
    store.currentDraft.model = 'seedance-1-0'
    await flushPromises()

    await wrapper.get('[data-action="open-params"]').trigger('click')
    expect(wrapper.text()).toContain('参考模式')
    expect(store.currentDraft.videoRefMode).toBe('first_frame')
  })

  it('首尾帧模式渲染 2 个带标签卡槽，多图参考渐进式显示添加入口', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const providersStore = useProvidersStore()
    providersStore.providers = [
      {
        id: 'volcengine',
        name: '火山方舟',
        color: '#ff6b35',
        enabled: true,
        apiKeys: ['sk'],
        enabledModels: [{ modelId: 'seedance-1-0', displayName: 'Seedance 1.0', isVideo: true }],
      },
    ]
    const wrapper = mount(InputConsole, { global: { plugins: [pinia] } })
    const store = useChatStore()
    store.currentDraft.providerId = 'volcengine'
    store.currentDraft.model = 'seedance-1-0'
    store.currentDraft.videoRefMode = 'first_last'
    await flushPromises()

    // 首尾帧：2 个卡槽，含「首帧」「尾帧」标签
    expect(wrapper.findAll('[data-role="ref-slot"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('首帧')
    expect(wrapper.text()).toContain('尾帧')

    // 切多图参考：空状态只显示 1 个添加入口，不铺满 9 槽
    store.currentDraft.videoRefMode = 'reference'
    await flushPromises()
    expect(wrapper.findAll('[data-role="ref-slot"]')).toHaveLength(1)

    // 上传 2 张后：2 个满槽 + 1 个添加入口 = 3
    store.currentDraft.referenceImages = [
      { id: 'r1', name: 'a.png', type: 'image/png', url: '/files/a.png' },
      { id: 'r2', name: 'b.png', type: 'image/png', url: '/files/b.png' },
    ]
    await flushPromises()
    expect(wrapper.findAll('[data-role="ref-slot"]')).toHaveLength(3)
  })

  it('首尾帧模式未填满两槽时阻止发送并提示', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const providersStore = useProvidersStore()
    providersStore.providers = [
      {
        id: 'volcengine',
        name: '火山方舟',
        color: '#ff6b35',
        enabled: true,
        apiKeys: ['sk'],
        enabledModels: [{ modelId: 'seedance-1-0', displayName: 'Seedance 1.0', isVideo: true }],
      },
    ]
    const wrapper = mount(InputConsole, { global: { plugins: [pinia] } })
    const store = useChatStore()
    store.currentDraft.providerId = 'volcengine'
    store.currentDraft.model = 'seedance-1-0'
    store.currentDraft.videoRefMode = 'first_last'
    store.currentDraft.prompt = '动起来'
    // 只塞 1 张图（首帧有、尾帧空）
    store.currentDraft.referenceImages = [
      { id: 'r1', name: 'a.png', type: 'image/png', url: '/files/a.png' },
    ]
    await flushPromises()

    requestVideo.mockReset()
    await wrapper.find('.send-btn').trigger('click')
    await flushPromises()

    expect(store.lastError).toContain('首尾帧')
    expect(requestVideo).not.toHaveBeenCalled()
  })

  it('图像模型 prompt 超过软提醒阈值(15k)显示琥珀色软提醒，超过硬限制(30k)显示红色强警告', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    seedProviders()
    const wrapper = mount(InputConsole, { global: { plugins: [pinia] } })
    const store = useChatStore()

    store.currentDraft.providerId = 'openrouter'
    store.currentDraft.model = 'openai/gpt-image-2'
    await flushPromises()

    // 短 prompt：无警告
    store.currentDraft.prompt = '生成一张冷银色机械大厅'
    await flushPromises()
    expect(wrapper.find('[data-role="prompt-warn"]').exists()).toBe(false)

    // 软提醒档（15001 字符）：琥珀色，data-level=soft
    store.currentDraft.prompt = 'A'.repeat(15001)
    await flushPromises()
    let warnEl = wrapper.find('[data-role="prompt-warn"]')
    expect(warnEl.exists()).toBe(true)
    expect(warnEl.attributes('data-level')).toBe('soft')
    expect(warnEl.classes()).not.toContain('prompt-warn--hard')
    expect(warnEl.text()).toContain('15001')
    expect(warnEl.text()).toContain('15000')

    // 硬限制档（30001 字符）：红色强警告，data-level=hard
    store.currentDraft.prompt = 'A'.repeat(30001)
    await flushPromises()
    warnEl = wrapper.find('[data-role="prompt-warn"]')
    expect(warnEl.exists()).toBe(true)
    expect(warnEl.attributes('data-level')).toBe('hard')
    expect(warnEl.classes()).toContain('prompt-warn--hard')
    expect(warnEl.text()).toContain('30001')
    expect(warnEl.text()).toContain('30000')
  })

  it('图像模型 prompt 在 15k 以内（含 8975 等正常长 prompt）不显示警告', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    seedProviders()
    const wrapper = mount(InputConsole, { global: { plugins: [pinia] } })
    const store = useChatStore()

    store.currentDraft.providerId = 'openrouter'
    store.currentDraft.model = 'openai/gpt-image-2'
    await flushPromises()

    // 8975 字符（用户实际场景）：不警告，gpt-image-2 硬限制 32,000 完全支持
    store.currentDraft.prompt = 'A'.repeat(8975)
    await flushPromises()
    expect(wrapper.find('[data-role="prompt-warn"]').exists()).toBe(false)
  })

  it('视频模型 prompt 超长时不显示超长警告', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const providersStore = useProvidersStore()
    providersStore.providers = [
      {
        id: 'volcengine',
        name: '火山方舟',
        color: '#ff6b35',
        enabled: true,
        apiKeys: ['sk'],
        enabledModels: [{ modelId: 'seedance-1-0', displayName: 'Seedance 1.0', isVideo: true }],
      },
    ]
    const wrapper = mount(InputConsole, { global: { plugins: [pinia] } })
    const store = useChatStore()

    store.currentDraft.providerId = 'volcengine'
    store.currentDraft.model = 'seedance-1-0'
    // 视频 prompt 超长也不警告（视频模型 prompt 结构不同）
    store.currentDraft.prompt = 'A'.repeat(5000)
    await flushPromises()

    expect(wrapper.find('[data-role="prompt-warn"]').exists()).toBe(false)
  })

  // 生成流程的「快照竞态」与「图像/视频分支路由」已随 runGeneration 抽取到 store 层，
  // 相关测试见 src/store/chat.test.js 的 runGeneration 用例（store 层更贴近真实调用链）。
})
