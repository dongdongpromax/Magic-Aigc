/**
 * chat store 图片生成预览/持久化测试
 *
 * P1-4 改造后：completeImageGeneration 不再调用 localImageBridge.saveImageToProject，
 * 而是直接使用后端 generateImageMessage 返回的 localPath/savedToProject。
 * 本测试覆盖：
 *   1. 后端已保存（返回 localPath）→ 触发浏览器下载 + 使用后端 localPath + 不调桥接
 *   2. 后端未保存（仅 data URL）→ 保留图片消息但 savedToProject = false
 *   3. 图片消息不写入 localStorage（前端只存内存）
 *   4. 后端已保存的图片不会再次调用本地桥接写盘
 */
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
      requestMode: 'openrouter-image',
      timeout: 1200000,
    })
    updateSettingsMock.mockResolvedValue({})
  })

  it('生成成功后触发浏览器下载，并使用后端返回的 localPath', async () => {
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
    // P1-4: 桥接不再被调用，spy 仅用于断言「未调用」
    vi.spyOn(bridgeModule, 'saveImageToProject').mockResolvedValue({
      success: true,
      relativePath: '/generated/test.png',
    })

    await store.completeImageGeneration(
      {
        // 后端返回 localPath + savedToProject，前端直接使用
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

    expect(downloadModule.triggerBrowserDownload).toHaveBeenCalled()
    // P1-4: 桥接不应被调用
    expect(bridgeModule.saveImageToProject).not.toHaveBeenCalled()
    expect(store.currentMessages.at(-1).images[0]).toMatchObject({
      localPath: '/files/generated/test.png',
      savedToProject: true,
    })
  })

  it('后端未保存时仍保留图片消息且 savedToProject 为 false', async () => {
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
        // 后端仅返回 data URL，无 localPath
        images: [{ id: 'img-1', url: 'data:image/png;base64,ZmFrZQ==', b64: 'ZmFrZQ==' }],
      },
      '赛博山脉',
    )

    // P1-4: 无 localPath 时 localPath 为空、savedToProject 为 false
    expect(store.currentMessages.at(-1).images[0]).toMatchObject({
      localPath: '',
      savedToProject: false,
    })
    // 桥接不应被调用
    expect(bridgeModule.saveImageToProject).not.toHaveBeenCalled()
  })

  it('图片消息仅保留内存状态，不再写入 localStorage', async () => {
    const store = useChatStore()
    const topicId = await store.createTopic('测试主题')
    store.currentTopicId = topicId

    vi.spyOn(downloadModule, 'buildTimestamp').mockReturnValue('20260703-224500')
    vi.spyOn(downloadModule, 'triggerBrowserDownload').mockImplementation(() => {})

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
