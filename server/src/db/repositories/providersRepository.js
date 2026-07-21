import { groupOfModel } from '../seedProviders.js'

/**
 * 中转站仓储模块
 *
 * 负责 providers / provider_models 两张表的读写。
 * api_keys 为 JSON 列：mysql2 多数情况自动解析为数组，
 * 但部分配置下返回字符串，此处统一兼容两种形态。
 */

/**
 * 解析 api_keys JSON 列为字符串数组
 * @param {unknown} raw
 * @returns {Array<string>}
 */
function parseApiKeys(raw) {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

/**
 * providers 行 → 驼峰对象
 */
function mapProviderRow(row) {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    apiKeys: parseApiKeys(row.api_keys),
    enabled: Boolean(row.enabled),
    requestMode: row.request_mode,
    color: row.color,
    isBuiltin: Boolean(row.is_builtin),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    modelCount: row.model_count != null ? Number(row.model_count) : undefined,
    enabledModelCount:
      row.enabled_model_count != null ? Number(row.enabled_model_count) : undefined,
  }
}

/**
 * provider_models 行 → 驼峰对象
 */
function mapModelRow(row) {
  return {
    id: row.id,
    providerId: row.provider_id,
    modelId: row.model_id,
    displayName: row.display_name,
    groupName: row.group_name,
    isImage: Boolean(row.is_image),
    enabled: Boolean(row.enabled),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  }
}

/**
 * 创建中转站仓储
 * @param {import('mysql2/promise').Pool} pool
 */
