import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useChatStore } from './chat'

const {
  listTopicsMock,
  getMessagesMock,
  getDraftMock,
  createTopicMock,
  saveDraftMock,
  deleteTopicMock,
  getSettingsMock,
  updateSettingsMock,
} = vi.hoisted(() => ({
  listTopicsMock: vi.fn(),
  getMessagesMock: vi.fn(),
  getDraftMock: vi.fn(),
  createTopicMock: vi.fn(),
  saveDraftMock: vi.fn(),
  deleteTopicMock: vi.fn(),
  getSettingsMock: vi.fn(),
  updateSettingsMock: vi.fn(),
}))

vi.mock('@/services/chatApi', () => ({
  listTopics: listTopicsMock,
  getMessages: getMessagesMock,
  getDraft: getDraftMock,
  createTopic: createTopicMock,
  saveDraft: saveDraftMock,
  deleteTopic: deleteTopicMock,
}))

vi.mock('@/services/settingsApi', () => ({
  getSettings: getSettingsMock,
  updateSettings: updateSettingsMock,
}))

// chat.js 顶部 import 了 uploadApi，mock 掉避免真实网络调用
vi.mock('@/services/uploadApi', () => ({
  deleteReferenceImage: vi.fn().mockResolvedValue({ success: true }),
  registerReferenceFromMessage: vi.fn().mockResolvedValue({ referenceImages: [] }),
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
    deleteTopicMock.mockResolvedValue()
    getSettingsMock.mockResolvedValue({
      baseURL: 'http://127.0.0.1:4398',
      defaultModel: 'openai/gpt-image-2',
      defaultSize: 'auto',
      defaultQuality: 'high',
      defaultN: 1,
      requestMode: 'openrouter-image',
      timeout: 1200000,
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

  it('deleteTopic 调 API 并从前端状态移除主题/消息/草稿', async () => {
    const store = useChatStore()
    const topicId = await store.createTopic('海报概念')

    // 先塞入一条消息，验证删除后也被清理
    store.messages.value = store.messages.value || []
    store.addMessage({ topicId, type: 'user_prompt', role: 'user', prompt: '测试' })

    // 准备另一个主题作为切换目标
    createTopicMock.mockResolvedValueOnce({
      id: 'topic-2',
      title: '另一个主题',
      coverImage: null,
      lastPrompt: '',
      updatedAt: 2,
      createdAt: 2,
      messageCount: 0,
      status: 'idle',
    })
    await store.createTopic('另一个主题')
    // 现在 topics 有 topic-2（最新）和 topic-1
    expect(store.topics).toHaveLength(2)

    // 删除 topic-1
    await store.deleteTopic(topicId)

    expect(deleteTopicMock).toHaveBeenCalledWith(topicId)
    // topics 列表不再含 topic-1
    expect(store.topics.find((t) => t.id === topicId)).toBeUndefined()
    // messages 不再含 topic-1 的消息
    expect(store.messages.filter((m) => m.topicId === topicId)).toHaveLength(0)
    // drafts 不再含 topic-1
    expect(store.drafts[topicId]).toBeUndefined()
  })

  it('deleteTopic 删除当前主题时切到列表第一个', async () => {
    const store = useChatStore()

    // 创建两个主题
    createTopicMock.mockResolvedValueOnce({
      id: 'topic-a',
      title: '主题 A',
      coverImage: null,
      lastPrompt: '',
      updatedAt: 1,
      createdAt: 1,
      messageCount: 0,
      status: 'idle',
    })
    await store.createTopic('主题 A')

    createTopicMock.mockResolvedValueOnce({
      id: 'topic-b',
      title: '主题 B',
      coverImage: null,
      lastPrompt: '',
      updatedAt: 2,
      createdAt: 2,
      messageCount: 0,
      status: 'idle',
    })
    await store.createTopic('主题 B')

    // 当前主题是 topic-b（最新创建）
    expect(store.currentTopicId).toBe('topic-b')

    // 删除当前主题 topic-b
    await store.deleteTopic('topic-b')

    // 应切到列表第一个（topic-a）
    expect(store.currentTopicId).toBe('topic-a')
  })

  it('deleteTopic 删除最后一个主题时创建新主题', async () => {
    const store = useChatStore()
    const topicId = await store.createTopic('唯一主题')
    expect(store.topics).toHaveLength(1)

    // 删除后列表空，应自动创建新主题
    createTopicMock.mockResolvedValueOnce({
      id: 'topic-new',
      title: '新建创作',
      coverImage: null,
      lastPrompt: '',
      updatedAt: 3,
      createdAt: 3,
      messageCount: 0,
      status: 'idle',
    })

    await store.deleteTopic(topicId)

    // 应创建了新主题
    expect(createTopicMock).toHaveBeenCalledWith('新建创作')
    expect(store.topics).toHaveLength(1)
    expect(store.currentTopicId).toBe('topic-new')
  })
})
