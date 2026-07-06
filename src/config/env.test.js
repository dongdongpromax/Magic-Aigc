import { describe, expect, it, vi } from 'vitest'

describe('getDefaultAppConfig', () => {
  it('从 import.meta.env 读取默认配置', async () => {
    vi.stubGlobal('importMetaEnv', {
      VITE_AI_BASE_URL: 'https://demo.example.com/v1',
      VITE_AI_API_KEY: 'demo-key',
      VITE_AI_MODEL: 'gpt-image-2',
      VITE_AI_MODE: 'openai-image',
      VITE_AI_DEFAULT_SIZE: '1024x1024',
      VITE_AI_DEFAULT_QUALITY: 'high',
      VITE_AI_DEFAULT_N: '1',
      VITE_AI_TIMEOUT: '120000',
    })

    const { getDefaultAppConfig } = await import('./env')

    expect(getDefaultAppConfig()).toEqual({
      baseURL: 'https://demo.example.com/v1',
      apiKey: 'demo-key',
      defaultModel: 'openai/gpt-image-2',
      requestMode: 'openai-image',
      defaultSize: '1024x1024',
      defaultQuality: 'high',
      defaultN: 1,
      timeout: 120000,
    })
  })

  it('在未配置时回退到 OpenRouter 图片默认值', async () => {
    vi.stubGlobal('importMetaEnv', {})

    const { getDefaultAppConfig } = await import('./env')

    expect(getDefaultAppConfig()).toMatchObject({
      baseURL: 'https://openrouter.ai/api/v1',
      defaultModel: 'openai/gpt-image-2',
      requestMode: 'openrouter-image',
      defaultSize: 'auto',
    })
  })
})
