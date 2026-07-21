import { describe, expect, it, vi } from 'vitest'

const getMock = vi.fn(async () => ({
  data: {
    baseURL: 'http://127.0.0.1:4398',
    defaultModel: 'openai/gpt-image-2',
    defaultSize: 'auto',
    defaultQuality: 'high',
    defaultN: 1,
    requestMode: 'backend-proxy',
    timeout: 120000,
  },
}))

vi.mock('axios', () => {
  return {
    default: {
      create: vi.fn(() => ({
        get: getMock,
      })),
    },
  }
})

describe('settingsApi', () => {
  it('从 /api/settings 读取设置', async () => {
    const { getSettings } = await import('./settingsApi')
    const result = await getSettings()

    expect(result.defaultSize).toBe('auto')
    expect(getMock).toHaveBeenCalledWith('/api/settings')
  })
})
