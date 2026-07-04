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
      size: '1024x1024',
    })
  })

  it('提交消息后会写入 localStorage', () => {
    const store = useChatStore()

    store.addUserPrompt('生成一张银白机械风格角色海报')

    const raw = localStorage.getItem('ai-chat-draw:chat-store')
    expect(raw).toContain('银白机械风格')
  })
})
