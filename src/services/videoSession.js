import { backendClient } from './backendClient'

/**
 * 发起视频生成请求
 *
 * 调用后端 POST /api/topics/:topicId/messages/video，
 * 后端负责创建火山 Seedance 任务、轮询、下载落盘、事务保存，前端零轮询逻辑。
 *
 * 返回值有两种形态：
 * - 成功：{ videos, providerName, ratio, duration, resolution, videoRefMode }
 * - 超时：{ status: 'pending', taskId, providerId, pendingMessageId, providerName, ... }
 *   轮询超时但任务仍在后台运行，前端展示 pending 卡片供用户后续检查
 *
 * @param {string} topicId 主题 ID
 * @param {{ prompt?: string; draft?: object }} payload
 * @returns {Promise<object>}
 */
export async function requestVideo(topicId, payload) {
  const response = await backendClient.post(`/api/topics/${topicId}/messages/video`, payload)
  return response.data
}

/**
 * 回查 pending 视频任务状态
 *
 * 调用后端 POST /api/topics/:topicId/messages/:messageId/retry-video，
 * 后端读取消息 meta 中的 taskId → 查上游任务状态：
 * - 已成功：下载视频落盘 + 补全消息 → 返回 { status: 'done', video, providerName }
 * - 仍在运行：返回 { status: 'pending', taskId, message }
 * - 已失败：抛错（expose 透传上游原因）
 *
 * @param {string} topicId 主题 ID
 * @param {string} messageId pending 消息 ID
 * @returns {Promise<object>}
 */
export async function checkPendingVideo(topicId, messageId) {
  const response = await backendClient.post(
    `/api/topics/${topicId}/messages/${messageId}/retry-video`,
  )
  return response.data
}
