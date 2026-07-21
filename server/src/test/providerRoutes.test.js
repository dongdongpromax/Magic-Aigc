import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import { isImageModelId } from '../modules/providers/providersService.js'
import { buildImagePayload } from '../modules/providers/imagePayload.js'

/** 内存版 providersService 假实现 */
function createFakeService() {
  const providers = [
    {
      id: 'openrouter',
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKeys: ['sk-a'],
      enabled: true,
      requestMode: 'openrouter-image',
      color: '#6366f1',
      isBuiltin: true,
      enabledModels: [{ modelId: 'openai/gpt-image-2', displayName: 'GPT Image 2' }],
      modelCount: 1,
      enabledModelCount: 1,
    },
  ]
  return {
    providers,
    listProviders: vi.fn(async () => providers),
    createProvider: vi.fn(async (data) => ({
      id: 'custom-1',
      enabled: true,
      apiKeys: [],
      ...data,
    })),
    updateProvider: vi.fn(async (id, patch) => ({ id, ...providers[0], ...patch })),
    setProviderEnabled: vi.fn(async () => {}),
    deleteProvider: vi.fn(async () => {}),
    checkProvider: vi.fn(async () => ({
      total: 1,
      available: 1,
      results: [{ tail: 'k-a', ok: true, latencyMs: 12 }],
    })),
    listModels: vi.fn(async () => [
      { modelId: 'openai/gpt-image-2', enabled: true, isImage: true, groupName: 'openai' },
    ]),
    fetchModels: vi.fn(async () => ({
      added: 2,
      updated: 1,
      total: 3,
      autoEnabled: 1,
      staleModelIds: [],
    })),
    addModel: vi.fn(async (pid, data) => ({ modelId: data.modelId, enabled: true })),
    setModelEnabled: vi.fn(async () => {}),
    deleteModel: vi.fn(async () => {}),
  }
}

describe('providerRoutes', () => {
  let service
  let app

  beforeEach(() => {
    service = createFakeService()
    app = createApp({ providersService: service })
  })

  it('GET /api/providers 返回列表', async () => {
    const res = await request(app).get('/api/providers')
    expect(res.status).toBe(200)
    expect(res.body[0]).toMatchObject({ id: 'openrouter', apiKeys: ['sk-a'] })
  })

  it('POST /api/providers 缺名称/地址时 400', async () => {
    const res = await request(app).post('/api/providers').send({ name: '' })
    expect(res.status).toBe(400)
    expect(service.createProvider).not.toHaveBeenCalled()
  })

  it('POST /api/providers 创建自定义中转站', async () => {
    const res = await request(app)
      .post('/api/providers')
      .send({ name: '我的站', baseUrl: 'https://x.example.com/v1' })
    expect(res.status).toBe(201)
    expect(service.createProvider).toHaveBeenCalledWith(
      expect.objectContaining({ name: '我的站', baseUrl: 'https://x.example.com/v1' }),
    )
  })

  it('PUT /api/providers/:id 更新字段', async () => {
    const res = await request(app)
      .put('/api/providers/openrouter')
      .send({ apiKeys: ['sk-new'], baseUrl: 'https://new.example.com/v1' })
    expect(res.status).toBe(200)
    expect(service.updateProvider).toHaveBeenCalledWith('openrouter', {
      apiKeys: ['sk-new'],
      baseUrl: 'https://new.example.com/v1',
    })
  })

  it('PATCH /api/providers/:id/enabled 切换开关', async () => {
    const res = await request(app)
      .patch('/api/providers/openrouter/enabled')
      .send({ enabled: false })
    expect(res.status).toBe(200)
    expect(service.setProviderEnabled).toHaveBeenCalledWith('openrouter', false)
  })

  it('DELETE /api/providers/:id 删除', async () => {
    const res = await request(app).delete('/api/providers/openrouter')
    expect(res.status).toBe(200)
    expect(service.deleteProvider).toHaveBeenCalledWith('openrouter')
  })

  it('POST /api/providers/:id/check 返回 Key 检测报告', async () => {
    const res = await request(app).post('/api/providers/openrouter/check')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ total: 1, available: 1 })
  })

  it('GET /api/providers/:id/models 返回模型列表', async () => {
    const res = await request(app).get('/api/providers/openrouter/models')
    expect(res.status).toBe(200)
    expect(res.body[0].modelId).toBe('openai/gpt-image-2')
  })

  it('POST /api/providers/:id/models/fetch 返回合并统计', async () => {
    const res = await request(app).post('/api/providers/openrouter/models/fetch')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ added: 2, autoEnabled: 1 })
  })

  it('POST /api/providers/:id/models 手动添加模型（缺 modelId 400）', async () => {
    const bad = await request(app).post('/api/providers/openrouter/models').send({})
    expect(bad.status).toBe(400)

    const ok = await request(app)
      .post('/api/providers/openrouter/models')
      .send({ modelId: 'flux/dev' })
    expect(ok.status).toBe(201)
    // isImage 由 service.addModel 内部按关键词计算（fake service 透传 body，不含该字段）
    expect(service.addModel).toHaveBeenCalledWith(
      'openrouter',
      expect.objectContaining({ modelId: 'flux/dev' }),
    )
  })

  it('PATCH /api/providers/:id/models/:modelId/enabled 单模型开关', async () => {
    const res = await request(app)
      .patch('/api/providers/openrouter/models/openai%2Fgpt-4o/enabled')
      .send({ enabled: true })
    expect(res.status).toBe(200)
    expect(service.setModelEnabled).toHaveBeenCalledWith('openrouter', 'openai/gpt-4o', true)
  })

  it('DELETE /api/providers/:id/models/:modelId 移除模型', async () => {
    const res = await request(app).delete('/api/providers/openrouter/models/openai%2Fgpt-4o')
    expect(res.status).toBe(200)
    expect(service.deleteModel).toHaveBeenCalledWith('openrouter', 'openai/gpt-4o')
  })
})

