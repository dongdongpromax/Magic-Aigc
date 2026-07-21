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
})
