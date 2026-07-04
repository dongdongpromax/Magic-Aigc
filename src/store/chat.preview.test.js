import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useChatStore } from './chat'
import * as downloadModule from '@/utils/download'
import * as bridgeModule from '@/services/localImageBridge'

describe('chat preview persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('生成成功后先触发浏览器下载，再尝试写入项目目录', async () => {
    const store = useChatStore()
    const topicId = store.createTopic('测试主题')
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
    const topicId = store.createTopic('测试主题')
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
})
