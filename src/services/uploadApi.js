import { backendClient } from './backendClient'

/**
 * 上传参考图文件
 * @param {string} topicId 主题 ID
 * @param {Array<File>} files 文件列表
 * @returns {Promise<Array<object>>} 上传后的参考图元数据
 */
export async function uploadReferenceImages(topicId, files) {
  const formData = new FormData()

  files.forEach((file) => {
    formData.append('files', file)
  })

  const response = await backendClient.post(`/api/topics/${topicId}/references`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })

  return response.data
}

/**
 * 「设为参考图」：把历史消息中的图片登记为当前主题的参考图
 *
 * 调用 POST /api/topics/:topicId/references/from-message，
 * 后端会复用 message_images.file_path，不复制文件。
 *
 * @param {string} topicId 主题 ID
 * @param {{ messageId: string; imageIds: Array<string> }} payload 源消息 ID 和图片 ID 列表
 * @returns {Promise<{ referenceImages: Array<object> }>} 最新参考图列表
 */
export async function registerReferenceFromMessage(topicId, { messageId, imageIds }) {
  const response = await backendClient.post(
    `/api/topics/${topicId}/references/from-message`,
    { messageId, imageIds },
    {
      headers: {
        'Content-Type': 'application/json',
      },
    },
  )

  return response.data
}

/**
 * 删除单个参考图记录
 * @param {string} topicId 主题 ID
 * @param {string} referenceId 参考图 ID
 * @returns {Promise<{success: boolean}>}
 */
export async function deleteReferenceImage(topicId, referenceId) {
  const response = await backendClient.delete(`/api/topics/${topicId}/references/${referenceId}`)
  return response.data
}
