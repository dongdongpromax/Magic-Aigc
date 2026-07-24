/**
 * ChatArea 组件测试
 *
 * ChatArea 的 onMounted 会调 chatStore.bootstrap()，后者会调真实的
 * getSettings / listTopics，触发 jsdom 网络错误。这里 mock 掉
 * @/services/settingsApi 和 @/services/chatApi，阻断真实网络请求。
 */
import { flushPromises, shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import ChatArea from './ChatArea.vue'
import VideoMessageCard from './VideoMessageCard.vue'
import { useChatStore } from '@/store/chat'

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
// registerReferenceFromMessage 需 spy，所以用 vi.fn() 保持可断言
const { registerReferenceFromMessageMock } = vi.hoisted(() => ({
  registerReferenceFromMessageMock: vi.fn().mockResolvedValue({ referenceImages: [] }),
}))

vi.mock('@/services/uploadApi', () => ({
  deleteReferenceImage: vi.fn().mockResolvedValue({ success: true }),
  registerReferenceFromMessage: registerReferenceFromMessageMock,
}))

// bootstrap 现在会并行调 listProviders（providers store），不 mock 会发真实请求
vi.mock('@/services/providersApi', () => ({
  listProviders: vi.fn().mockResolvedValue([]),
  createProvider: vi.fn(),
  updateProvider: vi.fn(),
  setProviderEnabled: vi.fn(),
  deleteProvider: vi.fn(),
  checkProvider: vi.fn(),
  listProviderModels: vi.fn().mockResolvedValue([]),
  fetchProviderModels: vi.fn(),
  addProviderModel: vi.fn(),
  setProviderModelEnabled: vi.fn(),
  deleteProviderModel: vi.fn(),
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
          SettingsModal: true,
        },
      },
    })

    expect(wrapper.get('.chat-area').classes()).toContain('scene-visible')
  })

  it('视频消息"继续细化"只回填 prompt，不调 addReferenceFromMessage', async () => {
    setActivePinia(createPinia())

    const wrapper = shallowMount(ChatArea, {
      global: {
        plugins: [createPinia()],
        stubs: {
          ConnectionBadge: true,
          ImageMessageCard: true,
          InputConsole: true,
          MessageBubble: true,
          SettingsModal: true,
          VideoMessageCard: true,
        },
      },
    })

    // 等 bootstrap 完成（listTopics 返回 [] → createTopic → currentTopicId = 'topic-1'）
    await flushPromises()

    const chatStore = useChatStore()
    const topicId = chatStore.currentTopicId
    expect(topicId).toBeTruthy()

    // 注入一条视频消息（images 全是 video/mp4，不能作为首帧参考图）
    const videoMessage = {
      id: 'msg-video',
      topicId,
      type: 'assistant_videos',
      role: 'assistant',
      prompt: '一只猫奔跑',
      videos: [{ url: '/files/generated/test.mp4' }],
      images: [{ id: 'img-1', url: '/files/generated/test.mp4', mimeType: 'video/mp4' }],
      createdAt: Date.now(),
    }
    chatStore.messages = [videoMessage]

    // 等组件重新渲染，VideoMessageCard stub 出现
    await flushPromises()
    await wrapper.vm.$nextTick()

    // shallowMount 自动 stub VideoMessageCard，通过 name 查找 stub
    const videoCard = wrapper.findComponent({ name: 'VideoMessageCard' })
    expect(videoCard.exists()).toBe(true)

    // 触发"继续细化"
    await videoCard.vm.$emit('refine', videoMessage)
    await flushPromises()

    // 视频消息不应触发 registerReferenceFromMessage（视频不能作首帧参考图）
    expect(registerReferenceFromMessageMock).not.toHaveBeenCalled()
    // 但 prompt 应已回填到草稿
    expect(chatStore.currentDraft.prompt).toBe('一只猫奔跑')
  })

  it('视频消息"再次生成"回填 videoRefMode 到草稿', async () => {
    setActivePinia(createPinia())

    const wrapper = shallowMount(ChatArea, {
      global: {
        plugins: [createPinia()],
        stubs: {
          ConnectionBadge: true,
          ImageMessageCard: true,
          InputConsole: true,
          MessageBubble: true,
          SettingsModal: true,
          VideoMessageCard: true,
        },
      },
    })

    await flushPromises()

    const chatStore = useChatStore()
    const topicId = chatStore.currentTopicId
    expect(topicId).toBeTruthy()

    // 注入一条多图参考模式的视频消息
    const videoMessage = {
      id: 'msg-video-retry',
      topicId,
      type: 'assistant_videos',
      role: 'assistant',
      prompt: '一只猫奔跑',
      model: 'seedance-1-0',
      videoRefMode: 'reference',
      meta: { videoRefMode: 'reference', providerName: '火山方舟' },
      videos: [{ url: '/files/generated/test.mp4' }],
      images: [{ id: 'img-1', url: '/files/generated/test.mp4', mimeType: 'video/mp4' }],
      createdAt: Date.now(),
    }
    chatStore.messages = [videoMessage]

    await flushPromises()
    await wrapper.vm.$nextTick()

    // 默认 first_frame，触发 retry 后应回填为 reference
    expect(chatStore.currentDraft.videoRefMode).toBe('first_frame')

    const videoCard = wrapper.findComponent({ name: 'VideoMessageCard' })
    await videoCard.vm.$emit('retry', videoMessage)
    await flushPromises()

    expect(chatStore.currentDraft.videoRefMode).toBe('reference')
    expect(chatStore.currentDraft.prompt).toBe('一只猫奔跑')
  })
})
