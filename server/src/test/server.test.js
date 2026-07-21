import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'

describe('server bootstrap', () => {
  it('提供健康检查接口', async () => {
    const app = createApp({
      settingsRepository: {
        getSettings: async () => ({
          baseURL: 'https://openrouter.ai/api/v1',
          defaultModel: 'openai/gpt-image-2',
          defaultSize: 'auto',
          defaultQuality: 'high',
          defaultN: 1,
          requestMode: 'openrouter-image',
          timeout: 120000,
        }),
      },
    })

    const response = await request(app).get('/api/health')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ ok: true })
  })
})

describe('/api/health 健康检查端点', () => {
  it('注入 healthCheck 成功时返回 200 + db up', async () => {
    const healthCheck = vi.fn().mockResolvedValue()
    const app = createApp({ healthCheck })

    const response = await request(app).get('/api/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true, db: 'up' })
    expect(healthCheck).toHaveBeenCalledTimes(1)
  })

  it('注入 healthCheck 抛错时返回 503 + db down', async () => {
    const healthCheck = vi.fn().mockRejectedValue(new Error('connection refused'))
    const app = createApp({ healthCheck })

    const response = await request(app).get('/api/health')

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ ok: false, db: 'down' })
  })

  it('未注入 healthCheck 时返回 200 + db unknown（兼容测试场景）', async () => {
    const app = createApp({})

    const response = await request(app).get('/api/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true, db: 'unknown' })
  })
})

describe('错误处理中间件', () => {
  it('内部错误返回 500 + 通用消息，不泄露 error.message', async () => {
    const app = createApp({
      imageService: {
        // 模拟 DB 错误（含 SQL 细节），不应泄露给客户端
        generateImageMessage: async () => {
          throw new Error('ER_DUP_ENTRY: Duplicate entry \'topic-1\' for key \'PRIMARY\'')
        },
      },
    })

    const response = await request(app)
      .post('/api/topics/topic-1/messages/image')
      .send({ prompt: '测试', draft: {} })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ message: 'internal server error' })
    // 不应包含 SQL 细节
    expect(JSON.stringify(response.body)).not.toContain('ER_DUP_ENTRY')
  })

  it('客户端错误（带 4xx status）返回具体消息', async () => {
    const app = createApp({
      imageService: {
        generateImageMessage: async () => {
          const err = new Error('参考图已达上限（当前 16 张，最多 16 张）')
          err.status = 400
          throw err
        },
      },
    })

    const response = await request(app)
      .post('/api/topics/topic-1/messages/image')
      .send({ prompt: '测试', draft: {} })

    expect(response.status).toBe(400)
    expect(response.body.message).toBe('参考图已达上限（当前 16 张，最多 16 张）')
  })
})
