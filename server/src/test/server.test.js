import request from 'supertest'
import { describe, expect, it } from 'vitest'
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
