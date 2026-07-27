/**
 * 使用日志仓储模块
 *
 * 负责 usage_logs 表的读写，记录每次 AI 生成（图像/视频）的完整 4 阶段数据。
 * 所有方法接收可选 executor 参数（pool 或 conn），与其它 repository 保持一致。
 */

/**
 * 生成唯一 ID，优先使用 crypto.randomUUID，回退到时间戳+随机数
 * @returns {string}
 */
function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * 把 JSON 字段安全解析为对象（兼容字符串与对象两种存储形式）
 * @param {string|object|null|undefined} value
 * @returns {object|null}
 */
function parseJson(value) {
  if (!value) return null
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }
  return value
}

/**
 * 创建使用日志仓储
 * @param {import('mysql2/promise').Pool} pool 数据库连接池
 */
export function createUsageLogRepository(pool) {
  return {
    /**
     * 创建一条使用日志
     * @param {{
     *   topicId?: string;
     *   type: string;
     *   status: string;
     *   providerName?: string;
     *   model?: string;
     *   prompt?: string;
     *   clientRequest?: object;
     *   upstreamRequest?: object;
     *   upstreamResponse?: object;
     *   clientResponse?: object;
     *   resultFiles?: Array<{ url: string; mimeType: string; kind: string }>;
     *   errorMessage?: string;
     *   durationMs?: number;
     * }} entry
     * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} executor 可选执行器
     * @returns {Promise<string>} 日志 ID
     */
    async create(entry, executor = pool) {
      const id = createId()
      const now = Date.now()
      await executor.query(
        `INSERT INTO usage_logs
          (id, topic_id, type, status, provider_name, model, prompt,
           client_request, upstream_request, upstream_response, client_response,
           result_files, error_message, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          entry.topicId || null,
          entry.type,
          entry.status,
          entry.providerName || null,
          entry.model || null,
          entry.prompt || null,
          entry.clientRequest ? JSON.stringify(entry.clientRequest) : null,
          entry.upstreamRequest ? JSON.stringify(entry.upstreamRequest) : null,
          entry.upstreamResponse ? JSON.stringify(entry.upstreamResponse) : null,
          entry.clientResponse ? JSON.stringify(entry.clientResponse) : null,
          entry.resultFiles ? JSON.stringify(entry.resultFiles) : null,
          entry.errorMessage || null,
          entry.durationMs ?? null,
          now,
        ],
      )
      return id
    },

    /**
     * 列出使用日志（摘要信息，不含完整 JSON 负载，避免大数据量列表过慢）
     * @param {{ type?: string; limit?: number; offset?: number }} options 筛选与分页
     * @returns {Promise<Array<object>>}
     */
    async list(options = {}) {
      const { type, limit = 100, offset = 0 } = options
      const params = []
      let sql = `SELECT id, topic_id, type, status, provider_name, model, prompt,
                        result_files, error_message, duration_ms, created_at
                 FROM usage_logs`
      if (type) {
        sql += ' WHERE type = ?'
        params.push(type)
      }
      sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
      params.push(limit, offset)

      const [rows] = await pool.query(sql, params)
      return rows.map((row) => ({
        id: row.id,
        topicId: row.topic_id,
        type: row.type,
        status: row.status,
        providerName: row.provider_name,
        model: row.model,
        prompt: row.prompt,
        resultFiles: parseJson(row.result_files),
        errorMessage: row.error_message,
        durationMs: row.duration_ms,
        createdAt: row.created_at,
      }))
    },

    /**
     * 获取单条日志详情（含完整 4 阶段 JSON 负载）
     * @param {string} id 日志 ID
     * @returns {Promise<object|null>}
     */
    async findById(id) {
      const [rows] = await pool.query('SELECT * FROM usage_logs WHERE id = ? LIMIT 1', [id])
      const row = rows[0]
      if (!row) return null
      return {
        id: row.id,
        topicId: row.topic_id,
        type: row.type,
        status: row.status,
        providerName: row.provider_name,
        model: row.model,
        prompt: row.prompt,
        clientRequest: parseJson(row.client_request),
        upstreamRequest: parseJson(row.upstream_request),
        upstreamResponse: parseJson(row.upstream_response),
        clientResponse: parseJson(row.client_response),
        resultFiles: parseJson(row.result_files),
        errorMessage: row.error_message,
        durationMs: row.duration_ms,
        createdAt: row.created_at,
      }
    },

    /**
     * 删除单条日志
     * @param {string} id 日志 ID
     * @returns {Promise<boolean>} 是否删除成功
     */
    async deleteById(id) {
      const [result] = await pool.query('DELETE FROM usage_logs WHERE id = ?', [id])
      return result.affectedRows > 0
    },

    /**
     * 清空所有日志
     * @returns {Promise<number>} 删除的行数
     */
    async deleteAll() {
      const [result] = await pool.query('DELETE FROM usage_logs')
      return result.affectedRows
    },

    /** 按 type 聚合统计：返回 { image, video, total } */
    async countByType() {
      const [rows] = await pool.query(
        'SELECT type, COUNT(*) AS cnt FROM usage_logs GROUP BY type',
      )
      const result = { image: 0, video: 0, total: 0 }
      for (const row of rows) {
        if (row.type === 'image') result.image = Number(row.cnt)
        if (row.type === 'video') result.video = Number(row.cnt)
        result.total += Number(row.cnt)
      }
      return result
    },
  }
}
