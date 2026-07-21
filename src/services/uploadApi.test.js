import { describe, expect, it, vi } from 'vitest'
import { backendClient } from './backendClient'
import {
  deleteReferenceImage,
  registerReferenceFromMessage,
  uploadReferenceImages,
} from './uploadApi'

describe('uploadApi', () => {
  it('上传参考图时调用后端接口', async () => {
    const post = vi.spyOn(backendClient, 'post').mockResolvedValue({ data: [] })
    const file = new File(['demo'], 'scene.png', { type: 'image/png' })

    await uploadReferenceImages('topic-1', [file])

    expect(post).toHaveBeenCalledWith(
      '/api/topics/topic-1/references',
      expect.any(FormData),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'multipart/form-data',
        }),
      }),
    )
  })

  it('删除参考图时调用后端接口', async () => {
    const remove = vi.spyOn(backendClient, 'delete').mockResolvedValue({ data: { success: true } })

    await deleteReferenceImage('topic-1', 'ref-1')

    expect(remove).toHaveBeenCalledWith('/api/topics/topic-1/references/ref-1')
  })

  it('registerReferenceFromMessage 调用 from-message 端点并传 JSON body', async () => {
    const post = vi.spyOn(backendClient, 'post').mockResolvedValue({
      data: { referenceImages: [{ id: 'ref-1' }] },
    })

    const result = await registerReferenceFromMessage('topic-1', {
      messageId: 'msg-1',
      imageIds: ['img-1', 'img-2'],
    })

    expect(post).toHaveBeenCalledWith(
      '/api/topics/topic-1/references/from-message',
      { messageId: 'msg-1', imageIds: ['img-1', 'img-2'] },
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(result).toEqual({ referenceImages: [{ id: 'ref-1' }] })
  })
})
