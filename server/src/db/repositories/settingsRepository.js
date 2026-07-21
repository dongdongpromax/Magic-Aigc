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
          }
        : {
            baseURL: 'https://openrouter.ai/api/v1',
            defaultModel: 'openai/gpt-image-2',
            defaultSize: 'auto',
            defaultQuality: 'high',
            defaultN: 1,
            requestMode: 'openrouter-image',
            timeout: 1200000,
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
      }

      await pool.query(
        `INSERT INTO app_settings
          (id, base_url, default_model, default_size, default_quality, default_n, request_mode, timeout)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         base_url = VALUES(base_url),
         default_model = VALUES(default_model),
         default_size = VALUES(default_size),
         default_quality = VALUES(default_quality),
         default_n = VALUES(default_n),
         request_mode = VALUES(request_mode),
         timeout = VALUES(timeout)`,
        [
          next.baseURL,
          next.defaultModel,
          next.defaultSize,
          next.defaultQuality,
          next.defaultN,
          next.requestMode,
          next.timeout,
        ],
      )

      return next
    },
  }
}
