import { backendClient } from './backendClient'

export async function getSettings() {
  const response = await backendClient.get('/api/settings')
  return response.data
}

export async function updateSettings(payload) {
  const response = await backendClient.put('/api/settings', payload)
  return response.data
}
