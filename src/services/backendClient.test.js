import { describe, expect, it } from 'vitest'

/**
 * backendClient 单测：验证 updateBackendConfig 能同步 axios 实例的 timeout
 *
 * 核心场景：用户在「通用设置」里改了超时时间后，
 * bootstrap() 和 saveSettings() 调 updateBackendConfig 让新值对后续请求生效。
 *
 * 注意：baseURL 不同步——appConfig.baseURL 实际是上游中转站地址，
 * 同步到 backendClient 会导致所有前端请求发往上游（404）。
 */
describe('backendClient', () => {
  it('updateBackendConfig 同步 timeout 到 axios defaults', async () => {
    const { backendClient, updateBackendConfig } = await import('./backendClient')

    const originalTimeout = backendClient.defaults.timeout

    updateBackendConfig({ timeout: 600000 })
    expect(backendClient.defaults.timeout).toBe(600000)

    // 恢复原值，避免影响其他测试
    updateBackendConfig({ timeout: originalTimeout })
  })

  it('updateBackendConfig 不同步 baseURL（避免上游地址覆盖后端地址）', async () => {
    const { backendClient, updateBackendConfig } = await import('./backendClient')

    const originalBaseURL = backendClient.defaults.baseURL

    // 即使传入 baseURL 也不会更新
    updateBackendConfig({ baseURL: 'https://openrouter.ai/api/v1', timeout: 999 })
    expect(backendClient.defaults.baseURL).toBe(originalBaseURL)
    expect(backendClient.defaults.timeout).toBe(999)

    // 恢复
    updateBackendConfig({ timeout: 1800000 })
  })
})
