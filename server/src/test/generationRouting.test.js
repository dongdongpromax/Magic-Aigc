import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

import axios from 'axios'
import { createProvidersService } from '../modules/providers/providersService.js'
import { createUpstreamClient } from '../modules/providers/upstreamClient.js'

/** 内存版仓储假实现 */
function createFakeRepos({ providers = [], defaultProviderId = '' } = {}) {
  return {
    providersRepository: {
      getProvider: vi.fn(async (id) => providers.find((p) => p.id === id) || null),
      getFirstEnabledProvider: vi.fn(async () => providers.find((p) => p.enabled) || null),
    },
    settingsRepository: {
      getSettings: vi.fn(async () => ({ defaultProviderId, timeout: 1000 })),
    },
  }
}

const openrouter = {
  id: 'openrouter',
  name: 'OpenRouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKeys: ['sk-a'],
  enabled: true,
}
const siliconflow = {
  id: 'siliconflow',
  name: '硅基流动',
  baseUrl: 'https://api.siliconflow.cn/v1',
  apiKeys: ['sk-sf'],
  enabled: true,
}

describe('providersService.resolveForDraft', () => {
  it('draft 指定 providerId 时路由到该家', async () => {
    const repos = createFakeRepos({ providers: [openrouter, siliconflow] })
    const service = createProvidersService({ ...repos, upstreamClient: createUpstreamClient() })

    const provider = await service.resolveForDraft('siliconflow')

    expect(provider.baseUrl).toBe('https://api.siliconflow.cn/v1')
  })

  it('未指定时回退 default_provider_id', async () => {
    const repos = createFakeRepos({
      providers: [openrouter, siliconflow],
      defaultProviderId: 'siliconflow',
    })
    const service = createProvidersService({ ...repos, upstreamClient: createUpstreamClient() })

    const provider = await service.resolveForDraft(undefined)

    expect(provider.id).toBe('siliconflow')
  })

  it('default_provider_id 已停用时回退第一个 enabled', async () => {
    const repos = createFakeRepos({
      providers: [{ ...siliconflow, enabled: false }, openrouter],
      defaultProviderId: 'siliconflow',
    })
    const service = createProvidersService({ ...repos, upstreamClient: createUpstreamClient() })

    const provider = await service.resolveForDraft(undefined)

    expect(provider.id).toBe('openrouter')
  })

  it('指定 provider 已停用时 400', async () => {
    const repos = createFakeRepos({ providers: [{ ...openrouter, enabled: false }] })
    const service = createProvidersService({ ...repos, upstreamClient: createUpstreamClient() })

    await expect(service.resolveForDraft('openrouter')).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('已停用'),
    })
  })

  it('provider 无 Key 时 400 友好错误', async () => {
    const repos = createFakeRepos({ providers: [{ ...openrouter, apiKeys: [] }] })
    const service = createProvidersService({ ...repos, upstreamClient: createUpstreamClient() })

    await expect(service.resolveForDraft('openrouter')).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('未配置 API 密钥'),
    })
  })

  it('无任何可用 provider 时 400', async () => {
    const repos = createFakeRepos({ providers: [] })
    const service = createProvidersService({ ...repos, upstreamClient: createUpstreamClient() })

    await expect(service.resolveForDraft(undefined)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('没有可用的中转站'),
    })
  })
})

describe('生成链路集成（resolveForDraft + upstreamClient.generateImages）', () => {
  beforeEach(() => {
    axios.post.mockReset()
  })

  it('按 draft.providerId 的 baseUrl+Key 发请求', async () => {
    axios.post.mockResolvedValue({ data: { data: [{ b64_json: 'x' }] } })
    const repos = createFakeRepos({ providers: [openrouter, siliconflow] })
    const upstreamClient = createUpstreamClient()
    const service = createProvidersService({ ...repos, upstreamClient })

    const provider = await service.resolveForDraft('siliconflow')
    await upstreamClient.generateImages(
      provider,
      { model: 'flux/dev', prompt: 'p', quality: 'high', n: 1 },
      1000,
    )

    expect(axios.post).toHaveBeenCalledWith(
      'https://api.siliconflow.cn/v1/images',
      expect.objectContaining({ model: 'flux/dev' }),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer sk-sf' }),
      }),
    )
  })
})
