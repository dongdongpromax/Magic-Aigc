function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function parseMeta(meta) {
  if (!meta) return {}
  if (typeof meta === 'string') {
    return JSON.parse(meta)
  }

  return meta
}

export function createTopicRepository(pool) {
  return {
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

    async saveGeneratedConversation({ topicId, prompt, revisedPrompt, draft, images }) {
      const now = Date.now()
      const userMessageId = createId()
      const assistantMessageId = createId()

      await pool.query(
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

      await pool.query(
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
          JSON.stringify({ imageCount: images.length }),
          now + 1,
        ],
      )

      for (const image of images) {
        await pool.query(
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

      await pool.query(
        `UPDATE topics
         SET cover_image_path = ?, last_prompt = ?, message_count = message_count + 2, status = ?, updated_at = ?
         WHERE id = ?`,
        [images[0]?.url || null, prompt, 'idle', now + 3, topicId],
      )

      return {
        id: assistantMessageId,
        topicId,
        type: 'assistant_images',
        role: 'assistant',
        prompt,
        revisedPrompt: revisedPrompt || '',
        images,
        model: draft.model || 'openai/gpt-image-2',
        size: draft.size || 'auto',
        quality: draft.quality || 'high',
        n: draft.n || 1,
        sourceMessageId: draft.referenceImages?.[0]?.sourceMessageId || userMessageId,
        createdAt: now + 1,
      }
    },
  }
}
