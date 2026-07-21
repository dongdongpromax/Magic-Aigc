import { describe, expect, it, vi } from 'vitest'
import { createTopicRepository } from './topicRepository.js'

describe('topicRepository', () => {
  it('listMessages 会把 message_images 聚合到 assistant_images 消息中', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        [
          {
            id: 'msg-1',
            topic_id: 'topic-1',
            type: 'assistant_images',
            role: 'assistant',
            content: null,
            prompt: '赛博大厅',
            revised_prompt: '',
            model: 'openai/gpt-image-2',
            size: 'auto',
            quality: 'high',
            n: 1,
            status: 'done',
            source_message_id: 'msg-user',
            meta_json: null,
            created_at: 1,
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 'img-1',
            message_id: 'msg-1',
            file_path: '/files/generated/demo.png',
            file_name: 'demo.png',
            mime_type: 'image/png',
            width: 1024,
            height: 1024,
            saved_to_project: 1,
            created_at: 1,
          },
        ],
      ])

    const repository = createTopicRepository({ query })
    const messages = await repository.listMessages('topic-1')

    expect(messages[0].images).toEqual([
      expect.objectContaining({
        id: 'img-1',
        url: '/files/generated/demo.png',
        localPath: '/files/generated/demo.png',
        savedToProject: true,
      }),
    ])
  })

  it('listMessages 会兼容 mysql 返回对象类型的 meta_json', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        [
          {
            id: 'msg-1',
            topic_id: 'topic-1',
            type: 'user_prompt',
            role: 'user',
            content: null,
            prompt: '赛博大厅',
            revised_prompt: null,
            model: 'openai/gpt-image-2',
            size: 'auto',
            quality: 'high',
            n: 1,
            status: 'done',
            source_message_id: null,
            meta_json: {
              referenceCount: 2,
            },
            created_at: 1,
          },
        ],
      ])
      .mockResolvedValueOnce([[]])

    const repository = createTopicRepository({ query })
    const messages = await repository.listMessages('topic-1')

    expect(messages[0].meta).toEqual({
      referenceCount: 2,
    })
  })

  it('saveGeneratedConversation 会写入用户消息、图片消息和图片表', async () => {
    const query = vi.fn().mockResolvedValue([{}])
    const repository = createTopicRepository({ query })

    const result = await repository.saveGeneratedConversation({
      topicId: 'topic-1',
      prompt: '赛博大厅',
      revisedPrompt: '赛博大厅 refined',
      draft: {
        model: 'openai/gpt-image-2',
        size: 'auto',
        quality: 'high',
        n: 1,
        referenceImages: [{ sourceMessageId: 'msg-ref-1' }],
      },
      images: [
        {
          url: '/files/generated/demo.png',
          localPath: '/files/generated/demo.png',
          width: 1024,
          height: 1024,
          mimeType: 'image/png',
          fileName: 'demo.png',
          savedToProject: true,
        },
      ],
    })

    expect(query).toHaveBeenCalledTimes(4)
    expect(result.type).toBe('assistant_images')
    expect(result.images[0].url).toBe('/files/generated/demo.png')
  })

  it('saveGeneratedConversation 接收自定义 executor（事务路径）', async () => {
    const poolQuery = vi.fn()
    const connQuery = vi.fn().mockResolvedValue([{}])
    const repository = createTopicRepository({ query: poolQuery })
    const conn = { query: connQuery }

    await repository.saveGeneratedConversation(
      {
        topicId: 'topic-1',
        prompt: '赛博大厅',
        revisedPrompt: '',
        draft: { model: 'openai/gpt-image-2', size: 'auto', quality: 'high', n: 1 },
        images: [],
      },
      conn,
    )

    // 事务路径应全部走 conn.query，pool.query 不应被调用
    expect(connQuery).toHaveBeenCalled()
    expect(poolQuery).not.toHaveBeenCalled()
  })

  it('saveGeneratedConversation 在 images 为 undefined 时不抛 TypeError（防御性 safeImages）', async () => {
    const query = vi.fn().mockResolvedValue([{}])
    const repository = createTopicRepository({ query })

    // images: undefined，应被 safeImages 兜底为 []
    const result = await repository.saveGeneratedConversation({
      topicId: 'topic-1',
      prompt: '赛博大厅',
      revisedPrompt: '',
      draft: { model: 'openai/gpt-image-2', size: 'auto', quality: 'high', n: 1 },
      images: undefined,
    })

    // 不抛错，返回正常，images 为空数组
    expect(result.images).toEqual([])
    // 应执行 4 次 query：2 条 messages + 0 条 message_images + 1 条 topics update = 3 次
    // 实际：2 条 messages INSERT + 0 条 images INSERT + 1 条 topics UPDATE = 3 次
    expect(query).toHaveBeenCalledTimes(3)
  })

  it('verifyMessageBelongsToTopic 属于时返回 true', async () => {
    const query = vi.fn().mockResolvedValueOnce([[{ id: 'msg-1' }]])
    const repository = createTopicRepository({ query })

    const belongs = await repository.verifyMessageBelongsToTopic('topic-1', 'msg-1')

    expect(belongs).toBe(true)
  })

  it('verifyMessageBelongsToTopic 不属于时返回 false', async () => {
    const query = vi.fn().mockResolvedValueOnce([[]])
    const repository = createTopicRepository({ query })

    const belongs = await repository.verifyMessageBelongsToTopic('topic-1', 'msg-x')

    expect(belongs).toBe(false)
  })

  it('listTopicFilePaths 跨两表查询并用 Set 去重', async () => {
    const query = vi.fn()
      // message_images 查询返回两条（其中一条与 draft 引用重复）
      .mockResolvedValueOnce([
        [
          { file_path: '/files/generated/a.png' },
          { file_path: '/files/generated/b.png' },
        ],
      ])
      // draft_reference_images 查询返回一条（与 a.png 重复）
      .mockResolvedValueOnce([[{ file_path: '/files/generated/a.png' }]])
    const repository = createTopicRepository({ query })

    const paths = await repository.listTopicFilePaths('topic-1')

    // Set 去重后应为 2 条
    expect(paths).toHaveLength(2)
    expect(paths).toContain('/files/generated/a.png')
    expect(paths).toContain('/files/generated/b.png')
  })

  it('listTopicFilePaths 过滤掉 null file_path', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([[{ file_path: null }, { file_path: '/files/generated/a.png' }]])
      .mockResolvedValueOnce([[]])
    const repository = createTopicRepository({ query })

    const paths = await repository.listTopicFilePaths('topic-1')

    expect(paths).toEqual(['/files/generated/a.png'])
  })

  it('deleteTopic 主题不存在时返回 false', async () => {
    const query = vi.fn().mockResolvedValueOnce([[]])
    const repository = createTopicRepository({ query })

    const result = await repository.deleteTopic('topic-x')

    expect(result).toBe(false)
    // 不存在时只查询一次 topics 表，不应执行 DELETE
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('deleteTopic 主题存在时按 5 步顺序 DELETE 返回 true', async () => {
    const query = vi.fn()
      // SELECT topics 返回存在
      .mockResolvedValueOnce([[{ id: 'topic-1' }]])
      // 5 步 DELETE
      .mockResolvedValue([{}])
    const repository = createTopicRepository({ query })

    const result = await repository.deleteTopic('topic-1')

    expect(result).toBe(true)
    // 1 次 SELECT + 5 次 DELETE = 6 次
    expect(query).toHaveBeenCalledTimes(6)
    // 验证 DELETE 顺序
    const sqls = query.mock.calls.map((call) => call[0])
    expect(sqls[1]).toMatch(/DELETE FROM message_images/)
    expect(sqls[2]).toMatch(/DELETE FROM messages/)
    expect(sqls[3]).toMatch(/DELETE FROM draft_reference_images/)
    expect(sqls[4]).toMatch(/DELETE FROM drafts/)
    expect(sqls[5]).toMatch(/DELETE FROM topics/)
  })
})
