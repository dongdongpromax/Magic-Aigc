import { backendClient } from './backendClient'

/**
 * 使用日志 API
 *
 * 对接后端 /api/usage-logs 端点，提供日志列表、详情、删除能力。
 */

/**
 * 获取使用日志列表（摘要信息，不含完整 JSON 负载）
 * @param {{ type?: string; limit?: number; offset?: number }} options
 * @returns {Promise<Array<object>>}
 */
export async function listUsageLogs(options = {}) {
  const params = {}
  if (options.type) params.type = options.type
  if (options.limit) params.limit = options.limit
  if (options.offset) params.offset = options.offset
  const response = await backendClient.get('/api/usage-logs', { params })
  return response.data
}

/**
 * 获取单条日志详情（含完整 4 阶段 JSON 负载）
 * @param {string} id 日志 ID
 * @returns {Promise<object>}
 */
export async function getUsageLogDetail(id) {
  const response = await backendClient.get(`/api/usage-logs/${id}`)
  return response.data
}

/**
 * 删除单条日志
 * @param {string} id 日志 ID
 * @returns {Promise<{ success: boolean }>}
 */
export async function deleteUsageLog(id) {
  const response = await backendClient.delete(`/api/usage-logs/${id}`)
  return response.data
}

/**
 * 清空所有日志
 * @returns {Promise<{ success: boolean; deleted: number }>}
 */
export async function clearAllUsageLogs() {
  const response = await backendClient.delete('/api/usage-logs')
  return response.data
}
