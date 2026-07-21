import { backendClient } from './backendClient'

/**
 * 列出所有主题
 * @returns {Promise<Array<object>>}
 */
export async function listTopics() {
  const response = await backendClient.get('/api/topics')
  return response.data
}

/**
 * 列出指定主题的消息
 * @param {string} topicId 主题 ID
 * @returns {Promise<Array<object>>}
 */
export async function getMessages(topicId) {
  const response = await backendClient.get(`/api/topics/${topicId}/messages`)
  return response.data
}

/**
 * 获取草稿（含参考图）
 * @param {string} topicId 主题 ID
 * @returns {Promise<object>}
 */
export async function getDraft(topicId) {
  const response = await backendClient.get(`/api/topics/${topicId}/draft`)
  return response.data
}

/**
 * 保存草稿（prompt/model/size/quality/n）
 * @param {string} topicId 主题 ID
 * @param {object} payload 草稿数据
 * @returns {Promise<object>}
 */
export async function saveDraft(topicId, payload) {
  const response = await backendClient.put(`/api/topics/${topicId}/draft`, payload)
  return response.data
}

/**
 * 创建主题
 * @param {string} title 主题标题
 * @returns {Promise<object>}
 */
export async function createTopic(title) {
  const response = await backendClient.post('/api/topics', { title })
  return response.data
}

/**
 * P0-8: 删除主题（含级联清理 messages/drafts/references/images + 文件）
 * @param {string} topicId 主题 ID
 * @returns {Promise<void>}
 */
export async function deleteTopic(topicId) {
  await backendClient.delete(`/api/topics/${topicId}`)
}
