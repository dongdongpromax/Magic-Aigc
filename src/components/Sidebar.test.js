import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import Sidebar from './Sidebar.vue'
import { useChatStore } from '@/store/chat'

// 阻断 chat.js 顶部的网络相关 import
vi.mock('@/services/chatApi', () => ({
  listTopics: vi.fn().mockResolvedValue([]),
  getMessages: vi.fn().mockResolvedValue([]),
  getDraft: vi.fn().mockResolvedValue({
    topicId: 'topic-1',
    prompt: '',
    model: 'openai/gpt-image-2',
    size: 'auto',
    quality: 'high',
    n: 1,
    referenceImages: [],
  }),
  createTopic: vi.fn().mockResolvedValue({
    id: 'topic-1',
    title: '测试主题',
    coverImage: null,
    lastPrompt: '',
    updatedAt: 1,
    createdAt: 1,
    messageCount: 0,
    status: 'idle',
  }),
  saveDraft: vi.fn().mockResolvedValue({}),
  deleteTopic: vi.fn().mockResolvedValue(),
}))

vi.mock('@/services/settingsApi', () => ({
  getSettings: vi.fn().mockResolvedValue({
    baseURL: 'http://127.0.0.1:4398',
    defaultModel: 'openai/gpt-image-2',
    defaultSize: 'auto',
    defaultQuality: 'high',
    defaultN: 1,
    requestMode: 'openrouter-image',
    timeout: 1200000,
  }),
  updateSettings: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/services/uploadApi', () => ({
  deleteReferenceImage: vi.fn().mockResolvedValue({ success: true }),
  registerReferenceFromMessage: vi.fn().mockResolvedValue({ referenceImages: [] }),
}))

describe('Sidebar', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('显示图像工作台并支持新建创作', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const wrapper = mount(Sidebar, {
      global: {
        plugins: [pinia],
      },
    })

    expect(wrapper.text()).toContain('图像工作台')
    expect(wrapper.text()).toContain('新建创作')

    const store = useChatStore()
    const createTopicSpy = vi.spyOn(store, 'createTopic').mockResolvedValue('topic-1')

    await wrapper.find('.action-btn').trigger('click')
    expect(createTopicSpy).toHaveBeenCalledWith('新建创作')
  })

  it('主题项含删除按钮（hover 时显示）', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useChatStore()

    // 手动塞入一个主题
    store.topics = [
      {
        id: 'topic-1',
        title: '测试主题',
        coverImage: null,
        lastPrompt: '',
        updatedAt: 1,
        createdAt: 1,
        messageCount: 0,
        status: 'idle',
      },
    ]
    store.currentTopicId = 'topic-1'

    const wrapper = mount(Sidebar, {
      global: { plugins: [pinia] },
    })

    // topic-item 内应存在删除按钮
    const deleteBtn = wrapper.find('[data-action="delete-topic"]')
    expect(deleteBtn.exists()).toBe(true)
  })

  it('点击删除按钮时弹 confirm，确认后调 chatStore.deleteTopic', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useChatStore()

    store.topics = [
      {
        id: 'topic-1',
        title: '测试主题',
        coverImage: null,
        lastPrompt: '',
        updatedAt: 1,
        createdAt: 1,
        messageCount: 0,
        status: 'idle',
      },
    ]
    store.currentTopicId = 'topic-1'

    // mock window.confirm 返回 true（确认删除）
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    // mock store.deleteTopic 避免真实 API 调用
    const deleteTopicSpy = vi.spyOn(store, 'deleteTopic').mockResolvedValue(undefined)

    const wrapper = mount(Sidebar, {
      global: { plugins: [pinia] },
    })

    const deleteBtn = wrapper.find('[data-action="delete-topic"]')
    await deleteBtn.trigger('click')

    // 应弹出 confirm
    expect(confirmSpy).toHaveBeenCalled()
    // 确认后应调 store.deleteTopic
    expect(deleteTopicSpy).toHaveBeenCalledWith('topic-1')

    confirmSpy.mockRestore()
  })

  it('confirm 取消时不调 chatStore.deleteTopic', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useChatStore()

    store.topics = [
      {
        id: 'topic-1',
        title: '测试主题',
        coverImage: null,
        lastPrompt: '',
        updatedAt: 1,
        createdAt: 1,
        messageCount: 0,
        status: 'idle',
      },
    ]
    store.currentTopicId = 'topic-1'

    // mock window.confirm 返回 false（取消）
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const deleteTopicSpy = vi.spyOn(store, 'deleteTopic').mockResolvedValue(undefined)

    const wrapper = mount(Sidebar, {
      global: { plugins: [pinia] },
    })

    const deleteBtn = wrapper.find('[data-action="delete-topic"]')
    await deleteBtn.trigger('click')

    expect(confirmSpy).toHaveBeenCalled()
    // 取消时不应调 deleteTopic
    expect(deleteTopicSpy).not.toHaveBeenCalled()

    confirmSpy.mockRestore()
  })
})
