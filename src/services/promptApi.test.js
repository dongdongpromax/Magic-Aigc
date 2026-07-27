import { beforeEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.fn()
const postMock = vi.fn()
const putMock = vi.fn()
const deleteMock = vi.fn()

vi.mock('./backendClient', () => ({
  backendClient: {
    get: getMock,
    post: postMock,
    put: putMock,
    delete: deleteMock,
  },
}))

describe('promptApi', () => {
  beforeEach(() => {
    getMock.mockReset()
    postMock.mockReset()
    putMock.mockReset()
    deleteMock.mockReset()
  })

  it('listPrompts 透传筛选参数到 /api/prompts', async () => {
    getMock.mockResolvedValue({ data: [{ id: 'p1' }] })
    const { listPrompts } = await import('./promptApi')

    const result = await listPrompts({ type: 'image', tag: '人物', keyword: '特写', limit: 50 })

    expect(getMock).toHaveBeenCalledWith('/api/prompts', {
      params: { type: 'image', tag: '人物', keyword: '特写', limit: 50 },
    })
    expect(result).toEqual([{ id: 'p1' }])
  })

  it('listPrompts 省略的参数不写入 params', async () => {
    getMock.mockResolvedValue({ data: [] })
    const { listPrompts } = await import('./promptApi')

    await listPrompts()

    expect(getMock).toHaveBeenCalledWith('/api/prompts', { params: {} })
  })

  it('getPromptDetail 请求 /api/prompts/:id', async () => {
    getMock.mockResolvedValue({ data: { id: 'p1', title: '标题' } })
    const { getPromptDetail } = await import('./promptApi')

    const result = await getPromptDetail('p1')

    expect(getMock).toHaveBeenCalledWith('/api/prompts/p1')
    expect(result).toEqual({ id: 'p1', title: '标题' })
  })

  it('createPrompt 以 JSON 体 POST 到 /api/prompts', async () => {
    const created = { id: 'new', title: 't', content: 'c', type: 'image' }
    postMock.mockResolvedValue({ data: created })
    const { createPrompt } = await import('./promptApi')

    const result = await createPrompt({ title: 't', content: 'c', type: 'image', tags: ['a'] })

    expect(postMock).toHaveBeenCalledWith('/api/prompts', {
      title: 't',
      content: 'c',
      type: 'image',
      tags: ['a'],
    })
    expect(result).toEqual(created)
  })

  it('updatePrompt 以 JSON 体 PUT 到 /api/prompts/:id', async () => {
    const updated = { id: 'p1', title: '新标题' }
    putMock.mockResolvedValue({ data: updated })
    const { updatePrompt } = await import('./promptApi')

    const result = await updatePrompt('p1', { title: '新标题' })

    expect(putMock).toHaveBeenCalledWith('/api/prompts/p1', { title: '新标题' })
    expect(result).toEqual(updated)
  })

  it('deletePrompt 请求 DELETE /api/prompts/:id', async () => {
    deleteMock.mockResolvedValue({ data: { success: true } })
    const { deletePrompt } = await import('./promptApi')

    const result = await deletePrompt('p1')

    expect(deleteMock).toHaveBeenCalledWith('/api/prompts/p1')
    expect(result).toEqual({ success: true })
  })

  it('uploadPromptAssets 用 FormData 多文件上传，设置 multipart 头', async () => {
    const items = [{ url: '/files/prompts/a.png', mimeType: 'image/png', kind: 'image', name: 'a.png' }]
    postMock.mockResolvedValue({ data: items })
    const { uploadPromptAssets } = await import('./promptApi')

    const file1 = new File(['x'], 'a.png', { type: 'image/png' })
    const file2 = new File(['y'], 'b.mp4', { type: 'video/mp4' })

    const result = await uploadPromptAssets([file1, file2])

    expect(postMock).toHaveBeenCalledTimes(1)
    const [url, body, config] = postMock.mock.calls[0]
    expect(url).toBe('/api/prompts/upload')
    expect(body).toBeInstanceOf(FormData)
    expect(config.headers['Content-Type']).toBe('multipart/form-data')
    expect(result).toEqual(items)
  })

  it('uploadPromptAssets 空数组时仍构造 FormData 请求', async () => {
    postMock.mockResolvedValue({ data: [] })
    const { uploadPromptAssets } = await import('./promptApi')

    await uploadPromptAssets([])

    expect(postMock).toHaveBeenCalledTimes(1)
    const [, body] = postMock.mock.calls[0]
    expect(body).toBeInstanceOf(FormData)
  })
})