export function createProvidersRepository(pool) {
  return {
    /**
     * 列出全部中转站（按 sort_order），含模型统计与已启用模型简表
     * 已启用模型简表供聊天输入框的分组选择器一次取齐，避免 N+1
     * @returns {Promise<Array<object>>}
     */
    async listProviders() {
      const [rows] = await pool.query(
        `SELECT p.*,
          (SELECT COUNT(*) FROM provider_models m WHERE m.provider_id = p.id) AS model_count,
          (SELECT COUNT(*) FROM provider_models m WHERE m.provider_id = p.id AND m.enabled = 1) AS enabled_model_count
         FROM providers p ORDER BY p.sort_order ASC, p.created_at ASC`,
      )
      const providers = rows.map(mapProviderRow)

      const [modelRows] = await pool.query(
        `SELECT provider_id, model_id, display_name FROM provider_models WHERE enabled = 1 ORDER BY sort_order ASC, created_at ASC`,
      )
      const byProvider = new Map()
      for (const m of modelRows) {
        if (!byProvider.has(m.provider_id)) byProvider.set(m.provider_id, [])
        byProvider.get(m.provider_id).push({ modelId: m.model_id, displayName: m.display_name })
      }
      for (const p of providers) {
        p.enabledModels = byProvider.get(p.id) || []
      }

      return providers
    },

    /**
     * 按 ID 取单个中转站
     * @param {string} id
     * @returns {Promise<object|null>}
     */
    async getProvider(id) {
      const [rows] = await pool.query('SELECT * FROM providers WHERE id = ? LIMIT 1', [id])
      return rows[0] ? mapProviderRow(rows[0]) : null
    },

    /**
     * 取第一个启用中的中转站（default_provider_id 回退链末端）
     * @returns {Promise<object|null>}
     */
    async getFirstEnabledProvider() {
      const [rows] = await pool.query(
        'SELECT * FROM providers WHERE enabled = 1 ORDER BY sort_order ASC LIMIT 1',
      )
      return rows[0] ? mapProviderRow(rows[0]) : null
    },

    /**
     * 新增自定义中转站
     * @param {{ id: string; name: string; baseUrl: string; apiKeys?: Array<string>; color?: string }} data
     * @returns {Promise<object>} 新建对象
     */
    async createProvider(data) {
      const now = Date.now()
      await pool.query(
        `INSERT INTO providers
          (id, name, base_url, api_keys, enabled, request_mode, color, is_builtin, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'openrouter-image', ?, 0, ?, ?, ?)`,
        [
          data.id,
          data.name,
          data.baseUrl,
          JSON.stringify(data.apiKeys || []),
          data.enabled === false ? 0 : 1,
          data.color || null,
          data.sortOrder ?? 100,
          now,
          now,
        ],
      )
      return this.getProvider(data.id)
    },

    /**
     * 部分更新中转站（仅更新传入字段）
     * @param {string} id
     * @param {{ name?: string; baseUrl?: string; apiKeys?: Array<string>; requestMode?: string }} patch
     * @returns {Promise<object>} 更新后对象
     */
    async updateProvider(id, patch) {
      const sets = []
      const params = []
      if (patch.name !== undefined) {
        sets.push('name = ?')
        params.push(patch.name)
      }
      if (patch.baseUrl !== undefined) {
        sets.push('base_url = ?')
        params.push(patch.baseUrl)
      }
      if (patch.apiKeys !== undefined) {
        sets.push('api_keys = ?')
        params.push(JSON.stringify(patch.apiKeys))
      }
      if (patch.requestMode !== undefined) {
        sets.push('request_mode = ?')
        params.push(patch.requestMode)
      }
      if (sets.length) {
        sets.push('updated_at = ?')
        params.push(Date.now(), id)
        await pool.query(`UPDATE providers SET ${sets.join(', ')} WHERE id = ?`, params)
      }
      return this.getProvider(id)
    },

    /**
     * 整家开关
     * @param {string} id
     * @param {boolean} enabled
     */
    async setProviderEnabled(id, enabled) {
      await pool.query('UPDATE providers SET enabled = ? WHERE id = ?', [
        enabled ? 1 : 0,
        id,
      ])
    },

    /**
     * 删除中转站（先把引用它的草稿 provider_id 置 NULL 回退默认，再删其模型与本体）
     * @param {string} id
     */
    async deleteProvider(id) {
      await pool.query('UPDATE drafts SET provider_id = NULL WHERE provider_id = ?', [id])
      await pool.query('DELETE FROM provider_models WHERE provider_id = ?', [id])
      await pool.query('DELETE FROM providers WHERE id = ?', [id])
    },

    /**
     * 列出指定中转站的全部模型（含禁用）
     * @param {string} providerId
     * @returns {Promise<Array<object>>}
     */
    async listModels(providerId) {
      const [rows] = await pool.query(
        'SELECT * FROM provider_models WHERE provider_id = ? ORDER BY sort_order ASC, created_at ASC',
        [providerId],
      )
      return rows.map(mapModelRow)
    },

    /**
     * 手动添加模型（默认启用，is_image 按关键词判断由调用方传入）
     * @param {string} providerId
     * @param {{ modelId: string; displayName?: string; isImage?: boolean }} data
     * @returns {Promise<object>}
     */
    async addModel(providerId, data) {
      const id =
        globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
      await pool.query(
        `INSERT INTO provider_models
          (id, provider_id, model_id, display_name, group_name, is_image, enabled, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, 999, ?)`,
        [
          id,
          providerId,
          data.modelId,
          data.displayName || data.modelId,
          groupOfModel(data.modelId),
          data.isImage ? 1 : 0,
          Date.now(),
        ],
      )
      const [rows] = await pool.query('SELECT * FROM provider_models WHERE id = ?', [id])
      return mapModelRow(rows[0])
    },

    /**
     * fetch 合并：新增行插入（图像模型默认启用），已存在行仅更新 display_name
     * @param {string} providerId
     * @param {Array<{ modelId: string; displayName: string; isImage: boolean }>} models
     */
    async upsertFetchedModels(providerId, models) {
      const now = Date.now()
      for (const [index, m] of models.entries()) {
        const id =
          globalThis.crypto?.randomUUID?.() ||
          `${now}-${index}-${Math.random().toString(16).slice(2)}`
        await pool.query(
          `INSERT INTO provider_models
            (id, provider_id, model_id, display_name, group_name, is_image, enabled, sort_order, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE display_name = VALUES(display_name)`,
          [
            id,
            providerId,
            m.modelId,
            m.displayName,
            groupOfModel(m.modelId),
            m.isImage ? 1 : 0,
            m.isImage ? 1 : 0,
            index,
            now,
          ],
        )
      }
    },

    /**
     * 单模型开关
     * @param {string} providerId
     * @param {string} modelId
     * @param {boolean} enabled
     */
    async setModelEnabled(providerId, modelId, enabled) {
      await pool.query(
        'UPDATE provider_models SET enabled = ? WHERE provider_id = ? AND model_id = ?',
        [enabled ? 1 : 0, providerId, modelId],
      )
    },

    /**
     * 删除单个模型
     * @param {string} providerId
     * @param {string} modelId
     */
    async deleteModel(providerId, modelId) {
      await pool.query('DELETE FROM provider_models WHERE provider_id = ? AND model_id = ?', [
        providerId,
        modelId,
      ])
    },
  }
}
