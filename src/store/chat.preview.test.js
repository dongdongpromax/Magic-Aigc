import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useChatStore } from './chat'
import * as downloadModule from '@/utils/download'
import * as bridgeModule from '@/services/localImageBridge'

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

describe('chat preview persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    setActivePinia(createPinia())
    vi.restoreAllMocks()
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

  it('生成成功后先触发浏览器下载，再尝试写入项目目录', async () => {
    const store = useChatStore()
    const topicId = await store.createTopic('测试主题')
    const draft = store.drafts[topicId]

    store.currentTopicId = topicId
    draft.model = 'openai/gpt-image-2'
    draft.size = '1024x1024'
    draft.quality = 'high'
    draft.n = 1

    vi.spyOn(downloadModule, 'buildTimestamp').mockReturnValue('20260703-224500')
    vi.spyOn(downloadModule, 'triggerBrowserDownload').mockImplementation(() => {})
    vi.spyOn(bridgeModule, 'saveImageToProject').mockResolvedValue({
      success: true,
      relativePath: '/generated/test.png',
    })

    await store.completeImageGeneration(
      {
        images: [{ id: 'img-1', url: 'data:image/png;base64,ZmFrZQ==', b64: 'ZmFrZQ==' }],
      },
      '赛博山脉',
    )

    expect(downloadModule.triggerBrowserDownload).toHaveBeenCalled()
    expect(bridgeModule.saveImageToProject).toHaveBeenCalled()
    expect(store.currentMessages.at(-1).images[0]).toMatchObject({
      localPath: '/generated/test.png',
      savedToProject: true,
    })
  })

  it('本地桥接失败时仍然保留图片消息', async () => {
    const store = useChatStore()
    const topicId = await store.createTopic('测试主题')
    store.currentTopicId = topicId

    vi.spyOn(downloadModule, 'buildTimestamp').mockReturnValue('20260703-224500')
    vi.spyOn(downloadModule, 'triggerBrowserDownload').mockImplementation(() => {})
    vi.spyOn(bridgeModule, 'saveImageToProject').mockRejectedValue(new Error('bridge error'))

    await store.completeImageGeneration(
      {
        images: [{ id: 'img-1', url: 'data:image/png;base64,ZmFrZQ==', b64: 'ZmFrZQ==' }],
      },
      '赛博山脉',
    )

    expect(store.currentMessages.at(-1).images[0]).toMatchObject({
      localPath: '',
      savedToProject: false,
    })
  })

  it('图片消息仅保留内存状态，不再写入 localStorage', async () => {
    const store = useChatStore()
    const topicId = await store.createTopic('测试主题')
    store.currentTopicId = topicId

    vi.spyOn(downloadModule, 'buildTimestamp').mockReturnValue('20260703-224500')
    vi.spyOn(downloadModule, 'triggerBrowserDownload').mockImplementation(() => {})
    vi.spyOn(bridgeModule, 'saveImageToProject').mockResolvedValue({
      success: true,
      relativePath: '/generated/test.png',
    })

    await store.completeImageGeneration(
      {
        images: [{ id: 'img-1', url: 'data:image/png;base64,ZmFrZQ==', b64: 'ZmFrZQ==' }],
      },
      '赛博山脉',
    )

    expect(localStorage.getItem('ai-chat-draw:chat-store')).toBeNull()
  })

  it('后端已保存的图片不会再次调用本地桥接写盘', async () => {
    const store = useChatStore()
    const topicId = await store.createTopic('测试主题')
    store.currentTopicId = topicId

    vi.spyOn(downloadModule, 'buildTimestamp').mockReturnValue('20260703-224500')
    vi.spyOn(downloadModule, 'triggerBrowserDownload').mockImplementation(() => {})
    vi.spyOn(bridgeModule, 'saveImageToProject').mockResolvedValue({
      success: true,
      relativePath: '/generated/test.png',
    })

    await store.completeImageGeneration(
      {
        images: [
          {
            id: 'img-1',
            url: '/files/generated/test.png',
            localPath: '/files/generated/test.png',
            savedToProject: true,
          },
        ],
      },
      '赛博山脉',
    )

    expect(bridgeModule.saveImageToProject).not.toHaveBeenCalled()
    expect(store.currentMessages.at(-1).images[0]).toMatchObject({
      localPath: '/files/generated/test.png',
      savedToProject: true,
    })
  })
})
