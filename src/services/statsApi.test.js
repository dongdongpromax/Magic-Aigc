import { beforeEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.fn()
vi.mock('./backendClient', () => ({
  backendClient: { get: getMock },
}))

describe('statsApi', () => {
  beforeEach(() => {
    getMock.mockReset()
  })

  it('getStatsSummary 调用 /api/stats/summary 并返回统计数据', async () => {
    getMock.mockResolvedValue({
      data: { totalGenerations: 17, imageCount: 12, videoCount: 5 },
    })

    const { getStatsSummary } = await import('./statsApi')
    const result = await getStatsSummary()

    expect(getMock).toHaveBeenCalledWith('/api/stats/summary')
    expect(result).toEqual({ totalGenerations: 17, imageCount: 12, videoCount: 5 })
  })
})
