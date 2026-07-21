import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeImageResponse } from '@/utils/normalize'
import { requestImages } from './imageSession'
import { backendClient } from './backendClient'

describe('requestImages', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('把图片生成请求转发到本地 backend', async () => {
    const post = vi.spyOn(backendClient, 'post').mockResolvedValue({
      data: {
        images: [{ url: '/files/generated/demo.png' }],
      },
    })

    const payload = {
      prompt: 'A serene mountain landscape',
      draft: {
        model: 'openai/gpt-image-2',
        size: '1024x1024',
        quality: 'high',
        n: 1,
        referenceImages: [{ url: 'https://img.example.com/ref.png' }],
      },
    }

    await requestImages('topic-1', payload)

    expect(post).toHaveBeenCalledWith('/api/topics/topic-1/messages/image', payload)
  })

  it('返回 backend 透传的生成结果', async () => {
    vi.spyOn(backendClient, 'post').mockResolvedValue({
      data: {
        images: [{ url: '/files/generated/refined.png' }],
      },
    })

    const result = await requestImages('topic-2', {
      prompt: '继续细化',
      draft: {
        size: 'auto',
      },
    })

    expect(result.images[0].url).toBe('/files/generated/refined.png')
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
