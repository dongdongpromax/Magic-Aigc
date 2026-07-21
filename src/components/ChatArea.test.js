/**
 * ChatArea 组件测试
 *
 * ChatArea 的 onMounted 会调 chatStore.bootstrap()，后者会调真实的
 * getSettings / listTopics，触发 jsdom 网络错误。这里 mock 掉
 * @/services/settingsApi 和 @/services/chatApi，阻断真实网络请求。
 */
import { shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import ChatArea from './ChatArea.vue'

// 阻断 bootstrap 中的真实网络调用，避免 unhandled rejection
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
}))

// 阻断 uploadApi 中的网络调用（chat.js 顶部 import 了该模块）
vi.mock('@/services/uploadApi', () => ({
  deleteReferenceImage: vi.fn().mockResolvedValue({ success: true }),
  registerReferenceFromMessage: vi.fn().mockResolvedValue({ referenceImages: [] }),
}))

describe('ChatArea', () => {
  it('聊天主区域使用可透出背景场景的外层样式', () => {
    setActivePinia(createPinia())

    const wrapper = shallowMount(ChatArea, {
      global: {
        plugins: [createPinia()],
        stubs: {
          ConnectionBadge: true,
          ImageMessageCard: true,
          InputConsole: true,
          MessageBubble: true,
          SettingsDrawer: true,
        },
      },
    })

    expect(wrapper.get('.chat-area').classes()).toContain('scene-visible')
  })
})
