import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useChatStore } from './chat'

describe('chat reference images', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('支持向当前草稿追加多张参考图并删除单张', () => {
    const store = useChatStore()
    const topicId = store.createTopic('测试主题')
    store.currentTopicId = topicId

    store.addReferenceImages([
      { id: 'ref-1', name: 'a.png', url: 'blob:a', dataUrl: 'data:a', type: 'image/png' },
      { id: 'ref-2', name: 'b.png', url: 'blob:b', dataUrl: 'data:b', type: 'image/png' },
    ])

    expect(store.currentDraft.referenceImages).toHaveLength(2)

    store.removeReferenceImage('ref-1')

    expect(store.currentDraft.referenceImages).toEqual([
      expect.objectContaining({ id: 'ref-2' }),
    ])
  })
})
