function readValue(env, keys, fallback = '') {
  for (const key of keys) {
    if (env[key]) return env[key]
  }

  return fallback
}

function normalizeModelId(model) {
  if (!model) return 'openai/gpt-image-2'
  if (model === 'gpt-image-2') return 'openai/gpt-image-2'
  return model
}

const readEnv = () => {
  if (typeof importMetaEnv !== 'undefined') return importMetaEnv
  if (typeof import.meta !== 'undefined' && import.meta.env) return import.meta.env
  return {}
}

export function getDefaultAppConfig() {
  const env = readEnv()

  return {
    baseURL: readValue(env, ['VITE_OPENROUTER_BASE_URL', 'VITE_AI_BASE_URL'], 'https://openrouter.ai/api/v1'),
    apiKey: readValue(env, ['VITE_OPENROUTER_API_KEY', 'VITE_AI_API_KEY'], ''),
    defaultModel: normalizeModelId(readValue(env, ['VITE_OPENROUTER_MODEL', 'VITE_AI_MODEL'], 'openai/gpt-image-2')),
    requestMode: readValue(env, ['VITE_OPENROUTER_MODE', 'VITE_AI_MODE'], 'openrouter-image'),
    defaultSize: readValue(env, ['VITE_OPENROUTER_DEFAULT_SIZE', 'VITE_AI_DEFAULT_SIZE'], '1024x1024'),
    defaultQuality: readValue(env, ['VITE_OPENROUTER_DEFAULT_QUALITY', 'VITE_AI_DEFAULT_QUALITY'], 'high'),
    defaultN: Number(readValue(env, ['VITE_OPENROUTER_DEFAULT_N', 'VITE_AI_DEFAULT_N'], 1)),
    timeout: Number(readValue(env, ['VITE_OPENROUTER_TIMEOUT', 'VITE_AI_TIMEOUT'], 120000)),
  }
}
