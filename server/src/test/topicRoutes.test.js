import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'

describe('topic routes', () => {
  it('读取主题列表和草稿', async () => {
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
      topicRepository: {
        listTopics: async () => [
          {
            id: 'topic-1',
            title: '本地主题',
            coverImage: null,
            lastPrompt: '赛博大厅',
            messageCount: 1,
            status: 'idle',
            updatedAt: 1,
            createdAt: 1,
          },
        ],
        listMessages: async () => [],
      },
      draftRepository: {
        getDraft: async () => ({
          topicId: 'topic-1',
          prompt: '',
          model: 'openai/gpt-image-2',
          size: 'auto',
          quality: 'high',
          n: 1,
          referenceImages: [],
        }),
      },
    })

    const topicsResponse = await request(app).get('/api/topics')
    const draftResponse = await request(app).get('/api/topics/topic-1/draft')

    expect(topicsResponse.status).toBe(200)
    expect(topicsResponse.body[0].title).toBe('本地主题')
    expect(draftResponse.status).toBe(200)
    expect(draftResponse.body.size).toBe('auto')
  })

  it('DELETE /topics/:topicId 成功返回 204', async () => {
    const deleteTopic = vi.fn().mockResolvedValue({ success: true })
    const app = createApp({
      topicService: { deleteTopic },
    })

    const response = await request(app).delete('/api/topics/topic-1')

    expect(response.status).toBe(204)
    expect(deleteTopic).toHaveBeenCalledWith('topic-1')
  })

  it('DELETE /topics/:topicId 主题不存在返回 404', async () => {
    const deleteTopic = vi.fn().mockImplementation(() => {
      const err = new Error('主题不存在')
      err.status = 404
      throw err
    })
    const app = createApp({
      topicService: { deleteTopic },
    })

    const response = await request(app).delete('/api/topics/topic-x')

    expect(response.status).toBe(404)
    expect(response.body.message).toBe('主题不存在')
  })

  it('DELETE /topics/:topicId 未注入 topicService 时走错误中间件返回 500', async () => {
    // 不注入 topicService，路由抛 err.status = 501，
    // 但 501 属于 5xx，错误中间件归一化为 500 + 通用消息（安全设计：不泄露 5xx 细节）
    const app = createApp({})

    const response = await request(app).delete('/api/topics/topic-1')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ message: 'internal server error' })
  })
})
