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

describe('chat reference images', () => {
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
      title: '测试主题',
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

  it('支持向当前草稿追加多张参考图并删除单张', async () => {
    const store = useChatStore()
    await store.createTopic('测试主题')

    store.addReferenceImages([
      { id: 'ref-1', name: 'a.png', url: 'blob:a', dataUrl: 'data:a', type: 'image/png' },
      { id: 'ref-2', name: 'b.png', url: 'blob:b', dataUrl: 'data:b', type: 'image/png' },
    ])

    expect(store.currentDraft.referenceImages).toHaveLength(2)

    store.removeReferenceImage('ref-1')

    expect(store.currentDraft.referenceImages).toEqual([
      expect.objectContaining({ id: 'ref-2' }),
    ])
  })

  it('变更参考图时同步远程草稿，且不再写入 localStorage', async () => {
    const store = useChatStore()
    await store.createTopic('测试主题')

    store.addReferenceImages([
      {
        id: 'ref-1',
        name: 'a.png',
        url: 'blob:a',
        dataUrl: 'data:image/png;base64,AAAA',
        type: 'image/png',
        sourceMessageId: null,
      },
    ])

    await vi.runAllTimersAsync()

    expect(saveDraftMock).toHaveBeenCalled()
    expect(localStorage.getItem('ai-chat-draw:chat-store')).toBeNull()
  })
})
