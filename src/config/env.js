const readEnv = () => {
  if (typeof importMetaEnv !== 'undefined') return importMetaEnv
  if (typeof import.meta !== 'undefined' && import.meta.env) return import.meta.env
  return {}
}

export function getDefaultAppConfig() {
  const env = readEnv()

  return {
    baseURL: env.VITE_BACKEND_BASE_URL || 'http://127.0.0.1:4398',
    apiKey: '',
    defaultModel: 'openai/gpt-image-2',
    requestMode: 'backend-proxy',
    defaultSize: 'auto',
    defaultQuality: 'high',
    defaultN: 1,
    timeout: Number(env.VITE_BACKEND_TIMEOUT || 120000),
  }
}
