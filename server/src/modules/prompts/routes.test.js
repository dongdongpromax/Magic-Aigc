import { describe, expect, it, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { MulterError } from 'multer'
import { createPromptRoutes } from './routes.js'

/**
 * 构造 mock promptRepository
 * 默认所有方法返回空值，可在测试中覆盖具体实现
 */
function createMockRepo(overrides = {}) {
  return {
    list: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue('new-id'),
    update: vi.fn().mockResolvedValue(true),
    deleteById: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

/** 构造 mock fileStorage，记录删除调用 */
function createMockFileStorage() {
  return {
    writePromptAsset: vi.fn().mockResolvedValue({ fileName: 'a.png', filePath: '/files/prompts/a.png' }),
    deletePromptAsset: vi.fn().mockResolvedValue(true),
  }
}

function buildApp(repo, fileStorage) {
  const app = express()
  app.use(express.json())
  app.use('/api', createPromptRoutes({ promptRepository: repo, fileStorage }))
  // 错误中间件：透传 status 与 message（与 app.js 的 isClientError 逻辑对齐）
  app.use((err, _req, res, _next) => {
    const status = err.status || (err instanceof MulterError ? 400 : 500)
    res.status(status).json({ message: err.message })
  })
  return app
}

describe('createPromptRoutes', () => {
  it('GET /prompts 透传 type/tag/keyword/limit 给 repository.list', async () => {
    const repo = createMockRepo({ list: vi.fn().mockResolvedValue([{ id: 'p1' }]) })
    const app = buildApp(repo, createMockFileStorage())

    const res = await request(app).get('/api/prompts?type=image&tag=人物&keyword=特写&limit=50')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ id: 'p1' }])
    expect(repo.list).toHaveBeenCalledWith({
      type: 'image',
      tag: '人物',
      keyword: '特写',
      limit: 50,
    })
  })

  it('GET /prompts 不带参数时 type/tag/keyword 为 undefined', async () => {
    const repo = createMockRepo({ list: vi.fn().mockResolvedValue([]) })
    const app = buildApp(repo, createMockFileStorage())

    await request(app).get('/api/prompts')

    expect(repo.list).toHaveBeenCalledWith({
      type: undefined,
      tag: undefined,
      keyword: undefined,
      limit: 200,
    })
  })

  it('GET /prompts/:id 返回详情', async () => {
    const repo = createMockRepo({
      findById: vi.fn().mockResolvedValue({ id: 'p1', title: '标题' }),
    })
    const app = buildApp(repo, createMockFileStorage())

    const res = await request(app).get('/api/prompts/p1')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: 'p1', title: '标题' })
    expect(repo.findById).toHaveBeenCalledWith('p1')
  })

  it('GET /prompts/:id 不存在返回 404', async () => {
    const repo = createMockRepo()
    const app = buildApp(repo, createMockFileStorage())

    const res = await request(app).get('/api/prompts/nope')

    expect(res.status).toBe(404)
    expect(res.body.message).toBe('提示词不存在')
  })

  it('POST /prompts 校验通过后调用 create 并返回 201 + 详情', async () => {
    const created = { id: 'new-id', title: '标题', content: '正文', type: 'image', tags: [], assets: [] }
    const repo = createMockRepo({
      create: vi.fn().mockResolvedValue('new-id'),
      findById: vi.fn().mockResolvedValue(created),
    })
    const app = buildApp(repo, createMockFileStorage())

    const res = await request(app)
      .post('/api/prompts')
      .send({ title: '标题', content: '正文', type: 'image', tags: ['a'], assets: [] })

    expect(res.status).toBe(201)
    expect(res.body).toEqual(created)
    expect(repo.create).toHaveBeenCalledWith({
      title: '标题',
      content: '正文',
      type: 'image',
      tags: ['a'],
      assets: [],
    })
  })

  it('POST /prompts 缺少必填字段返回 400', async () => {
    const repo = createMockRepo()
    const app = buildApp(repo, createMockFileStorage())

    const res = await request(app).post('/api/prompts').send({ title: '仅标题' })

    expect(res.status).toBe(400)
    expect(res.body.message).toContain('不能为空')
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('POST /prompts type 非法返回 400', async () => {
    const repo = createMockRepo()
    const app = buildApp(repo, createMockFileStorage())

    const res = await request(app)
      .post('/api/prompts')
      .send({ title: 't', content: 'c', type: 'invalid' })

    expect(res.status).toBe(400)
    expect(res.body.message).toContain('类型')
  })

  it('PUT /prompts/:id 部分更新成功返回最新详情', async () => {
    const updated = { id: 'p1', title: '新标题', content: 'c', type: 'image' }
    const repo = createMockRepo({
      update: vi.fn().mockResolvedValue(true),
      findById: vi.fn().mockResolvedValue(updated),
    })
    const app = buildApp(repo, createMockFileStorage())

    const res = await request(app).put('/api/prompts/p1').send({ title: '新标题' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual(updated)
    expect(repo.update).toHaveBeenCalledWith('p1', { title: '新标题' })
  })

  it('PUT /prompts/:id 不存在返回 404', async () => {
    const repo = createMockRepo({ update: vi.fn().mockResolvedValue(false) })
    const app = buildApp(repo, createMockFileStorage())

    const res = await request(app).put('/api/prompts/nope').send({ title: 'x' })

    expect(res.status).toBe(404)
  })

  it('DELETE /prompts/:id 删除记录并 best-effort 清理素材文件', async () => {
    const repo = createMockRepo({
      findById: vi.fn().mockResolvedValue({
        id: 'p1',
        assets: [
          { url: '/files/prompts/a.png', mimeType: 'image/png', kind: 'image', name: 'a.png' },
          { url: '/files/prompts/b.mp4', mimeType: 'video/mp4', kind: 'video', name: 'b.mp4' },
        ],
      }),
      deleteById: vi.fn().mockResolvedValue(true),
    })
    const fileStorage = createMockFileStorage()
    const app = buildApp(repo, fileStorage)

    const res = await request(app).delete('/api/prompts/p1')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
    expect(repo.deleteById).toHaveBeenCalledWith('p1')
    // 两个素材文件都应被尝试删除
    expect(fileStorage.deletePromptAsset).toHaveBeenCalledTimes(2)
    expect(fileStorage.deletePromptAsset).toHaveBeenCalledWith('/files/prompts/a.png')
    expect(fileStorage.deletePromptAsset).toHaveBeenCalledWith('/files/prompts/b.mp4')
  })

  it('DELETE /prompts/:id 不存在返回 404', async () => {
    const repo = createMockRepo({ findById: vi.fn().mockResolvedValue(null) })
    const app = buildApp(repo, createMockFileStorage())

    const res = await request(app).delete('/api/prompts/nope')

    expect(res.status).toBe(404)
  })

  it('DELETE /prompts/:id 单个素材清理失败不影响整体响应', async () => {
    const repo = createMockRepo({
      findById: vi.fn().mockResolvedValue({
        id: 'p1',
        assets: [{ url: '/files/prompts/a.png' }],
      }),
      deleteById: vi.fn().mockResolvedValue(true),
    })
    const fileStorage = createMockFileStorage()
    fileStorage.deletePromptAsset.mockRejectedValue(new Error('文件不存在'))
    const app = buildApp(repo, fileStorage)

    const res = await request(app).delete('/api/prompts/p1')

    expect(res.status).toBe(200)
  })

  it('POST /prompts/upload 上传成功返回素材元数据', async () => {
    const repo = createMockRepo()
    const fileStorage = createMockFileStorage()
    fileStorage.writePromptAsset
      .mockResolvedValueOnce({ fileName: 'a.png', filePath: '/files/prompts/a.png' })
      .mockResolvedValueOnce({ fileName: 'b.mp4', filePath: '/files/prompts/b.mp4' })
    const app = buildApp(repo, fileStorage)

    const res = await request(app)
      .post('/api/prompts/upload')
      .attach('files', Buffer.from('png-data'), { filename: 'a.png', contentType: 'image/png' })
      .attach('files', Buffer.from('mp4-data'), { filename: 'b.mp4', contentType: 'video/mp4' })

    expect(res.status).toBe(201)
    expect(res.body).toHaveLength(2)
    expect(res.body[0]).toMatchObject({
      url: '/files/prompts/a.png',
      mimeType: 'image/png',
      kind: 'image',
      name: 'a.png',
    })
    expect(res.body[1]).toMatchObject({
      url: '/files/prompts/b.mp4',
      mimeType: 'video/mp4',
      kind: 'video',
      name: 'b.mp4',
    })
  })

  it('POST /prompts/upload 未传文件返回 400', async () => {
    const repo = createMockRepo()
    const app = buildApp(repo, createMockFileStorage())

    const res = await request(app).post('/api/prompts/upload')

    expect(res.status).toBe(400)
    expect(res.body.message).toContain('未接收到文件')
  })

  it('POST /prompts/upload 非白名单类型返回 400（multer fileFilter）', async () => {
    const repo = createMockRepo()
    const app = buildApp(repo, createMockFileStorage())

    const res = await request(app)
      .post('/api/prompts/upload')
      .attach('files', Buffer.from('txt'), { filename: 'a.txt', contentType: 'text/plain' })

    expect(res.status).toBe(400)
  })
})
