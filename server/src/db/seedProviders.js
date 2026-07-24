/**
 * 预设中转站列表 + providers 相关 schema 迁移 + 首次 seed
 *
 * 迁移与 seed 均为幂等实现，后端每次启动都会调用：
 * - migrateProvidersSchema：CREATE TABLE IF NOT EXISTS + 探测后补列
 * - seedProvidersIfEmpty：providers 表为空时写入预设，并吸收
 *   server/.env 的 OPENROUTER_API_KEY 与旧 app_settings 配置
 */

/** 预设中转站（is_builtin=1），默认仅 OpenRouter 启用 */
export const PRESET_PROVIDERS = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    color: '#6366f1',
    enabled: 1,
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    color: '#7c3aed',
    enabled: 0,
  },
  {
    id: 'aihubmix',
    name: 'AiHubMix',
    baseUrl: 'https://aihubmix.com/v1',
    color: '#0ea5e9',
    enabled: 0,
  },
  {
    id: 'dmxapi',
    name: 'DMXAPI',
    baseUrl: 'https://www.dmxapi.cn/v1',
    color: '#f59e0b',
    enabled: 0,
  },
  {
    id: 'openai',
    name: 'OpenAI 官方',
    baseUrl: 'https://api.openai.com/v1',
    color: '#10a37f',
    enabled: 0,
  },
  {
    id: 'api2d',
    name: 'API2D',
    baseUrl: 'https://openai.api2d.net/v1',
    color: '#ef4444',
    enabled: 0,
  },
  {
    id: 'volcengine',
    name: '火山方舟',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    color: '#ff6b35',
    enabled: 0,
  },
]

/**
 * 生成唯一 ID
 * @returns {string}
 */
function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * 取模型 ID 的分组名（'/' 前缀，无 '/' 归「其他」）
 * @param {string} modelId 如 'openai/gpt-image-2'
 * @returns {string}
 */
export function groupOfModel(modelId) {
  const idx = String(modelId).indexOf('/')
  return idx > 0 ? String(modelId).slice(0, idx) : '其他'
}

/**
 * 探测列是否存在，不存在才执行 ALTER（幂等加列）
 */
async function ensureColumn(pool, table, column, alterSql) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  )
  if (Number(rows[0]?.cnt) === 0) {
    await pool.query(alterSql)
  }
}

/**
 * providers 相关 schema 迁移（幂等）
 * @param {import('mysql2/promise').Pool} pool
 */
export async function migrateProvidersSchema(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS providers (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    base_url VARCHAR(255) NOT NULL,
    api_keys JSON NOT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    request_mode VARCHAR(60) NOT NULL DEFAULT 'openrouter-image',
    color VARCHAR(20) NULL,
    is_builtin TINYINT(1) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  )`)

  await pool.query(`CREATE TABLE IF NOT EXISTS provider_models (
    id VARCHAR(64) PRIMARY KEY,
    provider_id VARCHAR(64) NOT NULL,
    model_id VARCHAR(190) NOT NULL,
    display_name VARCHAR(255) NULL,
    group_name VARCHAR(120) NULL,
    is_image TINYINT(1) NOT NULL DEFAULT 0,
    enabled TINYINT(1) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    UNIQUE KEY uq_provider_model (provider_id, model_id)
  )`)

  await ensureColumn(
    pool,
    'drafts',
    'provider_id',
    'ALTER TABLE drafts ADD COLUMN provider_id VARCHAR(64) NULL',
  )
  await ensureColumn(
    pool,
    'app_settings',
    'default_provider_id',
    'ALTER TABLE app_settings ADD COLUMN default_provider_id VARCHAR(64) NULL',
  )
  // 视频模型默认参数：通用设置按模型类型分区，视频默认比例/时长/清晰度/参考模式持久化
  await ensureColumn(
    pool,
    'app_settings',
    'default_ratio',
    'ALTER TABLE app_settings ADD COLUMN default_ratio VARCHAR(16) NULL',
  )
  await ensureColumn(
    pool,
    'app_settings',
    'default_duration',
    'ALTER TABLE app_settings ADD COLUMN default_duration INT NULL',
  )
  await ensureColumn(
    pool,
    'app_settings',
    'default_resolution',
    'ALTER TABLE app_settings ADD COLUMN default_resolution VARCHAR(16) NULL',
  )
  await ensureColumn(
    pool,
    'app_settings',
    'default_video_ref_mode',
    'ALTER TABLE app_settings ADD COLUMN default_video_ref_mode VARCHAR(16) NULL',
  )
  // 视频模型支持：provider_models 增加 is_video 列（与 is_image 并列，区分视频生成模型）
  await ensureColumn(
    pool,
    'provider_models',
    'is_video',
    'ALTER TABLE provider_models ADD COLUMN is_video TINYINT(1) NOT NULL DEFAULT 0 AFTER is_image',
  )
  // 模型类型标签：provider_models 增加 model_type 列（存储 image/video/text/embedding/audio/other）
  await ensureColumn(
    pool,
    'provider_models',
    'model_type',
    "ALTER TABLE provider_models ADD COLUMN model_type VARCHAR(20) NOT NULL DEFAULT 'other' AFTER is_video",
  )
  // 视频参考模式：drafts 增加 video_ref_mode 列（与持久化的参考图同步，防刷新后模式与图片错配）
  await ensureColumn(
    pool,
    'drafts',
    'video_ref_mode',
    "ALTER TABLE drafts ADD COLUMN video_ref_mode VARCHAR(16) NOT NULL DEFAULT 'first_frame'",
  )

  // 使用日志表：记录每次 AI 生成的完整 4 阶段数据（前端请求→上游请求→上游响应→前端响应）
  await pool.query(`CREATE TABLE IF NOT EXISTS usage_logs (
    id VARCHAR(64) PRIMARY KEY,
    topic_id VARCHAR(64) NULL,
    type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    provider_name VARCHAR(120) NULL,
    model VARCHAR(120) NULL,
    prompt TEXT NULL,
    client_request JSON NULL,
    upstream_request JSON NULL,
    upstream_response JSON NULL,
    client_response JSON NULL,
    error_message TEXT NULL,
    duration_ms INT NULL,
    created_at BIGINT NOT NULL,
    INDEX idx_usage_logs_created (created_at DESC)
  )`)

  // 幂等添加 result_files 列：存储生成的图片/视频 URL 列表，供列表页直接展示缩略图
  const [resultFilesCol] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usage_logs' AND COLUMN_NAME = 'result_files'`,
  )
  if (resultFilesCol[0].cnt === 0) {
    await pool.query('ALTER TABLE usage_logs ADD COLUMN result_files JSON NULL')
  }
}

