import { backendClient } from './backendClient'

/**
 * 提示词库 API
 *
 * 对接后端 /api/prompts 端点，提供提示词的增删改查与素材上传能力。
 * 提示词字段：title / content / type(video|image|audio|text) / tags / assets / notes
 */

/**
 * 获取提示词列表（支持按类型/标签/关键词筛选）
 * @param {{ type?: string; tag?: string; keyword?: string; limit?: number }} options
 * @returns {Promise<Array<object>>}
 */
export async function listPrompts(options = {}) {
  const params = {}
  if (options.type) params.type = options.type
  if (options.tag) params.tag = options.tag
  if (options.keyword) params.keyword = options.keyword
  if (options.limit) params.limit = options.limit
  const response = await backendClient.get('/api/prompts', { params })
  return response.data
}

/**
 * 获取单条提示词详情
 * @param {string} id 提示词 ID
 * @returns {Promise<object>}
 */
export async function getPromptDetail(id) {
  const response = await backendClient.get(`/api/prompts/${id}`)
  return response.data
}

/**
 * 新建提示词
 * @param {{ title: string; content: string; type: string; tags?: Array<string>; assets?: Array<object>; notes?: string }} payload
 * @returns {Promise<object>} 新建后的提示词详情
 */
export async function createPrompt(payload) {
  const response = await backendClient.post('/api/prompts', payload)
  return response.data
}

/**
 * 更新提示词（部分字段）
 * @param {string} id 提示词 ID
 * @param {object} patch 待更新字段
 * @returns {Promise<object>} 更新后的提示词详情
 */
export async function updatePrompt(id, patch) {
  const response = await backendClient.put(`/api/prompts/${id}`, patch)
  return response.data
}

/**
 * 删除提示词（同时清理素材文件）
 * @param {string} id 提示词 ID
 * @returns {Promise<{ success: boolean }>}
 */
export async function deletePrompt(id) {
  const response = await backendClient.delete(`/api/prompts/${id}`)
  return response.data
}

/**
 * 上传提示词效果素材（图片/视频/音频）
 * @param {Array<File>} files 待上传文件
 * @returns {Promise<Array<{ url: string; mimeType: string; kind: string; name: string }>>}
 */
export async function uploadPromptAssets(files) {
  const formData = new FormData()
  for (const file of files) {
    formData.append('files', file)
  }
  const response = await backendClient.post('/api/prompts/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}
