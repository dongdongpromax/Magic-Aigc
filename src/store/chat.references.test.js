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
  registerReferenceFromMessageMock,
  deleteReferenceImageMock,
} = vi.hoisted(() => ({
  listTopicsMock: vi.fn(),
  getMessagesMock: vi.fn(),
  getDraftMock: vi.fn(),
  createTopicMock: vi.fn(),
  saveDraftMock: vi.fn(),
  getSettingsMock: vi.fn(),
  updateSettingsMock: vi.fn(),
  registerReferenceFromMessageMock: vi.fn(),
  deleteReferenceImageMock: vi.fn(),
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

vi.mock('@/services/uploadApi', () => ({
  registerReferenceFromMessage: registerReferenceFromMessageMock,
  deleteReferenceImage: deleteReferenceImageMock,
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
      requestMode: 'openrouter-image',
      timeout: 120000,
    })
    updateSettingsMock.mockResolvedValue({})
    deleteReferenceImageMock.mockResolvedValue({ success: true })
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

  it('addReferenceFromMessage 成功时调 API 并更新 currentDraft.referenceImages', async () => {
    const returnedRefs = [
      {
        id: 'ref-new',
        name: 'test.png',
        filePath: '/files/generated/test.png',
        sourceMessageId: 'msg-1',
      },
    ]
    registerReferenceFromMessageMock.mockResolvedValue({ referenceImages: returnedRefs })

    const store = useChatStore()
    await store.createTopic('测试主题')

    await store.addReferenceFromMessage({
      id: 'msg-1',
      images: [{ id: 'img-1', url: '/files/generated/test.png' }],
    })

    expect(registerReferenceFromMessageMock).toHaveBeenCalledWith('topic-1', {
      messageId: 'msg-1',
      imageIds: ['img-1'],
    })
    // 前端 referenceImages 应被后端返回值替换
    expect(store.currentDraft.referenceImages).toEqual(returnedRefs)
    // lastError 应被清空
    expect(store.lastError).toBe('')
  })

  it('addReferenceFromMessage 已达 16 张上限时设 lastError 且不调 API', async () => {
    const store = useChatStore()
    await store.createTopic('测试主题')

    // 预填 16 张参考图，达到上限
    const existing = Array.from({ length: 16 }, (_, i) => ({
      id: `ref-${i}`,
      name: `${i}.png`,
      filePath: `/files/references/${i}.png`,
      type: 'image/png',
    }))
    store.currentDraft.referenceImages = existing

    await store.addReferenceFromMessage({
      id: 'msg-1',
      images: [{ id: 'img-1', url: '/files/generated/test.png' }],
    })

    // 不应调 API
    expect(registerReferenceFromMessageMock).not.toHaveBeenCalled()
    // 应设 lastError 提示上限
    expect(store.lastError).toContain('16')
  })

  it('addReferenceFromMessage API 失败时设 lastError', async () => {
    registerReferenceFromMessageMock.mockRejectedValue(new Error('网络错误'))

    const store = useChatStore()
    await store.createTopic('测试主题')

    await store.addReferenceFromMessage({
      id: 'msg-1',
      images: [{ id: 'img-1', url: '/files/generated/test.png' }],
    })

    expect(store.lastError).toContain('网络错误')
    // 失败时不应改写 referenceImages
    expect(store.currentDraft.referenceImages).toEqual([])
  })

  it('addReferenceFromMessage 消息无图片时设 lastError 提示无可设参考图', async () => {
    const store = useChatStore()
    await store.createTopic('测试主题')

    await store.addReferenceFromMessage({
      id: 'msg-1',
      images: [],
    })

    expect(registerReferenceFromMessageMock).not.toHaveBeenCalled()
    expect(store.lastError).toContain('没有可设为参考图')
  })
})
