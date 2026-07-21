import fs from 'node:fs/promises'
import path from 'node:path'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'

const tempPath = path.resolve('src/test/temp-scene.png')
const tempTxtPath = path.resolve('src/test/temp-note.txt')

describe('image routes', () => {
  afterEach(async () => {
    await fs.rm(tempPath, { force: true })
    await fs.rm(tempTxtPath, { force: true })
  })

  it('上传参考图后返回文件路径', async () => {
    const app = createApp({
      imageService: {
        saveReferenceUpload: async () => [
          {
            id: 'ref-1',
            name: 'scene.png',
            filePath: '/files/references/scene.png',
            mimeType: 'image/png',
            sourceMessageId: null,
          },
        ],
      },
    })

    await fs.writeFile(tempPath, 'fake')

    const response = await request(app)
      .post('/api/topics/topic-1/references')
      .attach('files', tempPath)

    expect(response.status).toBe(201)
    expect(response.body[0].filePath).toBe('/files/references/scene.png')
  })

  it('删除参考图时返回成功状态', async () => {
    const app = createApp({
      imageService: {
        deleteReferenceImage: async () => ({ success: true }),
      },
    })

    const response = await request(app).delete('/api/topics/topic-1/references/ref-1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ success: true })
  })

  it('生成图片接口返回生成结果', async () => {
    const app = createApp({
      imageService: {
        generateImageMessage: async () => ({
          images: [{ url: '/files/generated/demo.png', localPath: '/files/generated/demo.png' }],
          revisedPrompt: 'refined',
        }),
      },
    })

    const response = await request(app).post('/api/topics/topic-1/messages/image').send({
      prompt: '赛博大厅',
      draft: {
        model: 'openai/gpt-image-2',
        size: 'auto',
      },
    })

    expect(response.status).toBe(201)
    expect(response.body.images[0].url).toBe('/files/generated/demo.png')
  })

  it('上传 text/plain 文件返回 400（fileFilter 拒绝非图片类型）', async () => {
    const app = createApp({
      imageService: {
        saveReferenceUpload: async () => [],
      },
    })

    // 写一个真实的 text 文件，mimetype 由扩展名推断为 text/plain
    await fs.writeFile(tempTxtPath, 'hello world')

    const response = await request(app)
      .post('/api/topics/topic-1/references')
      .attach('files', tempTxtPath)

    // multer fileFilter 拒绝 → MulterError → 错误中间件返回 400
    expect(response.status).toBe(400)
  })

  it('上传超过 10MB 的文件返回错误（multer LIMIT_FILE_SIZE）', async () => {
    const app = createApp({
      imageService: {
        saveReferenceUpload: async () => [],
      },
    })

    // 构造 11MB 的 buffer
    const bigBuffer = Buffer.alloc(11 * 1024 * 1024 + 1, 0)

    const response = await request(app)
      .post('/api/topics/topic-1/references')
      .attach('files', bigBuffer, 'big.png')

    // multer 超限 → MulterError → 错误中间件返回 400
    expect(response.status).toBe(400)
  })

  it('POST /topics/:topicId/references/from-message 成功返回 201 + referenceImages', async () => {
    const app = createApp({
      imageService: {
        registerReferenceFromMessage: async () => ({
          referenceImages: [
            {
              id: 'ref-1',
              name: 'test.png',
              filePath: '/files/generated/test.png',
              sourceMessageId: 'msg-1',
            },
          ],
        }),
      },
    })

    const response = await request(app)
      .post('/api/topics/topic-1/references/from-message')
      .send({ messageId: 'msg-1', imageIds: ['img-1'] })

    expect(response.status).toBe(201)
    expect(response.body.referenceImages).toHaveLength(1)
    expect(response.body.referenceImages[0]).toMatchObject({
      id: 'ref-1',
      sourceMessageId: 'msg-1',
    })
  })

  it('POST /topics/:topicId/references/from-message imageIds 为空返回 400', async () => {
    const app = createApp({
      imageService: {
        registerReferenceFromMessage: async () => {
          const err = new Error('messageId 和 imageIds 不能为空')
          err.status = 400
          throw err
        },
      },
    })

    const response = await request(app)
      .post('/api/topics/topic-1/references/from-message')
      .send({ messageId: 'msg-1', imageIds: [] })

    expect(response.status).toBe(400)
    expect(response.body.message).toBe('messageId 和 imageIds 不能为空')
  })

  it('POST /topics/:topicId/references/from-message 消息不属于主题返回 404', async () => {
    const app = createApp({
      imageService: {
        registerReferenceFromMessage: async () => {
          const err = new Error('消息不存在或不属于该主题')
          err.status = 404
          throw err
        },
      },
    })

    const response = await request(app)
      .post('/api/topics/topic-1/references/from-message')
      .send({ messageId: 'msg-x', imageIds: ['img-1'] })

    expect(response.status).toBe(404)
    expect(response.body.message).toBe('消息不存在或不属于该主题')
  })
})
