import axios from 'axios'

export function createAiClient(config) {
  return axios.create({
    baseURL: config.baseURL,
    timeout: config.timeout,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
  })
}
