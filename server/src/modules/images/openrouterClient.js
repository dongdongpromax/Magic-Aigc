import axios from 'axios'

export function createOpenRouterClient({ apiKey }) {
  return {
    async generateImages({ baseURL, payload, timeout }) {
      const response = await axios.post(`${baseURL}/images`, payload, {
        timeout,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      })

      return response.data
    },
  }
}
