import { beforeEach, describe, expect, it, vi } from 'vitest'

// videoService 直接 import axios 用于下载视频（responseType arraybuffer），mock 掉
vi.mock('axios', () => ({
  default: { get: vi.fn() },
}))

import axios from 'axios'
import { createVideoService } from './videoService.js'

const provider = {
  id: 'volcengine',
  name: '火山方舟',
  baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  apiKeys: ['sk-vol-1'],
}

/** 构造全套 mock 依赖，单测可控 */
function createDeps(overrides = {}) {
  return {
    providersService: { resolveForDraft: vi.fn(async () => provider) },
    upstreamClient: {
      createVideoTask: vi.fn(async () => ({ id: 'cgt-123' })),
      getVideoTask: vi.fn(),
    },
    fileStorage: {
      readFileAsDataUrl: vi.fn(async () => 'data:image/png;base64,ZmFrZQ=='),
      writeGeneratedBuffer: vi.fn(async (fileName) => `/files/generated/${fileName}`),
    },
    topicRepository: {
      saveVideoConversation: vi.fn(async (data) => ({ ...data, videos: data.videos })),
    },
    draftRepository: {
      clearReferenceImages: vi.fn(async () => {}),
      saveDraft: vi.fn(async () => {}),
    },
    pool: {},
    runTransaction: vi.fn(async (_pool, fn) => fn('fake-conn')),
    storageRoot: '/tmp/video-service-test-storage',
    ...overrides,
  }
}

const baseDraft = {
  model: 'doubao-seedance-2-0-260128',
  providerId: 'volcengine',
  ratio: '16:9',
  duration: 5,
  referenceImages: [],
}

