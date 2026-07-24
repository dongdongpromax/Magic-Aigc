import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useChatStore } from './chat'

const {
  listTopicsMock,
  getMessagesMock,
  getDraftMock,
  createTopicMock,
  saveDraftMock,
  getSettingsMock,
  updateSettingsMock,
  registerReferenceFromMessageMock,
  deleteReferenceImageMock,
} = vi.hoisted(() => ({
  listTopicsMock: vi.fn(),
  getMessagesMock: vi.fn(),
  getDraftMock: vi.fn(),
  createTopicMock: vi.fn(),
  saveDraftMock: vi.fn(),
  getSettingsMock: vi.fn(),
  updateSettingsMock: vi.fn(),
  registerReferenceFromMessageMock: vi.fn(),
  deleteReferenceImageMock: vi.fn(),
}))

vi.mock('@/services/chatApi', () => ({
  listTopics: listTopicsMock,
  getMessages: getMessagesMock,
  getDraft: getDraftMock,
  createTopic: createTopicMock,
  saveDraft: saveDraftMock,
}))

vi.mock('@/services/settingsApi', () => ({
  getSettings: getSettingsMock,
  updateSettings: updateSettingsMock,
}))

vi.mock('@/services/uploadApi', () => ({
  registerReferenceFromMessage: registerReferenceFromMessageMock,
  deleteReferenceImage: deleteReferenceImageMock,
}))

/** 构造一份完整草稿（含所有字段，避免 ensureDraft 兜底干扰断言） */
function makeDraft(overrides = {}) {
  return {
    topicId: 'topic-1',
    prompt: '',
    model: 'openai/gpt-image-2',
    providerId: '',
    size: 'auto',
    quality: 'high',
    n: 1,
    referenceImages: [],
    ratio: '16:9',
    duration: 5,
    resolution: '720p',
    videoRefMode: 'first_frame',
    ...overrides,
  }
}

describe('chat 草稿切换竞态', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    localStorage.clear()
    setActivePinia(createPinia())
    listTopicsMock.mockResolvedValue([])
    getMessagesMock.mockResolvedValue([])
    getDraftMock.mockResolvedValue(makeDraft({ topicId: 'topic-1' }))
    createTopicMock.mockResolvedValue({
      id: 'topic-1',
      title: '测试主题',
      coverImage: null,
      lastPrompt: '',
      updatedAt: 1,
      createdAt: 1,
      messageCount: 0,
      status: 'idle',
    })
    saveDraftMock.mockResolvedValue({})
    getSettingsMock.mockResolvedValue({
      baseURL: 'http://127.0.0.1:4398',
      defaultModel: 'openai/gpt-image-2',
      defaultSize: 'auto',
      defaultQuality: 'high',
      defaultN: 1,
      requestMode: 'openrouter-image',
      timeout: 1200000,
    })
    updateSettingsMock.mockResolvedValue({})
    deleteReferenceImageMock.mockResolvedValue({ success: true })
  })

  it('切换主题前 flush 当前主题 pending 草稿，避免未保存输入被后端旧值覆盖', async () => {
    const store = useChatStore()

    // 选中 topic-1
    getDraftMock.mockResolvedValue(makeDraft({ topicId: 'topic-1', prompt: '' }))
    await store.selectTopic('topic-1')

    // 在 topic-1 输入 prompt → watch 触发 scheduleDraftPersist（250ms 防抖定时器）
    store.currentDraft.prompt = '画一只猫'
    // 让 watch 回调（microtask）执行，设置 250ms 定时器
    await flushPromises()

    // 防抖未到期，saveDraft 尚未调用
    expect(saveDraftMock).not.toHaveBeenCalled()

    // 切换到 topic-2：应在覆盖前 flush topic-1 的 pending 草稿
    getDraftMock.mockResolvedValue(makeDraft({ topicId: 'topic-2', prompt: '' }))
    await store.selectTopic('topic-2')

    // flushDraftPersist 主动取消防抖定时器并立即保存 topic-1 的 prompt
    expect(saveDraftMock).toHaveBeenCalledWith(
      'topic-1',
      expect.objectContaining({ prompt: '画一只猫' }),
    )
  })

  it('无 pending 修改时切换主题不产生额外 saveDraft 调用', async () => {
    const store = useChatStore()

    getDraftMock.mockResolvedValue(makeDraft({ topicId: 'topic-1' }))
    await store.selectTopic('topic-1')
    // 推进 250ms 让选中 topic-1 时 watch 触发的防抖保存执行完毕，清空 topic-1 的 pending
    await vi.advanceTimersByTimeAsync(300)
    saveDraftMock.mockClear()

    getDraftMock.mockResolvedValue(makeDraft({ topicId: 'topic-2' }))
    await store.selectTopic('topic-2')

    // topic-1 无 pending 定时器 → flushDraftPersist 直接返回，不调 saveDraft
    expect(saveDraftMock).not.toHaveBeenCalled()
  })

  it('快速来回切换不丢失输入：切回时本地已 flush，getDraft 拿到最新值', async () => {
    const store = useChatStore()

    // 后端 topic-1 初始 prompt 为空
    let topic1Draft = makeDraft({ topicId: 'topic-1', prompt: '' })
    getDraftMock.mockImplementation(async (topicId) => {
      if (topicId === 'topic-1') return { ...topic1Draft }
      return makeDraft({ topicId: 'topic-2', prompt: '' })
    })
    // saveDraft 落盘后更新后端侧的 topic-1 草稿快照
    saveDraftMock.mockImplementation(async (topicId, payload) => {
      if (topicId === 'topic-1') topic1Draft = { ...topic1Draft, ...payload }
      return {}
    })

    await store.selectTopic('topic-1')
    store.currentDraft.prompt = '画一只猫'
    await flushPromises()

    // 立刻切到 topic-2（<250ms，防抖未到期）→ 应先 flush topic-1
    await store.selectTopic('topic-2')
    expect(saveDraftMock).toHaveBeenCalledWith(
      'topic-1',
      expect.objectContaining({ prompt: '画一只猫' }),
    )

    // 立刻切回 topic-1：getDraft 返回的是 flush 后的最新值，prompt 不丢失
    await store.selectTopic('topic-1')
    expect(store.currentDraft.prompt).toBe('画一只猫')
  })
})
