import { beforeEach, describe, expect, it, vi } from 'vitest'

// mock axios（ESM：vi.mock 提升，工厂内返回 mock 实现）
vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import axios from 'axios'
import { createUpstreamClient } from './upstreamClient.js'

const provider = {
  id: 'openrouter',
  name: 'OpenRouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKeys: ['sk-a', 'sk-b'],
  enabled: true,
}

/** 构造带 HTTP status 的错误（模拟 axios 响应错误） */
function httpError(status, data = {}) {
  const err = new Error(`Request failed with status code ${status}`)
  err.response = { status, data }
  return err
}

describe('upstreamClient', () => {
  beforeEach(() => {
    axios.get.mockReset()
    axios.post.mockReset()
  })

  it('listModels 用轮询 Key 调 GET {baseUrl}/models 并返回 data 数组', async () => {
    axios.get.mockResolvedValue({ data: { data: [{ id: 'openai/gpt-image-2' }] } })
    const client = createUpstreamClient()

    const models = await client.listModels(provider)

    expect(axios.get).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer sk-a' }),
      }),
    )
    expect(models).toEqual([{ id: 'openai/gpt-image-2' }])
  })

  it('多 Key 轮询：连续调用依次使用不同 Key', async () => {
    axios.get.mockResolvedValue({ data: { data: [] } })
    const client = createUpstreamClient()

    await client.listModels(provider)
    await client.listModels(provider)
    await client.listModels(provider)

    const auths = axios.get.mock.calls.map((c) => c[1].headers.Authorization)
    expect(auths).toEqual(['Bearer sk-a', 'Bearer sk-b', 'Bearer sk-a'])
  })

  it('401 时自动换下一把 Key 重试一次并成功', async () => {
    axios.post
      .mockRejectedValueOnce(httpError(401))
      .mockResolvedValueOnce({ data: { data: [{ b64_json: 'x' }] } })
    const client = createUpstreamClient()

    const result = await client.generateImages(provider, { model: 'm' }, 1000)

    expect(axios.post).toHaveBeenCalledTimes(2)
    expect(axios.post.mock.calls[1][2].headers.Authorization).toBe('Bearer sk-b')
    expect(result.data).toEqual([{ b64_json: 'x' }])
  })

  it('全部 Key 401 时抛友好错误（带 401 status）', async () => {
    axios.post.mockRejectedValue(httpError(401))
    const client = createUpstreamClient()

    await expect(client.generateImages(provider, { model: 'm' }, 1000)).rejects.toMatchObject({
      status: 401,
      message: expect.stringContaining('OpenRouter'),
    })
    // 每把 Key 各试一次
    expect(axios.post).toHaveBeenCalledTimes(2)
  })

  it('非 401/403 错误（如 500）直接抛出，不换 Key', async () => {
    axios.post.mockRejectedValue(httpError(500))
    const client = createUpstreamClient()

    await expect(client.generateImages(provider, { model: 'm' }, 1000)).rejects.toMatchObject({
      response: { status: 500 },
    })
    expect(axios.post).toHaveBeenCalledTimes(1)
  })

  it('checkKeys 逐把 Key 探测并返回可用数与脱敏尾号', async () => {
    axios.get
      .mockResolvedValueOnce({ data: { data: [] } }) // 第一把可用
      .mockRejectedValueOnce(httpError(401)) // 第二把失效
    const client = createUpstreamClient()
    const multiKeyProvider = { ...provider, apiKeys: ['sk-alpha-1234', 'sk-beta-5678'] }

    const report = await client.checkKeys(multiKeyProvider)

    expect(report.total).toBe(2)
    expect(report.available).toBe(1)
    expect(report.results[0]).toMatchObject({ tail: '1234', ok: true })
    expect(report.results[1]).toMatchObject({ tail: '5678', ok: false, status: 401 })
    expect(report.results[0].latencyMs).toBeGreaterThanOrEqual(0)
    // 脱敏：返回体不含完整 Key
    expect(JSON.stringify(report)).not.toContain('sk-alpha')
    expect(JSON.stringify(report)).not.toContain('sk-beta')
  })

  it('apiKeys 为空时 generateImages 直接抛 400 友好错误，不发请求', async () => {
    const client = createUpstreamClient()

    await expect(
      client.generateImages({ ...provider, apiKeys: [] }, { model: 'm' }, 1000),
    ).rejects.toMatchObject({ status: 400 })
    expect(axios.post).not.toHaveBeenCalled()
  })

  it('createVideoTask 用轮询 Key POST {baseUrl}/contents/generations/tasks 并返回 {id}', async () => {
    axios.post.mockResolvedValue({ data: { id: 'cgt-123' } })
    const client = createUpstreamClient()

    const result = await client.createVideoTask(provider, { model: 'doubao-seedance-2-0-260128' })

    expect(axios.post).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/contents/generations/tasks',
      { model: 'doubao-seedance-2-0-260128' },
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-a',
          'Content-Type': 'application/json',
        }),
      }),
    )
    expect(result).toEqual({ id: 'cgt-123' })
  })

  it('getVideoTask 用轮询 Key GET {baseUrl}/contents/generations/tasks/{id} 并返回任务状态', async () => {
    axios.get.mockResolvedValue({
      data: { id: 'cgt-123', status: 'succeeded', content: { video_url: 'https://x/v.mp4' } },
    })
    const client = createUpstreamClient()

    const result = await client.getVideoTask(provider, 'cgt-123')

    expect(axios.get).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/contents/generations/tasks/cgt-123',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer sk-a' }),
      }),
    )
    expect(result.status).toBe('succeeded')
  })

  it('getVideoTask 对 taskId 做 URL 编码（含特殊字符时安全拼路径）', async () => {
    axios.get.mockResolvedValue({ data: { status: 'queued' } })
    const client = createUpstreamClient()

    await client.getVideoTask(provider, 'cgt a/b')

    expect(axios.get.mock.calls[0][0]).toBe(
      'https://openrouter.ai/api/v1/contents/generations/tasks/cgt%20a%2Fb',
    )
  })
})
