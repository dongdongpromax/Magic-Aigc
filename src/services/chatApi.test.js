import { describe, expect, it, vi } from 'vitest'

const getMock = vi.fn(async () => ({ data: [] }))
const postMock = vi.fn(async () => ({ data: {} }))

vi.mock('axios', () => {
  return {
    default: {
      create: vi.fn(() => ({
        get: getMock,
        post: postMock,
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
})