describe('isImageModelId', () => {
  it('命中图像关键词返回 true', () => {
    expect(isImageModelId('openai/gpt-image-2')).toBe(true)
    expect(isImageModelId('openai/dall-e-3')).toBe(true)
    expect(isImageModelId('black-forest-labs/flux-1.1-pro')).toBe(true)
    expect(isImageModelId('bytedance/seedream-4')).toBe(true)
    expect(isImageModelId('google/imagen-3')).toBe(true)
  })

  it('纯文本模型返回 false', () => {
    expect(isImageModelId('openai/gpt-4o')).toBe(false)
    expect(isImageModelId('anthropic/claude-sonnet-4')).toBe(false)
    expect(isImageModelId('deepseek/deepseek-chat')).toBe(false)
  })
})

describe('buildImagePayload', () => {
  it('size 为 auto 时不传 size/resolution/aspect_ratio', () => {
    const payload = buildImagePayload({
      model: 'openai/gpt-image-2',
      prompt: '画一只猫',
      size: 'auto',
      quality: 'high',
      n: 1,
    })
    expect(payload).toEqual({
      model: 'openai/gpt-image-2',
      prompt: '画一只猫',
      quality: 'high',
      n: 1,
    })
    expect('size' in payload).toBe(false)
    expect('resolution' in payload).toBe(false)
  })

  it('非 auto 尺寸换算为 resolution + aspect_ratio（约分）', () => {
    const payload = buildImagePayload({
      model: 'openai/gpt-image-2',
      prompt: 'p',
      size: '1536x864',
      quality: 'high',
      n: 2,
    })
    expect(payload.resolution).toBe('1536x864')
    expect(payload.aspect_ratio).toBe('16:9')
  })

  it('有参考图时带 input_references', () => {
    const payload = buildImagePayload({
      model: 'm',
      prompt: 'p',
      size: 'auto',
      quality: 'high',
      n: 1,
      inputReferences: ['data:image/png;base64,x'],
    })
    expect(payload.input_references).toEqual(['data:image/png;base64,x'])
  })
})
