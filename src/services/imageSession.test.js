import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeImageResponse } from '@/utils/normalize'
import { requestImages } from './imageSession'
import * as aiClientModule from './aiClient'

describe('requestImages', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('使用 OpenRouter images 端点和 openai/gpt-image-2 模型', async () => {
    const post = vi.fn().mockResolvedValue({
      data: {
        data: [{ b64_json: 'ZmFrZQ==' }],
      },
    })

    vi.spyOn(aiClientModule, 'createAiClient').mockReturnValue({ post })

    await requestImages(
      {
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: 'REMOVED_SECRET-demo',
        timeout: 120000,
        requestMode: 'openrouter-image',
      },
      {
        model: 'openai/gpt-image-2',
        size: '1024x1024',
        quality: 'high',
        n: 1,
        referenceImages: [{ url: 'https://img.example.com/ref.png' }],
      },
      'A serene mountain landscape',
    )

    expect(post).toHaveBeenCalledWith('/images', {
      model: 'openai/gpt-image-2',
      prompt: 'A serene mountain landscape',
      size: '1024x1024',
      quality: 'high',
      n: 1,
      input_references: ['https://img.example.com/ref.png'],
    })
  })

  it('优先把参考图映射为 dataUrl，再回退 url', async () => {
    const post = vi.fn().mockResolvedValue({
      data: {
        data: [{ b64_json: 'ZmFrZQ==' }],
      },
    })

    vi.spyOn(aiClientModule, 'createAiClient').mockReturnValue({ post })

    await requestImages(
      {
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: 'REMOVED_SECRET-demo',
        timeout: 120000,
        requestMode: 'openrouter-image',
      },
      {
        model: 'openai/gpt-image-2',
        size: 'auto',
        quality: 'high',
        n: 1,
        referenceImages: [
          {
            dataUrl: 'data:image/png;base64,AAAA',
            url: 'blob:http://localhost/ref-1',
          },
          {
            dataUrl: '',
            url: 'https://img.example.com/ref-2.png',
          },
        ],
      },
      '继续细化',
    )

    expect(post).toHaveBeenCalledWith('/images', {
      model: 'openai/gpt-image-2',
      prompt: '继续细化',
      size: 'auto',
      quality: 'high',
      n: 1,
      input_references: [
        'data:image/png;base64,AAAA',
        'https://img.example.com/ref-2.png',
      ],
    })
  })
})

describe('normalizeImageResponse', () => {
  it('兼容 url 返回格式', () => {
    const result = normalizeImageResponse({
      data: [{ url: 'https://img.example.com/1.png' }],
    })

    expect(result.images).toEqual([
      {
        id: expect.any(String),
        url: 'https://img.example.com/1.png',
        b64: '',
        width: null,
        height: null,
      },
    ])
  })

  it('兼容 b64_json 返回格式', () => {
    const result = normalizeImageResponse({
      data: [{ b64_json: 'ZmFrZQ==' }],
    })

    expect(result.images[0].url.startsWith('data:image/png;base64,')).toBe(true)
    expect(result.images[0].b64).toBe('ZmFrZQ==')
  })
})
