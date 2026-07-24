/**
 * 草稿仓储模块测试
 *
 * 覆盖 P0-5/P0-7/P1-2 引入的新方法和事务兼容性：
 *   - addReferenceImages 默认 pool / 自定义 executor 两条路径
 *   - addReferenceImagesFromMessage 复用 file_path、空结果短路
 *   - listReferenceImages / countReferenceImages 字段映射
 *   - saveDraft 返回真实 referenceImages（修复 B2）
 *   - clearReferenceImages / removeReferenceImages 执行 DELETE
 */
import { describe, expect, it, vi } from 'vitest'
import { createDraftRepository } from './draftRepository.js'

/**
 * 构造 mock executor，支持 mockResolvedValueOnce 链式返回
 */
function createMockExecutor() {
  return { query: vi.fn() }
}

describe('draftRepository', () => {
  describe('addReferenceImages', () => {
    it('默认使用 pool 作为 executor', async () => {
      const pool = createMockExecutor()
      pool.query.mockResolvedValue([{}])
      const repo = createDraftRepository(pool)

      await repo.addReferenceImages('topic-1', [
        { id: 'ref-1', name: 'a.png', filePath: '/files/references/a.png', mimeType: 'image/png' },
      ])

      // 默认 executor 即 pool，应调 pool.query
      expect(pool.query).toHaveBeenCalled()
    })

    it('接收自定义 executor（事务路径）', async () => {
      const pool = createMockExecutor()
      const conn = createMockExecutor()
      conn.query.mockResolvedValue([{}])
      const repo = createDraftRepository(pool)

      await repo.addReferenceImages('topic-1', [
        { id: 'ref-1', name: 'a.png', filePath: '/files/references/a.png', mimeType: 'image/png' },
      ], conn)

      // 应调 conn.query 而非 pool.query
      expect(conn.query).toHaveBeenCalled()
      expect(pool.query).not.toHaveBeenCalled()
    })

    it('返回的参考图项含 sourceMessageId 字段', async () => {
      const pool = createMockExecutor()
      pool.query.mockResolvedValue([{}])
      const repo = createDraftRepository(pool)

      const items = await repo.addReferenceImages('topic-1', [
        {
          id: 'ref-1',
          name: 'a.png',
          filePath: '/files/references/a.png',
          mimeType: 'image/png',
          sourceMessageId: 'msg-1',
        },
      ])

      expect(items[0]).toMatchObject({
        id: 'ref-1',
        sourceMessageId: 'msg-1',
        filePath: '/files/references/a.png',
      })
    })
  })

  describe('addReferenceImagesFromMessage', () => {
    it('查到 imageRows 时复用 file_path 插入 draft_reference_images', async () => {
      const executor = createMockExecutor()
      // 第一次 query：SELECT message_images
      executor.query.mockResolvedValueOnce([
        [
          {
            id: 'img-1',
            file_path: '/files/generated/test.png',
            file_name: 'test.png',
            mime_type: 'image/png',
          },
        ],
      ])
      // 后续 query：INSERT draft_reference_images
      executor.query.mockResolvedValue([{}])
      const repo = createDraftRepository(executor)

      const items = await repo.addReferenceImagesFromMessage('topic-1', 'msg-1', ['img-1'], executor)

      expect(items).toHaveLength(1)
      // file_path 应复用 message_images.file_path，不复制文件
      expect(items[0]).toMatchObject({
        filePath: '/files/generated/test.png',
        name: 'test.png',
        type: 'image/png',
        sourceMessageId: 'msg-1',
      })
    })

    it('imageRows 为空时返回 [] 且不执行 INSERT', async () => {
      const executor = createMockExecutor()
      executor.query.mockResolvedValueOnce([[]])
      const repo = createDraftRepository(executor)

      const items = await repo.addReferenceImagesFromMessage('topic-1', 'msg-1', ['img-x'], executor)

      expect(items).toEqual([])
      // 只调用了一次 SELECT，不应有 INSERT
      expect(executor.query).toHaveBeenCalledTimes(1)
    })

    it('imageIds 为空时直接返回 [] 不查询', async () => {
      const executor = createMockExecutor()
      const repo = createDraftRepository(executor)

      const items = await repo.addReferenceImagesFromMessage('topic-1', 'msg-1', [], executor)

      expect(items).toEqual([])
      expect(executor.query).not.toHaveBeenCalled()
    })
  })

  describe('listReferenceImages', () => {
    it('映射数据库行到前端参考图对象', async () => {
      const executor = createMockExecutor()
      executor.query.mockResolvedValueOnce([
        [
          {
            id: 'ref-1',
            name: 'a.png',
            mime_type: 'image/png',
            file_path: '/files/references/a.png',
            source_message_id: 'msg-1',
            sort_order: 0,
            created_at: 1,
          },
        ],
      ])
      const repo = createDraftRepository(executor)

      const items = await repo.listReferenceImages('topic-1', executor)

      expect(items[0]).toMatchObject({
        id: 'ref-1',
        name: 'a.png',
        type: 'image/png',
        mimeType: 'image/png',
        url: '/files/references/a.png',
        filePath: '/files/references/a.png',
        sourceMessageId: 'msg-1',
      })
    })
  })

  describe('countReferenceImages', () => {
    it('返回数字类型的计数', async () => {
      const executor = createMockExecutor()
      executor.query.mockResolvedValueOnce([[{ cnt: 5 }]])
      const repo = createDraftRepository(executor)

      const count = await repo.countReferenceImages('topic-1', executor)

      expect(count).toBe(5)
      expect(typeof count).toBe('number')
    })

    it('无记录时返回 0', async () => {
      const executor = createMockExecutor()
      executor.query.mockResolvedValueOnce([[{ cnt: 0 }]])
      const repo = createDraftRepository(executor)

      const count = await repo.countReferenceImages('topic-1', executor)

      expect(count).toBe(0)
    })
  })

  describe('saveDraft', () => {
    it('保存后返回完整草稿含真实 referenceImages（修复 B2）', async () => {
      const executor = createMockExecutor()
      // INSERT drafts
      executor.query.mockResolvedValueOnce([{}])
      // listReferenceImages 的 SELECT
      executor.query.mockResolvedValueOnce([
        [
          {
            id: 'ref-1',
            name: 'a.png',
            mime_type: 'image/png',
            file_path: '/files/references/a.png',
            source_message_id: null,
            sort_order: 0,
            created_at: 1,
          },
        ],
      ])
      const repo = createDraftRepository(executor)

      const draft = await repo.saveDraft('topic-1', {
        prompt: '测试',
        model: 'openai/gpt-image-2',
        size: 'auto',
        quality: 'high',
        n: 1,
      }, executor)

      // 返回值应含真实 referenceImages 而非空数组
      expect(draft.referenceImages).toHaveLength(1)
      expect(draft.referenceImages[0]).toMatchObject({
        id: 'ref-1',
        filePath: '/files/references/a.png',
      })
      expect(draft).toMatchObject({
        topicId: 'topic-1',
        prompt: '测试',
        model: 'openai/gpt-image-2',
      })
    })

    it('保存 videoRefMode 到 video_ref_mode 列', async () => {
      const executor = createMockExecutor()
      // INSERT drafts
      executor.query.mockResolvedValueOnce([{}])
      // listReferenceImages SELECT 空
      executor.query.mockResolvedValueOnce([[]])
      const repo = createDraftRepository(executor)

      await repo.saveDraft(
        'topic-1',
        {
          prompt: 'p',
          model: 'm',
          videoRefMode: 'first_last',
        },
        executor,
      )

      const [sql, params] = executor.query.mock.calls[0]
      expect(sql).toMatch(/video_ref_mode/)
      // 参数中应包含 videoRefMode 值（updatedAt 是最后一个）
      expect(params).toContain('first_last')
    })
  })

  describe('clearReferenceImages', () => {
    it('执行 DELETE 语句', async () => {
      const executor = createMockExecutor()
      executor.query.mockResolvedValue([{}])
      const repo = createDraftRepository(executor)

      await repo.clearReferenceImages('topic-1', executor)

      expect(executor.query).toHaveBeenCalledTimes(1)
      // SQL 应包含 DELETE FROM draft_reference_images
      const [sql] = executor.query.mock.calls[0]
      expect(sql).toMatch(/DELETE FROM draft_reference_images WHERE topic_id = \?/)
    })
  })

  describe('removeReferenceImage', () => {
    it('按 topicId + id 删除单条', async () => {
      const executor = createMockExecutor()
      executor.query.mockResolvedValue([{}])
      const repo = createDraftRepository(executor)

      const result = await repo.removeReferenceImage('topic-1', 'ref-1', executor)

      expect(result).toEqual({ success: true })
      const [, params] = executor.query.mock.calls[0]
      expect(params).toEqual(['topic-1', 'ref-1'])
    })
  })

  describe('getDraft', () => {
    it('无草稿记录时返回默认值', async () => {
      const executor = createMockExecutor()
      // SELECT drafts 返回空
      executor.query.mockResolvedValueOnce([[]])
      // listReferenceImages 返回空
      executor.query.mockResolvedValueOnce([[]])
      const repo = createDraftRepository(executor)

      const draft = await repo.getDraft('topic-1', executor)

      expect(draft).toMatchObject({
        topicId: 'topic-1',
        prompt: '',
        model: 'openai/gpt-image-2',
        size: 'auto',
        quality: 'high',
        n: 1,
        referenceImages: [],
      })
    })

    it('读取 video_ref_mode 映射为 videoRefMode，空值回退 first_frame', async () => {
      const executor = createMockExecutor()
      // SELECT drafts 返回含 video_ref_mode
      executor.query.mockResolvedValueOnce([
        [
          {
            topic_id: 'topic-1',
            prompt: 'p',
            model: 'm',
            provider_id: '',
            size: 'auto',
            quality: 'high',
            n: 1,
            video_ref_mode: 'reference',
          },
        ],
      ])
      // listReferenceImages 空
      executor.query.mockResolvedValueOnce([[]])
      const repo = createDraftRepository(executor)

      const draft = await repo.getDraft('topic-1', executor)
      expect(draft.videoRefMode).toBe('reference')
    })

    it('video_ref_mode 为空时回退 first_frame', async () => {
      const executor = createMockExecutor()
      executor.query.mockResolvedValueOnce([
        [
          {
            topic_id: 'topic-1',
            prompt: 'p',
            model: 'm',
            provider_id: '',
            size: 'auto',
            quality: 'high',
            n: 1,
            video_ref_mode: null,
          },
        ],
      ])
      executor.query.mockResolvedValueOnce([[]])
      const repo = createDraftRepository(executor)

      const draft = await repo.getDraft('topic-1', executor)
      expect(draft.videoRefMode).toBe('first_frame')
    })
  })
})
