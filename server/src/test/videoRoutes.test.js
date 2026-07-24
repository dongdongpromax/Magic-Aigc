import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app.js'

/**
 * 视频生成路由单测
 *
 * 参考 imageRoutes.test.js 风格：仅注入 videoService（其余路由按需触发，互不干扰）。
 */
describe('video routes', () => {
  it('生成视频接口返回 201 与结果', async () => {
    const app = createApp({
      videoService: {
        generateVideoMessage: async () => ({
          videos: [{ url: '/files/generated/demo.mp4', localPath: '/files/generated/demo.mp4' }],
          providerName: '火山方舟',
          ratio: '16:9',
          duration: 5,
        }),
      },
    })

    const response = await request(app).post('/api/topics/topic-1/messages/video').send({
      prompt: '一只猫奔跑',
      draft: {
        model: 'doubao-seedance-2-0-260128',
        providerId: 'volcengine',
        ratio: '16:9',
        duration: 5,
      },
    })

    expect(response.status).toBe(201)
    expect(response.body.videos[0].url).toBe('/files/generated/demo.mp4')
    expect(response.body.providerName).toBe('火山方舟')
    expect(response.body.ratio).toBe('16:9')
    expect(response.body.duration).toBe(5)
  })

  it('videoService 抛 expose 错误时透传状态码与上游原因（不脱敏为 500）', async () => {
    const app = createApp({
      videoService: {
        generateVideoMessage: async () => {
          const err = new Error('视频生成失败：内容不合规')
          err.status = 502
          err.expose = true
          throw err
        },
      },
    })

    const response = await request(app)
      .post('/api/topics/topic-1/messages/video')
      .send({ prompt: 'p', draft: { model: 'm' } })

    // 502 是上游可读错误，标记 expose 后透传给前端（而非内部错误 500）
    expect(response.status).toBe(502)
    expect(response.body.message).toContain('内容不合规')
  })

  it('videoService 抛未标记 expose 的内部错误时脱敏为 500', async () => {
    const app = createApp({
      videoService: {
        generateVideoMessage: async () => {
          throw new Error('select * from messages failed')
        },
      },
    })

    const response = await request(app)
      .post('/api/topics/topic-1/messages/video')
      .send({ prompt: 'p', draft: { model: 'm' } })

    // 内部错误（SQL 细节）不暴露给客户端
    expect(response.status).toBe(500)
    expect(response.body.message).toBe('internal server error')
  })
})
