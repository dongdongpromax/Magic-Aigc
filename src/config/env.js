import {
  DEFAULT_VIDEO_RATIO,
  DEFAULT_VIDEO_DURATION,
  DEFAULT_VIDEO_RESOLUTION,
  DEFAULT_VIDEO_REF_MODE,
} from './videoOptions'

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
    // P1-1: 与后端 settingsRepository 默认值和 SettingsDrawer 选项对齐
    requestMode: 'openrouter-image',
    defaultSize: 'auto',
    defaultQuality: 'high',
    defaultN: 1,
    // 视频模型默认参数（通用设置按模型类型分区，持久化到 app_settings）
    defaultRatio: DEFAULT_VIDEO_RATIO,
    defaultDuration: DEFAULT_VIDEO_DURATION,
    defaultResolution: DEFAULT_VIDEO_RESOLUTION,
    defaultVideoRefMode: DEFAULT_VIDEO_REF_MODE,
    timeout: Number(env.VITE_BACKEND_TIMEOUT || 1200000),
  }
}
