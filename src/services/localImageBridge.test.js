import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveImageToProject } from './localImageBridge'

describe('saveImageToProject', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('把文件名和 base64 提交给本地桥接服务', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, relativePath: '/generated/test.png' }),
    })

    vi.stubGlobal('fetch', fetchMock)

    await saveImageToProject({
      topicTitle: '新建创作',
      fileName: 'test.png',
      imageBase64: 'ZmFrZQ==',
      subDir: 'generated',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:4399/api/save-image',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })

  it('桥接失败时抛出统一错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
      }),
    )

    await expect(
      saveImageToProject({
        topicTitle: '新建创作',
        fileName: 'test.png',
        imageBase64: 'ZmFrZQ==',
        subDir: 'generated',
      }),
    ).rejects.toThrow('项目目录保存失败')
  })
})
