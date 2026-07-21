/**
 * 主题仓储模块
 *
 * 负责 topics / messages / message_images 三张表的读写。
 * 所有方法接收可选 executor 参数：
 *   - 默认为 pool（非事务场景，每次 query 走连接池）
 *   - 服务层在事务内显式传入 conn（PoolConnection），保证多步操作原子性
 * 二者鸭子类型兼容（都暴露 .query），无需新接口。
 */

/**
 * 生成唯一 ID，优先使用 crypto.randomUUID，回退到时间戳+随机数
 * @returns {string}
 */
function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * 解析 meta_json 字段，兼容字符串与对象两种存储形式
 * @param {string|object|null|undefined} meta
 * @returns {object}
 */
function parseMeta(meta) {
  if (!meta) return {}
  if (typeof meta === 'string') {
    return JSON.parse(meta)
  }

  return meta
}

/**
 * 创建主题仓储
 * @param {import('mysql2/promise').Pool} pool 数据库连接池
 */
export function createTopicRepository(pool) {
  return {
    /**
     * 列出所有主题，按更新时间倒序
     * @returns {Promise<Array<object>>}
     */
    async listTopics() {
      const [rows] = await pool.query(
        'SELECT * FROM topics ORDER BY updated_at DESC, created_at DESC',
      )

      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        coverImage: row.cover_image_path,
        lastPrompt: row.last_prompt,
        messageCount: row.message_count,
        status: row.status,
        updatedAt: row.updated_at,
        createdAt: row.created_at,
      }))
    },

    /**
     * 列出指定主题下的所有消息（含关联图片）
     * @param {string} topicId 主题 ID
     * @returns {Promise<Array<object>>}
     */
    async listMessages(topicId) {
      const [rows] = await pool.query(
        'SELECT * FROM messages WHERE topic_id = ? ORDER BY created_at ASC',
        [topicId],
      )

      const messageIds = rows.map((row) => row.id)
      const [imageRows] = messageIds.length
        ? await pool.query(
            `SELECT * FROM message_images
             WHERE message_id IN (${messageIds.map(() => '?').join(', ')})
             ORDER BY created_at ASC`,
            messageIds,
          )
        : [[]]

      // 按 message_id 聚合图片，便于前端渲染
      const imagesByMessageId = imageRows.reduce((acc, row) => {
        acc[row.message_id] ||= []
        acc[row.message_id].push({
          id: row.id,
          url: row.file_path,
          localPath: row.file_path,
          fileName: row.file_name,
          mimeType: row.mime_type,
          width: row.width,
          height: row.height,
          savedToProject: Boolean(row.saved_to_project),
        })
        return acc
      }, {})

      return rows.map((row) => ({
        id: row.id,
        topicId: row.topic_id,
        type: row.type,
        role: row.role,
        content: row.content,
        prompt: row.prompt,
        revisedPrompt: row.revised_prompt,
        model: row.model,
        size: row.size,
        quality: row.quality,
        n: row.n,
        status: row.status,
        sourceMessageId: row.source_message_id,
        meta: parseMeta(row.meta_json),
        images: imagesByMessageId[row.id] || [],
        createdAt: row.created_at,
      }))
    },

    /**
     * 创建新主题
     * @param {string} title 主题标题
     * @returns {Promise<object>} 创建的主题对象
     */
    async createTopic(title = '新主题') {
      const now = Date.now()
      const topic = {
        id: createId(),
        title,
        coverImage: null,
        lastPrompt: '',
        messageCount: 0,
        status: 'idle',
        updatedAt: now,
        createdAt: now,
      }

      await pool.query(
        'INSERT INTO topics (id, title, cover_image_path, last_prompt, message_count, status, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          topic.id,
          topic.title,
          topic.coverImage,
          topic.lastPrompt,
          topic.messageCount,
          topic.status,
          topic.updatedAt,
          topic.createdAt,
        ],
      )

      return topic
    },

    /**
     * 校验消息是否属于指定主题（防跨主题引用）
     * @param {string} topicId 主题 ID
     * @param {string} messageId 消息 ID
     * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} executor 可选执行器
     * @returns {Promise<boolean>} 属于返回 true，否则 false
     */
    async verifyMessageBelongsToTopic(topicId, messageId, executor = pool) {
      const [rows] = await executor.query(
        'SELECT id FROM messages WHERE id = ? AND topic_id = ? LIMIT 1',
        [messageId, topicId],
      )
      return rows.length > 0
    },

    /**
     * 保存一次完整的生成对话（用户 prompt + AI 图片消息 + 图片元数据 + 主题更新）
     *
     * 注意：本方法不在内部开启事务，应由调用方（服务层）通过 runTransaction 包裹，
     * 以便与 clearReferenceImages / saveDraft 等操作原子化。
     *
     * @param {{ topicId: string; prompt: string; revisedPrompt: string; draft: object; images: Array<object> }} payload
     * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} executor 可选执行器，事务场景传入 conn
     * @returns {Promise<object>} 创建的 assistant 消息对象
     */
    async saveGeneratedConversation({ topicId, prompt, revisedPrompt, draft, images }, executor = pool) {
      const now = Date.now()
      const userMessageId = createId()
      const assistantMessageId = createId()
      // 防御性处理：images 可能为 undefined/null，避免 TypeError
      const safeImages = Array.isArray(images) ? images : []

      await executor.query(
        `INSERT INTO messages
          (id, topic_id, type, role, content, prompt, revised_prompt, model, size, quality, n, status, source_message_id, meta_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userMessageId,
          topicId,
          'user_prompt',
          'user',
          null,
          prompt,
          null,
          draft.model || 'openai/gpt-image-2',
          draft.size || 'auto',
          draft.quality || 'high',
          draft.n || 1,
          'done',
          null,
          JSON.stringify({ referenceCount: draft.referenceImages?.length || 0 }),
          now,
        ],
      )

      await executor.query(
        `INSERT INTO messages
          (id, topic_id, type, role, content, prompt, revised_prompt, model, size, quality, n, status, source_message_id, meta_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          assistantMessageId,
          topicId,
          'assistant_images',
          'assistant',
          null,
          prompt,
          revisedPrompt || '',
          draft.model || 'openai/gpt-image-2',
          draft.size || 'auto',
          draft.quality || 'high',
          draft.n || 1,
          'done',
          draft.referenceImages?.[0]?.sourceMessageId || userMessageId,
          JSON.stringify({ imageCount: safeImages.length }),
          now + 1,
        ],
      )

      for (const image of safeImages) {
        await executor.query(
          `INSERT INTO message_images
            (id, message_id, file_path, file_name, mime_type, width, height, saved_to_project, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            createId(),
            assistantMessageId,
            image.localPath || image.url,
            image.fileName || 'generated.png',
            image.mimeType || 'image/png',
            image.width || null,
            image.height || null,
            image.savedToProject ? 1 : 0,
            now + 2,
          ],
        )
      }

      // 更新主题封面、最近 prompt、消息计数、状态
      await executor.query(
        `UPDATE topics
         SET cover_image_path = ?, last_prompt = ?, message_count = message_count + 2, status = ?, updated_at = ?
         WHERE id = ?`,
        // 封面取首张图 url，无图时保持 null（防御性判空，防 images 是 undefined 时抛 TypeError）
        [safeImages.length ? safeImages[0]?.url || null : null, prompt, 'idle', now + 3, topicId],
      )

      return {
        id: assistantMessageId,
        topicId,
        type: 'assistant_images',
        role: 'assistant',
        prompt,
        revisedPrompt: revisedPrompt || '',
        images: safeImages,
        model: draft.model || 'openai/gpt-image-2',
        size: draft.size || 'auto',
        quality: draft.quality || 'high',
        n: draft.n || 1,
        sourceMessageId: draft.referenceImages?.[0]?.sourceMessageId || userMessageId,
        createdAt: now + 1,
      }
    },

    /**
     * 收集指定主题下所有需要清理的文件路径（生成图 + 参考图）
     *
     * 用于删除主题时事务后 best-effort 清理文件系统。
     * 跨 message_images 和 draft_reference_images 两张表查询，
     * 用 Set 去重避免同一文件被 draft 引用时重复 unlink。
     *
     * @param {string} topicId 主题 ID
     * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} executor 可选执行器
     * @returns {Promise<Array<string>>} 文件路径数组（已去重）
     */
    async listTopicFilePaths(topicId, executor = pool) {
      const [messageImageRows] = await executor.query(
        `SELECT mi.file_path AS file_path
         FROM message_images mi
         JOIN messages m ON mi.message_id = m.id
         WHERE m.topic_id = ?`,
        [topicId],
      )

      const [draftRefRows] = await executor.query(
        'SELECT file_path FROM draft_reference_images WHERE topic_id = ?',
        [topicId],
      )

      // Set 去重：同一文件可能同时被 message_images 和 draft_reference_images 引用
      const uniquePaths = new Set()
      for (const row of [...messageImageRows, ...draftRefRows]) {
        if (row.file_path) uniquePaths.add(row.file_path)
      }
      return [...uniquePaths]
    },

    /**
     * 删除主题及其所有关联数据（messages / message_images / drafts / draft_reference_images / topics）
     *
     * 注意：本方法不在内部开启事务，应由调用方通过 runTransaction 包裹。
     * 文件清理不在此方法内，由 service 层在事务提交后 best-effort 执行（DB 是真相，文件可 GC）。
     *
     * @param {string} topicId 主题 ID
     * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} executor 可选执行器
     * @returns {Promise<boolean>} 主题存在并删除返回 true，主题不存在返回 false
     */
    async deleteTopic(topicId, executor = pool) {
      // 先校验主题存在，不存在返回 false 让服务层抛 404
      const [topicRows] = await executor.query('SELECT id FROM topics WHERE id = ? LIMIT 1', [topicId])
      if (topicRows.length === 0) return false

      // 按外键依赖反序删除（即使无 FK 约束也保持正确性）
      await executor.query(
        `DELETE FROM message_images
         WHERE message_id IN (SELECT id FROM (SELECT id FROM messages WHERE topic_id = ?) AS sub)`,
        [topicId],
      )
      await executor.query('DELETE FROM messages WHERE topic_id = ?', [topicId])
      await executor.query('DELETE FROM draft_reference_images WHERE topic_id = ?', [topicId])
      await executor.query('DELETE FROM drafts WHERE topic_id = ?', [topicId])
      await executor.query('DELETE FROM topics WHERE id = ?', [topicId])

      return true
    },
  }
}
