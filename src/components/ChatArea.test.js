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

  it('用户消息"重试"还原草稿快照并直接调 runGeneration 重新发送', async () => {
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

    // 用户消息携带完整 draftSnapshot（createUserPromptMessage 创建时快照）
    const draftSnapshot = {
      prompt: '画一只猫',
      model: 'openai/gpt-image-2',
      providerId: 'openrouter',
      size: '1536x864',
      quality: 'high',
      n: 2,
      referenceImages: [],
      ratio: '16:9',
      duration: 5,
      resolution: '720p',
      videoRefMode: 'first_frame',
    }
    const userMessage = {
      id: 'msg-user-retry',
      topicId,
      type: 'user_prompt',
      role: 'user',
      prompt: '画一只猫',
      draftSnapshot,
      createdAt: Date.now(),
    }
    chatStore.messages = [userMessage]

    await flushPromises()
    await wrapper.vm.$nextTick()

    // 还原草稿与生成编排都 spy 掉，专注验证 ChatArea 的重试编排链路
    const restoreSpy = vi.spyOn(chatStore, 'restoreDraft').mockImplementation(() => {})
    const runGenSpy = vi.spyOn(chatStore, 'runGeneration').mockResolvedValue()

    const bubble = wrapper.findComponent({ name: 'MessageBubble' })
    expect(bubble.exists()).toBe(true)

    // 触发 MessageBubble 的 retry 事件（携带原消息）
    await bubble.vm.$emit('retry', userMessage)
    await flushPromises()

    // 先用快照还原草稿，再用快照直接发起生成（无需手动点发送）
    expect(restoreSpy).toHaveBeenCalledWith(draftSnapshot)
    expect(runGenSpy).toHaveBeenCalledWith(
      '画一只猫',
      expect.objectContaining({
        model: 'openai/gpt-image-2',
        providerId: 'openrouter',
        size: '1536x864',
        n: 2,
        referenceImages: expect.any(Array),
      }),
    )
  })

  it('生成中时用户消息"重试"被互斥锁拦截，不触发 runGeneration', async () => {
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

    const userMessage = {
      id: 'msg-user-locked',
      topicId,
      type: 'user_prompt',
      role: 'user',
      prompt: '画一只猫',
      draftSnapshot: { prompt: '画一只猫', model: 'openai/gpt-image-2', providerId: 'openrouter' },
      createdAt: Date.now(),
    }
    chatStore.messages = [userMessage]
    await flushPromises()
    await wrapper.vm.$nextTick()

    // 模拟生成中：isGenerating=true 时重试应被直接拦截
    chatStore.isGenerating = true
    const runGenSpy = vi.spyOn(chatStore, 'runGeneration').mockResolvedValue()

    const bubble = wrapper.findComponent({ name: 'MessageBubble' })
    await bubble.vm.$emit('retry', userMessage)
    await flushPromises()

    expect(runGenSpy).not.toHaveBeenCalled()
  })

  /**
   * jsdom 不计算布局，scrollHeight/clientHeight 默认 0；通过 defineProperty
   * 在容器实例上 stub 出可滚动尺寸，以验证滚动逻辑接线。
   */
  function stubScrollSize(el, { scrollHeight, clientHeight }) {
    Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true })
  }

  it('切换到历史会话后自动滚动到底部（定位到最近一条消息）', async () => {
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

    // 两个主题都放消息，切换时容器始终存在（v-if 不闪断），便于稳定 stub 尺寸
    chatStore.messages = [
      { id: 'm1', topicId, type: 'user_prompt', role: 'user', prompt: '当前会话', createdAt: 1 },
      { id: 'm2', topicId: 'topic-history', type: 'user_prompt', role: 'user', prompt: '历史第一条', createdAt: 2 },
      { id: 'm3', topicId: 'topic-history', type: 'assistant_text', role: 'assistant', content: '历史第二条', createdAt: 3 },
    ]
    await flushPromises()

    // 容器已渲染（当前主题有 m1），stub 出可滚动尺寸（clientHeight=0 避免 jsdom 夹紧干扰）
    const container = wrapper.find('.messages-container').element
    stubScrollSize(container, { scrollHeight: 1000, clientHeight: 0 })

    // 切换到历史会话
    chatStore.currentTopicId = 'topic-history'
    await flushPromises()

    // 自动滚到底部：scrollTop === scrollHeight
    expect(container.scrollTop).toBe(1000)
  })

  it('用户已上滑时新增消息不强制拉回底部（仅接近底部才跟随）', async () => {
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

    chatStore.messages = [
      { id: 'm1', topicId, type: 'user_prompt', role: 'user', prompt: '第一条', createdAt: 1 },
      { id: 'm2', topicId, type: 'assistant_text', role: 'assistant', content: '第二条', createdAt: 2 },
    ]
    await flushPromises()

    // stub 尺寸并把 scrollTop 置 0（模拟用户主动上滑到顶部，远离底部）
    const container = wrapper.find('.messages-container').element
    stubScrollSize(container, { scrollHeight: 1000, clientHeight: 400 })
    container.scrollTop = 0

    // 同主题新增一条消息（不切换主题），不应把用户拉回底部
    chatStore.messages = [
      ...chatStore.messages,
      { id: 'm3', topicId, type: 'assistant_text', role: 'assistant', content: '第三条', createdAt: 3 },
    ]
    await flushPromises()

    expect(container.scrollTop).toBe(0)
  })
})
