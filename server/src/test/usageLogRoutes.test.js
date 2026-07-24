import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'

/**
 * 构造一个可编程的 mock usageLogRepository
 * 各方法用 vi.fn 便于断言调用参数与返回值
 */
function createMockRepo(overrides = {}) {
  return {
    create: vi.fn().mockResolvedValue('log-1'),
    list: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    deleteById: vi.fn().mockResolvedValue(false),
    deleteAll: vi.fn().mockResolvedValue(0),
    ...overrides,
  }
}

describe('usage log routes', () => {
  it('GET /api/usage-logs 返回列表并透传 type 筛选', async () => {
    const list = vi.fn().mockResolvedValue([
      {
        id: 'log-1',
        type: 'image',
        status: 'success',
        providerName: 'OpenRouter',
        model: 'openai/gpt-image-2',
        prompt: '一只猫',
        durationMs: 1200,
        createdAt: 100,
      },
    ])
    const app = createApp({ usageLogRepository: createMockRepo({ list }) })

    const response = await request(app).get('/api/usage-logs').query({ type: 'image' })

    expect(response.status).toBe(200)
    expect(response.body).toHaveLength(1)
    expect(response.body[0].id).toBe('log-1')
    // type 透传到 repository.list
    expect(list).toHaveBeenCalledWith({ type: 'image', limit: 100, offset: 0 })
  })

  it('GET /api/usage-logs 非法 type 归一化为 undefined（不筛选）', async () => {
    const list = vi.fn().mockResolvedValue([])
    const app = createApp({ usageLogRepository: createMockRepo({ list }) })

    await request(app).get('/api/usage-logs').query({ type: 'unknown' })

    expect(list).toHaveBeenCalledWith({ type: undefined, limit: 100, offset: 0 })
  })

  it('GET /api/usage-logs 自定义 limit/offset 透传，limit 上限 500', async () => {
    const list = vi.fn().mockResolvedValue([])
    const app = createApp({ usageLogRepository: createMockRepo({ list }) })

    await request(app).get('/api/usage-logs').query({ limit: '9999', offset: '20' })

    expect(list).toHaveBeenCalledWith({ type: undefined, limit: 500, offset: 20 })
  })

  it('GET /api/usage-logs/:id 返回详情（含完整 4 阶段 JSON 负载）', async () => {
    const findById = vi.fn().mockResolvedValue({
      id: 'log-1',
      type: 'image',
      status: 'success',
      providerName: 'OpenRouter',
      model: 'openai/gpt-image-2',
      prompt: '一只猫',
      clientRequest: { prompt: '一只猫' },
      upstreamRequest: { model: 'openai/gpt-image-2' },
      upstreamResponse: { data: [] },
      clientResponse: { images: ['/files/a.png'] },
      durationMs: 1200,
      createdAt: 100,
    })
    const app = createApp({ usageLogRepository: createMockRepo({ findById }) })

    const response = await request(app).get('/api/usage-logs/log-1')

    expect(response.status).toBe(200)
    expect(response.body.id).toBe('log-1')
    expect(response.body.clientRequest).toEqual({ prompt: '一只猫' })
    expect(response.body.upstreamResponse).toEqual({ data: [] })
    expect(findById).toHaveBeenCalledWith('log-1')
  })

  it('GET /api/usage-logs/:id 不存在返回 404', async () => {
    const findById = vi.fn().mockResolvedValue(null)
    const app = createApp({ usageLogRepository: createMockRepo({ findById }) })

    const response = await request(app).get('/api/usage-logs/nope')

    expect(response.status).toBe(404)
    expect(response.body.message).toBe('日志不存在')
  })

  it('DELETE /api/usage-logs/:id 成功返回 success', async () => {
    const deleteById = vi.fn().mockResolvedValue(true)
    const app = createApp({ usageLogRepository: createMockRepo({ deleteById }) })

    const response = await request(app).delete('/api/usage-logs/log-1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ success: true })
    expect(deleteById).toHaveBeenCalledWith('log-1')
  })

  it('DELETE /api/usage-logs/:id 不存在返回 404', async () => {
    const deleteById = vi.fn().mockResolvedValue(false)
    const app = createApp({ usageLogRepository: createMockRepo({ deleteById }) })

    const response = await request(app).delete('/api/usage-logs/nope')

    expect(response.status).toBe(404)
    expect(response.body.message).toBe('日志不存在')
  })

  it('DELETE /api/usage-logs 清空全部并返回删除行数', async () => {
    const deleteAll = vi.fn().mockResolvedValue(42)
    const app = createApp({ usageLogRepository: createMockRepo({ deleteAll }) })

    const response = await request(app).delete('/api/usage-logs')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ success: true, deleted: 42 })
    expect(deleteAll).toHaveBeenCalledTimes(1)
  })

  it('未注入 usageLogRepository 时不注册日志路由（向后兼容）', async () => {
    const app = createApp({})

    // 未注入时 /api/usage-logs 不存在 → 404
    const response = await request(app).get('/api/usage-logs')
    expect(response.status).toBe(404)
  })
})
