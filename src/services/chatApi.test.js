import { describe, expect, it, vi } from 'vitest'

const getMock = vi.fn(async () => ({ data: [] }))
const postMock = vi.fn(async () => ({ data: {} }))
const deleteMock = vi.fn(async () => ({ data: {} }))

vi.mock('axios', () => {
  return {
    default: {
      create: vi.fn(() => ({
        get: getMock,
        post: postMock,
        delete: deleteMock,
      })),
    },
  }
})

describe('chatApi', () => {
  it('从 /api/topics 拉主题列表', async () => {
    const { listTopics } = await import('./chatApi')
    const result = await listTopics()
    expect(result).toEqual([])
    expect(getMock).toHaveBeenCalledWith('/api/topics')
  })

  it('deleteTopic 调用 DELETE /api/topics/:topicId', async () => {
    const { deleteTopic } = await import('./chatApi')
    await deleteTopic('topic-1')

    expect(deleteMock).toHaveBeenCalledWith('/api/topics/topic-1')
  })
})
