import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { NSelect } from 'naive-ui'
import InputConsole from './InputConsole.vue'
import { useChatStore } from '@/store/chat'
import * as uploadApiModule from '@/services/uploadApi'

describe('InputConsole', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('将输入同步到当前草稿并启用发送按钮', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

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

    const wrapper = mount(InputConsole, {
      global: {
        plugins: [pinia],
      },
    })

    await wrapper.get('[data-action="open-size-grid"]').trigger('click')

    expect(wrapper.find('[data-panel="size-grid"]').exists()).toBe(true)
    expect(wrapper.get('[data-panel="size-grid"]').attributes('data-placement')).toBe('top')
    expect(wrapper.text()).toContain('auto')
    expect(wrapper.text()).toContain('1:1 · 1024×1024')
    expect(wrapper.text()).toContain('16:9 · 1536×864')
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

  it('支持输入区全屏展开和收起', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const wrapper = mount(InputConsole, {
      global: {
        plugins: [pinia],
      },
    })

    const root = wrapper.get('.input-console')
    const toggle = wrapper.get('[data-action="toggle-fullscreen"]')

    expect(root.classes()).not.toContain('is-expanded')

    await toggle.trigger('click')
    expect(root.classes()).toContain('is-expanded')

    await toggle.trigger('click')
    expect(root.classes()).not.toContain('is-expanded')
  })
})