/**
 * 幂等 upsert 预设中转站
 *
 * 用于让旧部署（providers 表已有数据，未走 seedProvidersIfEmpty）
 * 也能拿到新增的预设中转站（如火山方舟）。
 * 已存在记录仅更新 name/base_url/color，不影响 enabled/api_keys/is_builtin。
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ id: string; name: string; baseUrl: string; color?: string; enabled?: number }} preset
 */
export async function upsertPresetProvider(pool, preset) {
  await pool.query(
    `INSERT INTO providers
      (id, name, base_url, api_keys, enabled, request_mode, color, is_builtin, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, '[]', ?, 'openrouter-image', ?, 1, 999, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), base_url = VALUES(base_url), color = VALUES(color)`,
    [preset.id, preset.name, preset.baseUrl, preset.enabled ?? 0, preset.color || null, Date.now(), Date.now()],
  )
}

/**
 * 首次 seed：providers 表为空时写入预设列表
 *
 * OpenRouter 预设自动吸收：
 * - api_keys   ← server/.env 的 OPENROUTER_API_KEY（非空才写）
 * - base_url   ← 旧 app_settings.base_url（非空才覆盖）
 * - 旧 default_model 补一条 enabled 的图像模型记录
 * - app_settings.default_provider_id 置为 'openrouter'
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ envApiKey?: string; legacyBaseURL?: string; legacyDefaultModel?: string }} deps
 * @returns {Promise<{ seeded: boolean }>}
 */
export async function seedProvidersIfEmpty(pool, deps = {}) {
  const { envApiKey = '', legacyBaseURL = '', legacyDefaultModel = '' } = deps

  const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM providers')
  if (Number(rows[0]?.cnt) > 0) return { seeded: false }

  const now = Date.now()
  for (const [index, preset] of PRESET_PROVIDERS.entries()) {
    const apiKeys = preset.id === 'openrouter' && envApiKey ? [envApiKey] : []
    const baseUrl = preset.id === 'openrouter' && legacyBaseURL ? legacyBaseURL : preset.baseUrl
    await pool.query(
      `INSERT INTO providers
        (id, name, base_url, api_keys, enabled, request_mode, color, is_builtin, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'openrouter-image', ?, 1, ?, ?, ?)`,
      [
        preset.id,
        preset.name,
        baseUrl,
        JSON.stringify(apiKeys),
        preset.enabled,
        preset.color,
        index,
        now,
        now,
      ],
    )
  }

  if (legacyDefaultModel) {
    await pool.query(
      `INSERT INTO provider_models
        (id, provider_id, model_id, display_name, group_name, is_image, enabled, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, 1, 1, 0, ?)`,
      [createId(), 'openrouter', legacyDefaultModel, legacyDefaultModel, groupOfModel(legacyDefaultModel), now],
    )
  }

  await pool.query(
    `INSERT INTO app_settings
      (id, base_url, default_model, default_size, default_quality, default_n, request_mode, timeout, default_provider_id)
     VALUES (1, 'https://openrouter.ai/api/v1', ?, 'auto', 'high', 1, 'openrouter-image', 1200000, 'openrouter')
     ON DUPLICATE KEY UPDATE default_provider_id = 'openrouter'`,
    [legacyDefaultModel || 'openai/gpt-image-2'],
  )

  return { seeded: true }
}
