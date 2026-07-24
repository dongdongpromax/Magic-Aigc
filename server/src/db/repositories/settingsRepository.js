export function createSettingsRepository(pool) {
  return {
    async getSettings() {
      const [rows] = await pool.query('SELECT * FROM app_settings ORDER BY id ASC LIMIT 1')
      const row = rows[0]

      return row
        ? {
            baseURL: row.base_url,
            defaultModel: row.default_model,
            defaultSize: row.default_size,
            defaultQuality: row.default_quality,
            defaultN: row.default_n,
            requestMode: row.request_mode,
            timeout: row.timeout,
            defaultProviderId: row.default_provider_id || '',
            // 视频模型默认参数（通用设置按模型类型分区持久化）
            defaultRatio: row.default_ratio || '16:9',
            defaultDuration: row.default_duration ?? 5,
            defaultResolution: row.default_resolution || '720p',
            defaultVideoRefMode: row.default_video_ref_mode || 'first_frame',
          }
        : {
            baseURL: 'https://openrouter.ai/api/v1',
            defaultModel: 'openai/gpt-image-2',
            defaultSize: 'auto',
            defaultQuality: 'high',
            defaultN: 1,
            requestMode: 'openrouter-image',
            timeout: 1200000,
            defaultProviderId: '',
            defaultRatio: '16:9',
            defaultDuration: 5,
            defaultResolution: '720p',
            defaultVideoRefMode: 'first_frame',
          }
    },

    async saveSettings(payload) {
      const next = {
        baseURL: payload.baseURL || 'https://openrouter.ai/api/v1',
        defaultModel: payload.defaultModel || 'openai/gpt-image-2',
        defaultSize: payload.defaultSize || 'auto',
        defaultQuality: payload.defaultQuality || 'high',
        defaultN: payload.defaultN || 1,
        // P1-1: 与前端 env.js 默认值和 SettingsDrawer 选项对齐
        requestMode: payload.requestMode || 'openrouter-image',
        timeout: payload.timeout || 1200000,
        defaultProviderId: payload.defaultProviderId || '',
        // 视频模型默认参数（通用设置按模型类型分区持久化）
        defaultRatio: payload.defaultRatio || '16:9',
        defaultDuration: payload.defaultDuration ?? 5,
        defaultResolution: payload.defaultResolution || '720p',
        defaultVideoRefMode: payload.defaultVideoRefMode || 'first_frame',
      }

      await pool.query(
        `INSERT INTO app_settings
          (id, base_url, default_model, default_size, default_quality, default_n, request_mode, timeout, default_provider_id,
           default_ratio, default_duration, default_resolution, default_video_ref_mode)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         base_url = VALUES(base_url),
         default_model = VALUES(default_model),
         default_size = VALUES(default_size),
         default_quality = VALUES(default_quality),
         default_n = VALUES(default_n),
         request_mode = VALUES(request_mode),
         timeout = VALUES(timeout),
         default_provider_id = VALUES(default_provider_id),
         default_ratio = VALUES(default_ratio),
         default_duration = VALUES(default_duration),
         default_resolution = VALUES(default_resolution),
         default_video_ref_mode = VALUES(default_video_ref_mode)`,
        [
          next.baseURL,
          next.defaultModel,
          next.defaultSize,
          next.defaultQuality,
          next.defaultN,
          next.requestMode,
          next.timeout,
          next.defaultProviderId,
          next.defaultRatio,
          next.defaultDuration,
          next.defaultResolution,
          next.defaultVideoRefMode,
        ],
      )

      return next
    },
  }
}
