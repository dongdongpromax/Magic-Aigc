import request from 'supertest'
import { describe, expect, it } from 'vitest'
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
})
