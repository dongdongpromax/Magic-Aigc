import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useChatStore } from './chat'

describe('chat store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('创建新主题时初始化独立草稿', () => {
    const store = useChatStore()
    const topicId = store.createTopic('海报概念')

    expect(store.currentTopicId).toBe(topicId)
    expect(store.drafts[topicId]).toMatchObject({
      prompt: '',
      model: 'openai/gpt-image-2',
      size: 'auto',
    })
  })

  it('提交消息后会写入 localStorage', () => {
    const store = useChatStore()

    store.addUserPrompt('生成一张银白机械风格角色海报')

    const raw = localStorage.getItem('ai-chat-draw:chat-store')
    expect(raw).toContain('银白机械风格')
  })

  it('初始化时会从 localStorage 恢复历史主题和消息', () => {
    localStorage.setItem(
      'ai-chat-draw:chat-store',
      JSON.stringify({
        version: 1,
        payload: {
          appConfig: {
            baseURL: 'https://openrouter.ai/api/v1',
            apiKey: 'sk-demo',
            defaultModel: 'openai/gpt-image-2',
            requestMode: 'openrouter-image',
            defaultSize: 'auto',
            defaultQuality: 'high',
            defaultN: 1,
            timeout: 120000,
          },
          topics: [
            {
              id: 'topic-1',
              title: '本地历史主题',
              coverImage: null,
              lastPrompt: '一张绿色全息海报',
              updatedAt: 1,
              messageCount: 2,
              status: 'idle',
            },
          ],
          messages: [
            {
              id: 'msg-1',
              topicId: 'topic-1',
              type: 'user_prompt',
              role: 'user',
              prompt: '一张绿色全息海报',
              createdAt: 1,
            },
          ],
          drafts: {
            'topic-1': {
              prompt: '继续细化光效',
              model: 'openai/gpt-image-2',
              size: 'auto',
              quality: 'high',
              n: 1,
              referenceImages: [],
            },
          },
          currentTopicId: 'topic-1',
        },
      }),
    )

    setActivePinia(createPinia())
    const store = useChatStore()

    expect(store.topics).toHaveLength(1)
    expect(store.currentTopicId).toBe('topic-1')
    expect(store.currentMessages).toHaveLength(1)
    expect(store.currentDraft).toMatchObject({
      prompt: '继续细化光效',
      size: 'auto',
    })
  })
})
