import { backendClient } from './backendClient'

/**
 * 中转站 API 封装
 * modelId 含 '/'，路径参数需 encodeURIComponent
 */

export async function listProviders() {
  const response = await backendClient.get('/api/providers')
  return response.data
}

export async function createProvider(payload) {
  const response = await backendClient.post('/api/providers', payload)
  return response.data
}

export async function updateProvider(id, patch) {
  const response = await backendClient.put(`/api/providers/${id}`, patch)
  return response.data
}

export async function setProviderEnabled(id, enabled) {
  const response = await backendClient.patch(`/api/providers/${id}/enabled`, { enabled })
  return response.data
}

export async function deleteProvider(id) {
  const response = await backendClient.delete(`/api/providers/${id}`)
  return response.data
}

export async function checkProvider(id) {
  const response = await backendClient.post(`/api/providers/${id}/check`)
  return response.data
}

export async function listProviderModels(id) {
  const response = await backendClient.get(`/api/providers/${id}/models`)
  return response.data
}

export async function fetchProviderModels(id) {
  const response = await backendClient.post(`/api/providers/${id}/models/fetch`)
  return response.data
}

export async function addProviderModel(id, payload) {
  const response = await backendClient.post(`/api/providers/${id}/models`, payload)
  return response.data
}

export async function setProviderModelEnabled(id, modelId, enabled) {
  const response = await backendClient.patch(
    `/api/providers/${id}/models/${encodeURIComponent(modelId)}/enabled`,
    { enabled },
  )
  return response.data
}

export async function deleteProviderModel(id, modelId) {
  const response = await backendClient.delete(
    `/api/providers/${id}/models/${encodeURIComponent(modelId)}`,
  )
  return response.data
}
