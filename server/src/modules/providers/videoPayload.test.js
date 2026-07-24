import { describe, expect, it } from 'vitest'
import { buildVideoPayload, VIDEO_RATIOS, VIDEO_RESOLUTIONS } from './videoPayload.js'

/**
 * 视频请求体构建单测
 *
 * 覆盖：文生/图生 content 数组、ratio 枚举校验、duration 区间截断、空值容错。
 */
describe('videoPayload', () => {
  it('文生视频：content 仅含文本项，ratio/duration/resolution 原样透传', () => {
    const payload = buildVideoPayload({
      model: 'doubao-seedance-2-0-260128',
      prompt: '一只猫在屋顶奔跑',
      ratio: '16:9',
      duration: 5,
      resolution: '1080p',
    })

    expect(payload.model).toBe('doubao-seedance-2-0-260128')
    expect(payload.content).toEqual([{ type: 'text', text: '一只猫在屋顶奔跑' }])
    expect(payload.ratio).toBe('16:9')
    expect(payload.duration).toBe(5)
    expect(payload.resolution).toBe('1080p')
    expect(payload.watermark).toBe(false)
    expect(payload.return_last_frame).toBe(false)
  })

  it('图生视频-首帧：content 追加带 role 的 image_url 项', () => {
    const payload = buildVideoPayload({
      model: 'doubao-seedance-2-0-260128',
      prompt: '让画面动起来',
      ratio: '9:16',
      duration: 8,
      videoRefMode: 'first_frame',
      imageUrls: ['data:image/png;base64,ZmFrZQ=='],
    })

    expect(payload.content).toHaveLength(2)
    expect(payload.content[1]).toEqual({
      type: 'image_url',
      role: 'first_frame',
      image_url: { url: 'data:image/png;base64,ZmFrZQ==' },
    })
  })

  it('VIDEO_RATIOS 枚举包含 Seedance 全部支持比例', () => {
    expect(VIDEO_RATIOS).toEqual(['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'])
  })

  it('adaptive 比例原样保留', () => {
    expect(
      buildVideoPayload({ model: 'm', prompt: 'p', ratio: 'adaptive', duration: 5 }).ratio,
    ).toBe('adaptive')
  })

  it('非法 ratio 回退 16:9', () => {
    expect(buildVideoPayload({ model: 'm', prompt: 'p', ratio: '32:9', duration: 5 }).ratio).toBe('16:9')
  })

  it('ratio 缺省回退 16:9', () => {
    expect(buildVideoPayload({ model: 'm', prompt: 'p', duration: 5 }).ratio).toBe('16:9')
  })

  it('VIDEO_RESOLUTIONS 枚举包含 Seedance 全部支持分辨率', () => {
    expect(VIDEO_RESOLUTIONS).toEqual(['480p', '720p', '1080p', '4k'])
  })

  it('合法 resolution 原样保留', () => {
    expect(
      buildVideoPayload({ model: 'm', prompt: 'p', duration: 5, resolution: '4k' }).resolution,
    ).toBe('4k')
    expect(
      buildVideoPayload({ model: 'm', prompt: 'p', duration: 5, resolution: '480p' }).resolution,
    ).toBe('480p')
  })

  it('非法 resolution 回退 720p', () => {
    expect(
      buildVideoPayload({ model: 'm', prompt: 'p', duration: 5, resolution: '8k' }).resolution,
    ).toBe('720p')
  })

  it('resolution 缺省回退 720p', () => {
    expect(buildVideoPayload({ model: 'm', prompt: 'p', duration: 5 }).resolution).toBe('720p')
  })

  it('duration 低于下限截断到 4', () => {
    expect(buildVideoPayload({ model: 'm', prompt: 'p', duration: 1 }).duration).toBe(4)
  })

  it('duration 高于上限截断到 15', () => {
    expect(buildVideoPayload({ model: 'm', prompt: 'p', duration: 99 }).duration).toBe(15)
  })

  it('duration 浮点数四舍五入到整数', () => {
    expect(buildVideoPayload({ model: 'm', prompt: 'p', duration: 6.4 }).duration).toBe(6)
    expect(buildVideoPayload({ model: 'm', prompt: 'p', duration: 6.6 }).duration).toBe(7)
  })

  it('duration 非数字/缺省回退默认 5', () => {
    expect(buildVideoPayload({ model: 'm', prompt: 'p', duration: 'abc' }).duration).toBe(5)
    expect(buildVideoPayload({ model: 'm', prompt: 'p' }).duration).toBe(5)
  })

  it('prompt/model 空值容错为空字符串', () => {
    const payload = buildVideoPayload({ ratio: '16:9', duration: 5 })
    expect(payload.model).toBe('')
    expect(payload.content[0].text).toBe('')
  })

  it('图生视频-首尾帧：两张图分别带 first_frame / last_frame role', () => {
    const payload = buildVideoPayload({
      model: 'm',
      prompt: 'p',
      duration: 5,
      videoRefMode: 'first_last',
      imageUrls: ['data:image/png;base64,QUE=', 'data:image/png;base64,QUI='],
    })

    expect(payload.content).toHaveLength(3)
    expect(payload.content[1]).toMatchObject({ role: 'first_frame' })
    expect(payload.content[2]).toMatchObject({ role: 'last_frame' })
  })

  it('图生视频-多图参考：每张图 role 均为 reference_image', () => {
    const payload = buildVideoPayload({
      model: 'm',
      prompt: 'p',
      duration: 5,
      videoRefMode: 'reference',
      imageUrls: ['u1', 'u2', 'u3'],
    })

    expect(payload.content).toHaveLength(4)
    expect(payload.content.slice(1).every((c) => c.role === 'reference_image')).toBe(true)
  })

  it('多图参考超过 9 张截断到 9', () => {
    const urls = Array.from({ length: 12 }, (_, i) => `u${i}`)
    const payload = buildVideoPayload({
      model: 'm',
      prompt: 'p',
      duration: 5,
      videoRefMode: 'reference',
      imageUrls: urls,
    })

    expect(payload.content).toHaveLength(10) // 1 文本 + 9 图
  })

  it('首尾帧模式不足 2 张时回退为首帧单图', () => {
    const payload = buildVideoPayload({
      model: 'm',
      prompt: 'p',
      duration: 5,
      videoRefMode: 'first_last',
      imageUrls: ['only-one'],
    })

    expect(payload.content).toHaveLength(2)
    expect(payload.content[1]).toMatchObject({ role: 'first_frame' })
  })

  it('非法 videoRefMode 回退 first_frame', () => {
    const payload = buildVideoPayload({
      model: 'm',
      prompt: 'p',
      duration: 5,
      videoRefMode: 'unknown_mode',
      imageUrls: ['u1', 'u2'],
    })

    expect(payload.content).toHaveLength(2) // 回退首帧只取 1 张
    expect(payload.content[1]).toMatchObject({ role: 'first_frame' })
  })

  it('无 imageUrls 时 content 仅含文本（文生视频）', () => {
    const payload = buildVideoPayload({
      model: 'm',
      prompt: 'p',
      duration: 5,
      videoRefMode: 'reference',
      imageUrls: [],
    })

    expect(payload.content).toEqual([{ type: 'text', text: 'p' }])
  })
})
