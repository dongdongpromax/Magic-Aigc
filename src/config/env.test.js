import { describe, expect, it, vi } from 'vitest'

describe('getDefaultAppConfig', () => {
  it('从 import.meta.env 读取 backend 默认配置', async () => {
    vi.stubGlobal('importMetaEnv', {
      VITE_BACKEND_BASE_URL: 'http://127.0.0.1:5500',
      VITE_BACKEND_TIMEOUT: '90000',
    })

    const { getDefaultAppConfig } = await import('./env')

    expect(getDefaultAppConfig()).toEqual({
      baseURL: 'http://127.0.0.1:5500',
      apiKey: '',
      defaultModel: 'openai/gpt-image-2',
      // P1-1: 与后端 settingsRepository 默认值对齐
      requestMode: 'openrouter-image',
      defaultSize: 'auto',
      defaultQuality: 'high',
      defaultN: 1,
      // 视频模型默认参数（与后端 settingsRepository 默认值对齐）
      defaultRatio: '16:9',
      defaultDuration: 5,
      defaultResolution: '720p',
      defaultVideoRefMode: 'first_frame',
      timeout: 90000,
    })
  })

  it('在未配置时回退到本地 backend 默认值', async () => {
    vi.stubGlobal('importMetaEnv', {})

    const { getDefaultAppConfig } = await import('./env')

    expect(getDefaultAppConfig()).toMatchObject({
      baseURL: 'http://127.0.0.1:4398',
      defaultModel: 'openai/gpt-image-2',
      // P1-1: 与后端 settingsRepository 默认值对齐
      requestMode: 'openrouter-image',
      defaultSize: 'auto',
    })
  })
})
