import { backendClient } from './backendClient'

export async function listTopics() {
  const response = await backendClient.get('/api/topics')
  return response.data
}

export async function getMessages(topicId) {
  const response = await backendClient.get(`/api/topics/${topicId}/messages`)
  return response.data
}

export async function getDraft(topicId) {
  const response = await backendClient.get(`/api/topics/${topicId}/draft`)
  return response.data
}

export async function saveDraft(topicId, payload) {
  const response = await backendClient.put(`/api/topics/${topicId}/draft`, payload)
  return response.data
}

export async function createTopic(title) {
  const response = await backendClient.post('/api/topics', { title })
  return response.data
}
