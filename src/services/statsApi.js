import { backendClient } from './backendClient'

/**
 * 统计 API
 *
 * 对接后端 /api/stats/summary 端点，返回生成次数汇总。
 */

/**
 * 获取生成次数汇总统计
 * @returns {Promise<{ totalGenerations: number, imageCount: number, videoCount: number }>}
 */
export async function getStatsSummary() {
  const response = await backendClient.get('/api/stats/summary')
  return response.data
}
