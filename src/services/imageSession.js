import { backendClient } from './backendClient'

export async function requestImages(topicId, payload) {
  const response = await backendClient.post(`/api/topics/${topicId}/messages/image`, payload)
  return response.data
}
