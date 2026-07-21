import { describe, expect, it, vi } from 'vitest'
import { backendClient } from './backendClient'
import { uploadReferenceImages, deleteReferenceImage } from './uploadApi'

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
})
