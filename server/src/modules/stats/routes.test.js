import { describe, expect, it, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createStatsRoutes } from './routes.js'

describe('createStatsRoutes', () => {
  it('GET /stats/summary 返回 totalGenerations/imageCount/videoCount', async () => {
    const usageLogRepository = {
      countByType: vi.fn().mockResolvedValue({ image: 12, video: 5, total: 17 }),
    }
    const app = express()
    app.use('/api', createStatsRoutes({ usageLogRepository }))

    const res = await request(app).get('/api/stats/summary')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      totalGenerations: 17,
      imageCount: 12,
      videoCount: 5,
    })
    expect(usageLogRepository.countByType).toHaveBeenCalled()
  })

  it('repository 抛错时走错误中间件返回 500', async () => {
    const usageLogRepository = {
      countByType: vi.fn().mockRejectedValue(new Error('DB 超时')),
    }
    const app = express()
    app.use('/api', createStatsRoutes({ usageLogRepository }))
    app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }))

    const res = await request(app).get('/api/stats/summary')

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('DB 超时')
  })
})
