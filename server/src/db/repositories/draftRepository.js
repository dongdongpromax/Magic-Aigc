/**
 * 草稿仓储模块
 *
 * 负责 drafts / draft_reference_images 两张表的读写。
 * 所有写方法接收可选 executor 参数：
 *   - 默认为 pool（非事务场景）
 *   - 服务层在事务内显式传入 conn（PoolConnection），保证多步操作原子性
 */

/**
 * 创建草稿仓储
 * @param {import('mysql2/promise').Pool} pool 数据库连接池
 */
export function createDraftRepository(pool) {
  return {
    /**
     * 获取指定主题的草稿（含参考图列表）
     * @param {string} topicId 主题 ID
     * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} executor 可选执行器
     * @returns {Promise<object>} 草稿对象
     */
    async getDraft(topicId, executor = pool) {
      const [draftRows] = await executor.query(
        'SELECT * FROM drafts WHERE topic_id = ? LIMIT 1',
        [topicId],
      )
      const draft = draftRows[0]
      const referenceImages = await this.listReferenceImages(topicId, executor)

      return {
        topicId,
        prompt: draft?.prompt || '',
        model: draft?.model || 'openai/gpt-image-2',
        providerId: draft?.provider_id || '',
        size: draft?.size || 'auto',
        quality: draft?.quality || 'high',
        n: draft?.n || 1,
        referenceImages,
      }
    },

    /**
     * 列出指定主题的参考图（按 sort_order 排序）
     * @param {string} topicId 主题 ID
     * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} executor 可选执行器
     * @returns {Promise<Array<object>>} 参考图数组
     */
    async listReferenceImages(topicId, executor = pool) {
      const [referenceRows] = await executor.query(
        'SELECT * FROM draft_reference_images WHERE topic_id = ? ORDER BY sort_order ASC, created_at ASC',
        [topicId],
      )

      return referenceRows.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.mime_type,
        mimeType: row.mime_type,
        url: row.file_path,
        filePath: row.file_path,
        sourceMessageId: row.source_message_id,
      }))
    },

    /**
     * 统计指定主题当前参考图数量
     * @param {string} topicId 主题 ID
     * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} executor 可选执行器
     * @returns {Promise<number>} 参考图数量
     */
    async countReferenceImages(topicId, executor = pool) {
      const [rows] = await executor.query(
        'SELECT COUNT(*) AS cnt FROM draft_reference_images WHERE topic_id = ?',
        [topicId],
      )
      return Number(rows[0]?.cnt) || 0
    },

    /**
     * 保存草稿（prompt/model/size/quality/n 五项，不含参考图）
     *
     * 注意：本方法不清理也不写入参考图，参考图通过 addReferenceImages / addReferenceImagesFromMessage 单独管理。
     * 应由调用方通过 runTransaction 包裹以保证与参考图操作原子性。
     *
     * @param {string} topicId 主题 ID
     * @param {object} payload 草稿数据
     * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} executor 可选执行器
     * @returns {Promise<object>} 完整草稿对象（含真实 referenceImages，修复 B2）
     */
    async saveDraft(topicId, payload, executor = pool) {
      const next = {
        prompt: payload.prompt || '',
        model: payload.model || 'openai/gpt-image-2',
        providerId: payload.providerId || '',
        size: payload.size || 'auto',
        quality: payload.quality || 'high',
        n: payload.n || 1,
        updatedAt: Date.now(),
      }

      await executor.query(
        `INSERT INTO drafts (topic_id, prompt, model, provider_id, size, quality, n, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         prompt = VALUES(prompt),
         model = VALUES(model),
         provider_id = VALUES(provider_id),
         size = VALUES(size),
         quality = VALUES(quality),
         n = VALUES(n),
         updated_at = VALUES(updated_at)`,
        [
          topicId,
          next.prompt,
          next.model,
          next.providerId,
          next.size,
          next.quality,
          next.n,
          next.updatedAt,
        ],
      )

      // 修复 B2：返回真实 referenceImages 而非空数组，
      // 避免前端用返回值覆盖本地状态时丢失参考图
      const referenceImages = await this.listReferenceImages(topicId, executor)

      return {
        topicId,
        ...next,
        referenceImages,
      }
    },

    /**
     * 批量新增参考图（来自上传）
     *
     * 注意：for 循环里的多个 INSERT 应由调用方通过 runTransaction 包裹，
     * 避免中间失败留下部分插入。
     *
     * @param {string} topicId 主题 ID
     * @param {Array<object>} items 参考图元数据
     * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} executor 可选执行器
     * @returns {Promise<Array<object>>} 新增的参考图数组
     */
    async addReferenceImages(topicId, items, executor = pool) {
      for (const [index, item] of items.entries()) {
        await executor.query(
          `INSERT INTO draft_reference_images
            (id, topic_id, name, mime_type, file_path, source_message_id, sort_order, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id,
            topicId,
            item.name,
            item.mimeType || item.type || 'image/png',
            item.filePath,
            item.sourceMessageId || null,
            item.sortOrder ?? index,
            Date.now() + index,
          ],
        )
      }

      return items.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.mimeType || item.type || 'image/png',
        mimeType: item.mimeType || item.type || 'image/png',
        url: item.filePath,
        filePath: item.filePath,
        sourceMessageId: item.sourceMessageId || null,
      }))
    },

    /**
     * 把历史消息中的图片登记为当前主题的参考图
     *
     * 实现「设为参考图」功能：复用 message_images.file_path，不复制文件。
     * 应由调用方通过 runTransaction 包裹，与 verifyMessageBelongsToTopic 原子化。
     *
     * @param {string} topicId 主题 ID
     * @param {string} messageId 源消息 ID
     * @param {Array<string>} imageIds 源图片 ID 列表
     * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} executor 可选执行器
     * @returns {Promise<Array<object>>} 新增的参考图数组（若部分 imageId 不属于该 message 则跳过）
     */
    async addReferenceImagesFromMessage(topicId, messageId, imageIds, executor = pool) {
      if (!imageIds.length) return []

      // 查询 message_images 元数据，同时通过 message_id = ? 校验图片归属该消息
      const placeholders = imageIds.map(() => '?').join(', ')
      const [imageRows] = await executor.query(
        `SELECT id, file_path, file_name, mime_type
         FROM message_images
         WHERE id IN (${placeholders}) AND message_id = ?`,
        [...imageIds, messageId],
      )

      if (imageRows.length === 0) return []

      const now = Date.now()
      const items = imageRows.map((row, index) => ({
        id: globalThis.crypto?.randomUUID?.() || `${now}-${index}-${Math.random().toString(16).slice(2)}`,
        name: row.file_name,
        mimeType: row.mime_type,
        filePath: row.file_path, // 复用 message_images.file_path，不复制文件
        sourceMessageId: messageId,
      }))

      for (const [index, item] of items.entries()) {
        await executor.query(
          `INSERT INTO draft_reference_images
            (id, topic_id, name, mime_type, file_path, source_message_id, sort_order, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [item.id, topicId, item.name, item.mimeType, item.filePath, item.sourceMessageId, index, now + index],
        )
      }

      return items.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.mimeType,
        mimeType: item.mimeType,
        url: item.filePath,
        filePath: item.filePath,
        sourceMessageId: item.sourceMessageId,
      }))
    },

    /**
     * 删除单个参考图记录
     * @param {string} topicId 主题 ID
     * @param {string} referenceId 参考图 ID
     * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} executor 可选执行器
     * @returns {Promise<{success: boolean}>}
     */
    async removeReferenceImage(topicId, referenceId, executor = pool) {
      await executor.query('DELETE FROM draft_reference_images WHERE topic_id = ? AND id = ?', [
        topicId,
        referenceId,
      ])

      return { success: true }
    },

    /**
     * 清空指定主题的所有参考图
     * @param {string} topicId 主题 ID
     * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} executor 可选执行器
     * @returns {Promise<void>}
     */
    async clearReferenceImages(topicId, executor = pool) {
      await executor.query('DELETE FROM draft_reference_images WHERE topic_id = ?', [topicId])
    },
  }
}