describe('videoService', () => {
  beforeEach(() => {
    axios.get.mockReset()
    vi.useRealTimers()
  })

  it('完整流程：创建任务 → 轮询 succeeded → 下载落盘 → 事务保存', async () => {
    const deps = createDeps()
    deps.upstreamClient.getVideoTask.mockResolvedValueOnce({
      status: 'succeeded',
      content: { video_url: 'https://volc.example.com/video.mp4' },
      usage: { tokens: 10 },
    })
    axios.get.mockResolvedValue({ data: Buffer.from('fake-video') })

    const service = createVideoService(deps)
    const result = await service.generateVideoMessage('topic-1', {
      prompt: '一只猫奔跑',
      draft: baseDraft,
    })

    // 创建任务传入了规整后的 Seedance 请求体
    expect(deps.upstreamClient.createVideoTask).toHaveBeenCalledWith(
      provider,
      expect.objectContaining({ model: 'doubao-seedance-2-0-260128', ratio: '16:9', duration: 5 }),
    )
    // 单次轮询即终态
    expect(deps.upstreamClient.getVideoTask).toHaveBeenCalledTimes(1)
    // 视频以 arraybuffer 下载
    expect(axios.get).toHaveBeenCalledWith(
      'https://volc.example.com/video.mp4',
      expect.objectContaining({ responseType: 'arraybuffer' }),
    )
    // 落盘文件名以 topicId 为前缀
    expect(deps.fileStorage.writeGeneratedBuffer).toHaveBeenCalledWith(
      expect.stringMatching(/^topic-1-\d+\.mp4$/),
      expect.any(Buffer),
    )
    // 事务内三步原子化
    expect(deps.topicRepository.saveVideoConversation).toHaveBeenCalled()
    expect(deps.draftRepository.clearReferenceImages).toHaveBeenCalledWith('topic-1', 'fake-conn')
    expect(deps.draftRepository.saveDraft).toHaveBeenCalledWith(
      'topic-1',
      expect.objectContaining({ prompt: '' }),
      'fake-conn',
    )
    // 返回值
    expect(result.providerName).toBe('火山方舟')
    expect(result.ratio).toBe('16:9')
    expect(result.duration).toBe(5)
    expect(result.videos).toHaveLength(1)
  })

  it('轮询多次：queued → running → succeeded，期间每轮等待 5 秒', async () => {
    vi.useFakeTimers()
    const deps = createDeps()
    deps.upstreamClient.getVideoTask
      .mockResolvedValueOnce({ status: 'queued' })
      .mockResolvedValueOnce({ status: 'running' })
      .mockResolvedValueOnce({
        status: 'succeeded',
        content: { video_url: 'https://volc.example.com/v.mp4' },
      })
    axios.get.mockResolvedValue({ data: Buffer.from('video') })

    const service = createVideoService(deps)
    const promise = service.generateVideoMessage('topic-1', { prompt: 'p', draft: baseDraft })

    // 两轮 5 秒等待分别触发 running 与 succeeded
    await vi.advanceTimersByTimeAsync(5000)
    await vi.advanceTimersByTimeAsync(5000)
    const result = await promise

    expect(deps.upstreamClient.getVideoTask).toHaveBeenCalledTimes(3)
    expect(result.videos).toHaveLength(1)
  })

  it('上游未返回任务 ID 时抛 502 且标记 expose', async () => {
    const deps = createDeps()
    deps.upstreamClient.createVideoTask.mockResolvedValue({}) // 无 id
    const service = createVideoService(deps)

    await expect(
      service.generateVideoMessage('topic-1', { prompt: 'p', draft: baseDraft }),
    ).rejects.toMatchObject({ status: 502, expose: true })
  })

  it('轮询到 failed 抛 502 并带上游错误信息', async () => {
    const deps = createDeps()
    deps.upstreamClient.getVideoTask.mockResolvedValue({
      status: 'failed',
      error: { message: '内容不合规' },
    })
    const service = createVideoService(deps)

    await expect(
      service.generateVideoMessage('topic-1', { prompt: 'p', draft: baseDraft }),
    ).rejects.toMatchObject({ status: 502, expose: true, message: expect.stringContaining('内容不合规') })
  })

  it('轮询到 cancelled 抛 502', async () => {
    const deps = createDeps()
    deps.upstreamClient.getVideoTask.mockResolvedValue({ status: 'cancelled' })
    const service = createVideoService(deps)

    await expect(
      service.generateVideoMessage('topic-1', { prompt: 'p', draft: baseDraft }),
    ).rejects.toMatchObject({ status: 502 })
  })

  it('任务成功但未返回 video_url 时抛 502', async () => {
    const deps = createDeps()
    deps.upstreamClient.getVideoTask.mockResolvedValue({ status: 'succeeded', content: {} })
    const service = createVideoService(deps)

    await expect(
      service.generateVideoMessage('topic-1', { prompt: 'p', draft: baseDraft }),
    ).rejects.toMatchObject({ status: 502 })
  })

  it('图生视频-首帧：dataUrl 原样写入 content，role 由首帧模式派生', async () => {
    const deps = createDeps()
    deps.upstreamClient.getVideoTask.mockResolvedValue({
      status: 'succeeded',
      content: { video_url: 'https://volc.example.com/v.mp4' },
    })
    axios.get.mockResolvedValue({ data: Buffer.from('video') })
    const service = createVideoService(deps)

    await service.generateVideoMessage('topic-1', {
      prompt: '让画面动起来',
      draft: {
        ...baseDraft,
        videoRefMode: 'first_frame',
        referenceImages: [{ dataUrl: 'data:image/png;base64,ZmFrZQ==', name: 'first.png' }],
      },
    })

    const payload = deps.upstreamClient.createVideoTask.mock.calls[0][1]
    expect(payload.content).toEqual([
      { type: 'text', text: '让画面动起来' },
      { type: 'image_url', role: 'first_frame', image_url: { url: 'data:image/png;base64,ZmFrZQ==' } },
    ])
  })

  it('解析全部参考图为 imageUrls 并按 videoRefMode 透传给 buildVideoPayload', async () => {
    const deps = createDeps()
    deps.fileStorage.readFileAsDataUrl = vi
      .fn()
      .mockResolvedValueOnce('data:image/png;base64,QUE=')
      .mockResolvedValueOnce('data:image/png;base64,QUI=')
    deps.upstreamClient.getVideoTask.mockResolvedValue({
      status: 'succeeded',
      content: { video_url: 'https://volc.example.com/v.mp4' },
    })
    axios.get.mockResolvedValue({ data: Buffer.from('video') })
    const service = createVideoService(deps)

    await service.generateVideoMessage('topic-1', {
      prompt: 'p',
      draft: {
        ...baseDraft,
        videoRefMode: 'first_last',
        referenceImages: [
          { filePath: '/files/references/a.png', mimeType: 'image/png' },
          { filePath: '/files/references/b.png', mimeType: 'image/png' },
        ],
      },
    })

    // 两张图都被解析为 data URL
    expect(deps.fileStorage.readFileAsDataUrl).toHaveBeenCalledTimes(2)
    const payload = deps.upstreamClient.createVideoTask.mock.calls[0][1]
    // 首尾帧：两张图分别带 first_frame / last_frame role
    expect(payload.content).toHaveLength(3)
    expect(payload.content[1]).toMatchObject({ role: 'first_frame' })
    expect(payload.content[2]).toMatchObject({ role: 'last_frame' })
    // saveVideoConversation 收到的 draft 含 videoRefMode
    expect(deps.topicRepository.saveVideoConversation).toHaveBeenCalledWith(
      expect.objectContaining({ draft: expect.objectContaining({ videoRefMode: 'first_last' }) }),
      expect.anything(),
    )
  })

  it('DB 事务失败时 best-effort 清理已落盘文件并向上抛错', async () => {
    const deps = createDeps()
    deps.upstreamClient.getVideoTask.mockResolvedValue({
      status: 'succeeded',
      content: { video_url: 'https://volc.example.com/v.mp4' },
    })
    axios.get.mockResolvedValue({ data: Buffer.from('video') })
    deps.runTransaction = vi.fn(async () => {
      throw new Error('DB down')
    })
    const service = createVideoService(deps)

    // 文件已落盘但事务失败 → 清理孤儿文件后原样抛出 DB 错误（不吞错）
    await expect(
      service.generateVideoMessage('topic-1', { prompt: 'p', draft: baseDraft }),
    ).rejects.toThrow('DB down')
  })
})
