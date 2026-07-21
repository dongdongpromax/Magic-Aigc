import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useChatStore } from './chat'

const {
  listTopicsMock,
  getMessagesMock,
  getDraftMock,
  createTopicMock,
  saveDraftMock,
  getSettingsMock,
  updateSettingsMock,
} = vi.hoisted(() => ({
  listTopicsMock: vi.fn(),
  getMessagesMock: vi.fn(),
  getDraftMock: vi.fn(),
  createTopicMock: vi.fn(),
  saveDraftMock: vi.fn(),
  getSettingsMock: vi.fn(),
  updateSettingsMock: vi.fn(),
}))

vi.mock('@/services/chatApi', () => ({
  listTopics: listTopicsMock,
  getMessages: getMessagesMock,
  getDraft: getDraftMock,
  createTopic: createTopicMock,
  saveDraft: saveDraftMock,
}))

vi.mock('@/services/settingsApi', () => ({
  getSettings: getSettingsMock,
  updateSettings: updateSettingsMock,
}))

describe('chat store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    localStorage.clear()
    setActivePinia(createPinia())

    listTopicsMock.mockResolvedValue([])
    getMessagesMock.mockResolvedValue([])
    getDraftMock.mockResolvedValue({
      topicId: 'topic-1',
      prompt: '',
      model: 'openai/gpt-image-2',
      size: 'auto',
      quality: 'high',
      n: 1,
      referenceImages: [],
    })
    createTopicMock.mockResolvedValue({
      id: 'topic-1',
      title: '海报概念',
      coverImage: null,
      lastPrompt: '',
      updatedAt: 1,
      createdAt: 1,
      messageCount: 0,
      status: 'idle',
    })
    saveDraftMock.mockResolvedValue({})
    getSettingsMock.mockResolvedValue({
      baseURL: 'http://127.0.0.1:4398',
      defaultModel: 'openai/gpt-image-2',
      defaultSize: 'auto',
      defaultQuality: 'high',
      defaultN: 1,
      requestMode: 'backend-proxy',
      timeout: 120000,
    })
    updateSettingsMock.mockResolvedValue({})
  })

  it('创建新主题时初始化远程草稿', async () => {
    const store = useChatStore()
    const topicId = await store.createTopic('海报概念')

    expect(store.currentTopicId).toBe(topicId)
    expect(store.drafts[topicId]).toMatchObject({
      prompt: '',
      model: 'openai/gpt-image-2',
      size: 'auto',
    })
  })

  it('提交消息后保留在内存状态，不再写入 localStorage', async () => {
    const store = useChatStore()
    await store.createTopic('海报概念')

    await store.addUserPrompt('生成一张银白机械风格角色海报')

    expect(store.currentMessages).toHaveLength(2)
    expect(localStorage.getItem('ai-chat-draw:chat-store')).toBeNull()
  })

  it('初始化时从 backend 恢复历史主题和消息', async () => {
    listTopicsMock.mockResolvedValue([
      {
        id: 'topic-1',
        title: '数据库历史主题',
        coverImage: null,
        lastPrompt: '一张绿色全息海报',
        updatedAt: 1,
        createdAt: 1,
        messageCount: 2,
        status: 'idle',
      },
    ])
    getMessagesMock.mockResolvedValue([
      {
        id: 'msg-1',
        topicId: 'topic-1',
        type: 'user_prompt',
        role: 'user',
        prompt: '一张绿色全息海报',
        createdAt: 1,
      },
    ])
    getDraftMock.mockResolvedValue({
      topicId: 'topic-1',
      prompt: '继续细化光效',
      model: 'openai/gpt-image-2',
      size: 'auto',
      quality: 'high',
      n: 1,
      referenceImages: [],
    })

    const store = useChatStore()
    await store.bootstrap()

    expect(store.topics).toHaveLength(1)
    expect(store.currentTopicId).toBe('topic-1')
    expect(store.currentMessages).toHaveLength(1)
    expect(store.currentDraft).toMatchObject({
      prompt: '继续细化光效',
      size: 'auto',
    })
  })
})
