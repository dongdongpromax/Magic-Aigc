/**
 * 提示词库仓储模块
 *
 * 负责 prompts 表的读写，管理视频/图片/音频/文本四类提示词及其效果素材。
 * 所有方法接收可选 executor 参数（pool 或 conn），与其它 repository 保持一致。
 * tags / assets 为 JSON 字段，写入时序列化为字符串，读取时解析为对象（兼容两种存储形态）。
 */

/**
 * 生成唯一 ID，优先使用 crypto.randomUUID，回退到时间戳+随机数
 * @returns {string}
 */
function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * 把 JSON 字段安全解析为数组（兼容字符串与数组两种存储形式）
 * @param {string|Array|null|undefined} value
 * @param {Array} fallback 解析失败时的回退值
 * @returns {Array}
 */
function parseJsonArray(value, fallback = []) {
  if (!value) return fallback
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : fallback
    } catch {
      return fallback
    }
  }
  return Array.isArray(value) ? value : fallback
}

/** 提示词类型白名单（用于 create/update 校验） */
const ALLOWED_TYPES = new Set(['video', 'image', 'audio', 'text'])

/**
 * 创建提示词库仓储
 * @param {import('mysql2/promise').Pool} pool 数据库连接池
 */
export function createPromptRepository(pool) {
  return {
    /**
     * 列出提示词（摘要信息，含 assets 用于缩略图）
     * 支持按 type / tag / keyword 筛选，按 sort_order、created_at 倒序排列
     * @param {{ type?: string; tag?: string; keyword?: string; limit?: number }} options
     * @returns {Promise<Array<object>>}
     */
    async list(options = {}) {
      const { type, tag, keyword, limit = 200 } = options
      const conditions = []
      const params = []

      if (type && ALLOWED_TYPES.has(type)) {
        conditions.push('type = ?')
        params.push(type)
      }
      // tag 筛选：tags 是 JSON 数组，用 JSON_CONTAINS 匹配字符串元素
      if (tag) {
        conditions.push('JSON_CONTAINS(tags, JSON_QUOTE(?))')
        params.push(tag)
      }
      // keyword 筛选：标题与正文模糊匹配
      if (keyword) {
        conditions.push('(title LIKE ? OR content LIKE ?)')
        params.push(`%${keyword}%`, `%${keyword}%`)
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
      const safeLimit = Math.min(Number(limit) || 200, 500)
      const sql = `SELECT id, title, content, type, tags, assets, notes, sort_order, created_at, updated_at
                   FROM prompts ${where}
                   ORDER BY sort_order ASC, created_at DESC LIMIT ?`
      params.push(safeLimit)

      const [rows] = await pool.query(sql, params)
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        type: row.type,
        tags: parseJsonArray(row.tags),
        assets: parseJsonArray(row.assets),
        notes: row.notes,
        sortOrder: row.sort_order,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    },

    /**
     * 获取单条提示词详情
     * @param {string} id 提示词 ID
     * @returns {Promise<object|null>}
     */
    async findById(id) {
      const [rows] = await pool.query('SELECT * FROM prompts WHERE id = ? LIMIT 1', [id])
      const row = rows[0]
      if (!row) return null
      return {
        id: row.id,
        title: row.title,
        content: row.content,
        type: row.type,
        tags: parseJsonArray(row.tags),
        assets: parseJsonArray(row.assets),
        notes: row.notes,
        sortOrder: row.sort_order,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    },

    /**
     * 新建提示词
     * @param {{ title: string; content: string; type: string; tags?: Array<string>; assets?: Array<object>; notes?: string }} entry
     * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} executor 可选执行器
     * @returns {Promise<string>} 新提示词 ID
     */
    async create(entry, executor = pool) {
      const id = createId()
      const now = Date.now()
      const type = ALLOWED_TYPES.has(entry.type) ? entry.type : 'text'
      await executor.query(
        `INSERT INTO prompts
          (id, title, content, type, tags, assets, notes, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          entry.title || '未命名提示词',
          entry.content || '',
          type,
          JSON.stringify(entry.tags || []),
          JSON.stringify(entry.assets || []),
          entry.notes || null,
          0,
          now,
          now,
        ],
      )
      return id
    },

    /**
     * 更新提示词（部分字段，仅更新 patch 中出现的字段）
     * @param {string} id 提示词 ID
     * @param {{ title?: string; content?: string; type?: string; tags?: Array<string>; assets?: Array<object>; notes?: string; sortOrder?: number }} patch
     * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} executor 可选执行器
     * @returns {Promise<boolean>} 是否更新成功（目标是否存在）
     */
    async update(id, patch, executor = pool) {
      const fields = []
      const params = []

      if (patch.title !== undefined) {
        fields.push('title = ?')
        params.push(patch.title)
      }
      if (patch.content !== undefined) {
        fields.push('content = ?')
        params.push(patch.content)
      }
      if (patch.type !== undefined && ALLOWED_TYPES.has(patch.type)) {
        fields.push('type = ?')
        params.push(patch.type)
      }
      if (patch.tags !== undefined) {
        fields.push('tags = ?')
        params.push(JSON.stringify(patch.tags))
      }
      if (patch.assets !== undefined) {
        fields.push('assets = ?')
        params.push(JSON.stringify(patch.assets))
      }
      if (patch.notes !== undefined) {
        fields.push('notes = ?')
        params.push(patch.notes)
      }
      if (patch.sortOrder !== undefined) {
        fields.push('sort_order = ?')
        params.push(patch.sortOrder)
      }

      if (!fields.length) {
        // 没有可更新字段：仅校验目标存在
        const [rows] = await executor.query('SELECT id FROM prompts WHERE id = ? LIMIT 1', [id])
        return rows.length > 0
      }

      fields.push('updated_at = ?')
      params.push(Date.now())
      params.push(id)

      const [result] = await executor.query(
        `UPDATE prompts SET ${fields.join(', ')} WHERE id = ?`,
        params,
      )
      return result.affectedRows > 0
    },

    /**
     * 删除单条提示词
     * @param {string} id 提示词 ID
     * @returns {Promise<boolean>} 是否删除成功
     */
    async deleteById(id) {
      const [result] = await pool.query('DELETE FROM prompts WHERE id = ?', [id])
      return result.affectedRows > 0
    },

    /** 统计提示词总数（供首页统计卡片使用） */
    async count() {
      const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM prompts')
      return Number(rows[0]?.cnt) || 0
    },
  }
}
