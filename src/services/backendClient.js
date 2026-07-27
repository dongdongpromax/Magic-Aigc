import axios from 'axios'
import { getDefaultAppConfig } from '@/config/env'

/**
 * 后端 API 客户端（axios 实例）
 *
 * baseURL 始终用 env 配置的本地后端地址（VITE_BACKEND_BASE_URL || http://127.0.0.1:4398），
 * 绝不从 appSettings 同步——因为 appSettings.baseURL 存储的是上游中转站的 API 地址
 *（如 https://openrouter.ai/api/v1），供后端调用上游使用，与前端连接后端是两回事。
 *
 * timeout 会在 chatStore.bootstrap() 从后端加载设置后、以及 saveSettings() 保存后，
 * 通过 updateBackendConfig() 同步更新，确保用户在设置中修改的超时时间对请求生效。
 */
const config = getDefaultAppConfig()

export const backendClient = axios.create({
  baseURL: config.baseURL,
  timeout: config.timeout,
})

/**
 * 同步超时时间到 axios 实例
 *
 * 调用时机：
 * 1. chatStore.bootstrap() 从后端 GET /api/settings 加载设置后
 * 2. chatStore.saveSettings() 保存设置后
 *
 * 注意：只同步 timeout，不同步 baseURL。baseURL 始终用 env 配置的本地后端地址。
 * appConfig.baseURL 实际是上游中转站地址（存于 app_settings.base_url 列），
 * 若同步到 backendClient 会导致所有前端请求发往上游而非本地后端（404）。
 * @param {{ timeout?: number }} patch 需要更新的字段
 */
export function updateBackendConfig(patch) {
  if (patch.timeout !== undefined) {
    backendClient.defaults.timeout = patch.timeout
  }
}
