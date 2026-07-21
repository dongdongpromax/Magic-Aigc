export function createDraftRepository(pool) {
  return {
    async getDraft(topicId) {
      const [draftRows] = await pool.query('SELECT * FROM drafts WHERE topic_id = ? LIMIT 1', [topicId])
      const [referenceRows] = await pool.query(
        'SELECT * FROM draft_reference_images WHERE topic_id = ? ORDER BY sort_order ASC, created_at ASC',
        [topicId],
      )

      const draft = draftRows[0]

      return {
        topicId,
        prompt: draft?.prompt || '',
        model: draft?.model || 'openai/gpt-image-2',
        size: draft?.size || 'auto',
        quality: draft?.quality || 'high',
        n: draft?.n || 1,
        referenceImages: referenceRows.map((row) => ({
          id: row.id,
          name: row.name,
          type: row.mime_type,
          url: row.file_path,
          filePath: row.file_path,
          sourceMessageId: row.source_message_id,
        })),
      }
    },

    async saveDraft(topicId, payload) {
      const next = {
        prompt: payload.prompt || '',
        model: payload.model || 'openai/gpt-image-2',
        size: payload.size || 'auto',
        quality: payload.quality || 'high',
        n: payload.n || 1,
        updatedAt: Date.now(),
      }

      await pool.query(
        `INSERT INTO drafts (topic_id, prompt, model, size, quality, n, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         prompt = VALUES(prompt),
         model = VALUES(model),
         size = VALUES(size),
         quality = VALUES(quality),
         n = VALUES(n),
         updated_at = VALUES(updated_at)`,
        [topicId, next.prompt, next.model, next.size, next.quality, next.n, next.updatedAt],
      )

      return {
        topicId,
        ...next,
        referenceImages: [],
      }
    },

    async addReferenceImages(topicId, items) {
      for (const [index, item] of items.entries()) {
        await pool.query(
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

    async removeReferenceImage(topicId, referenceId) {
      await pool.query('DELETE FROM draft_reference_images WHERE topic_id = ? AND id = ?', [
        topicId,
        referenceId,
      ])

      return { success: true }
    },

    async clearReferenceImages(topicId) {
      await pool.query('DELETE FROM draft_reference_images WHERE topic_id = ?', [topicId])
    },
  }
}
