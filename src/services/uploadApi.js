import { backendClient } from './backendClient'

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

export async function deleteReferenceImage(topicId, referenceId) {
  const response = await backendClient.delete(`/api/topics/${topicId}/references/${referenceId}`)
  return response.data
}
