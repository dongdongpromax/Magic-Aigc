import fs from 'node:fs/promises'
import path from 'node:path'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'

const tempPath = path.resolve('src/test/temp-scene.png')

describe('image routes', () => {
  afterEach(async () => {
    await fs.rm(tempPath, { force: true })
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
})
