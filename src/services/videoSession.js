import { backendClient } from './backendClient'

/**
 * 发起视频生成请求
 *
 * 调用后端 POST /api/topics/:topicId/messages/video，
 * 后端负责创建火山 Seedance 任务、轮询、下载落盘、事务保存，前端零轮询逻辑。
 *
 * @param {string} topicId 主题 ID
 * @param {{ prompt?: string; draft?: object }} payload
 * @returns {Promise<{ videos: Array<object>; providerName: string; ratio: string; duration: number }>}
 */
export async function requestVideo(topicId, payload) {
  const response = await backendClient.post(`/api/topics/${topicId}/messages/video`, payload)
  return response.data
}
