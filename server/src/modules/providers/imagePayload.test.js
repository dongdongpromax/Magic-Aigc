import { describe, expect, it } from 'vitest'
import { buildImagePayload } from './imagePayload.js'

/**
 * 图像请求体构建单测
 *
 * 覆盖：基础字段透传、size→aspect_ratio(枚举)+resolution(档位) 映射、auto 跳过尺寸、
 * 未知 size 容错（不下发非法枚举）、参考图对象数组格式（OpenRouter input_references 规范）。
 *
 * 重点回归：1792×768 必须映射为 aspect_ratio "21:9"（不可约分为 "7:3"），
 * resolution 必须是档位 "2K"（不可传像素串 "1792x768"），否则上游 400。
 */
describe('imagePayload', () => {
  it('基础字段：model/prompt/quality/n 原样透传', () => {
    const payload = buildImagePayload({
      model: 'openai/gpt-image-2',
      prompt: '一只猫',
      size: 'auto',
      quality: 'high',
      n: 2,
    })

    expect(payload.model).toBe('openai/gpt-image-2')
    expect(payload.prompt).toBe('一只猫')
    expect(payload.quality).toBe('high')
    expect(payload.n).toBe(2)
  })

  it('size=auto 时不传 resolution/aspect_ratio（由上游自动适配）', () => {
    const payload = buildImagePayload({
      model: 'm',
      prompt: 'p',
      size: 'auto',
      quality: 'low',
      n: 1,
    })

    expect(payload).not.toHaveProperty('resolution')
    expect(payload).not.toHaveProperty('aspect_ratio')
    expect(payload).not.toHaveProperty('size')
  })

  it('1536x864 映射为 aspect_ratio 16:9 + resolution 2K（不传像素串）', () => {
    const payload = buildImagePayload({
      model: 'm',
      prompt: 'p',
      size: '1536x864',
      quality: 'high',
      n: 1,
    })

    expect(payload.aspect_ratio).toBe('16:9')
    expect(payload.resolution).toBe('2K')
    // 关键：不可下发像素串（上游只认档位枚举）
    expect(payload.resolution).not.toBe('1536x864')
  })

  it('1792x768 映射为 aspect_ratio 21:9（不可约分为 7:3）+ resolution 2K', () => {
    const payload = buildImagePayload({
      model: 'm',
      prompt: 'p',
      size: '1792x768',
      quality: 'high',
      n: 1,
    })

    // 回归核心 bug：21:9 不可被 GCD 约分为 7:3（7:3 不在合法枚举内会 400）
    expect(payload.aspect_ratio).toBe('21:9')
    expect(payload.aspect_ratio).not.toBe('7:3')
    expect(payload.resolution).toBe('2K')
    expect(payload.resolution).not.toBe('1792x768')
  })

  it('1024x1024 映射为 1:1 + 1K 基准档', () => {
    const payload = buildImagePayload({
      model: 'm',
      prompt: 'p',
      size: '1024x1024',
      quality: 'high',
      n: 1,
    })

    expect(payload.aspect_ratio).toBe('1:1')
    expect(payload.resolution).toBe('1K')
  })

  it('4:3 比例 1536x1152 映射正确', () => {
    const payload = buildImagePayload({
      model: 'm',
      prompt: 'p',
      size: '1536x1152',
      quality: 'high',
      n: 1,
    })

    expect(payload.aspect_ratio).toBe('4:3')
    expect(payload.resolution).toBe('2K')
  })

  it('竖图 9:21 比例 768x1792 映射正确（不约分）', () => {
    const payload = buildImagePayload({
      model: 'm',
      prompt: 'p',
      size: '768x1792',
      quality: 'high',
      n: 1,
    })

    expect(payload.aspect_ratio).toBe('9:21')
    expect(payload.resolution).toBe('2K')
  })

  it('参考图：input_references 为 {type,image_url:{url}} 对象数组', () => {
    const payload = buildImagePayload({
      model: 'm',
      prompt: 'p',
      size: 'auto',
      quality: 'high',
      n: 1,
      inputReferences: ['data:image/png;base64,ZmFrZQ==', 'https://example.com/a.jpg'],
    })

    expect(payload.input_references).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,ZmFrZQ==' } },
      { type: 'image_url', image_url: { url: 'https://example.com/a.jpg' } },
    ])
  })

  it('参考图对象不含 role 字段（role 是视频 Seedance 专用，图像 API 不需要）', () => {
    const payload = buildImagePayload({
      model: 'm',
      prompt: 'p',
      size: 'auto',
      quality: 'high',
      n: 1,
      inputReferences: ['data:image/png;base64,ZmFrZQ=='],
    })

    expect(payload.input_references[0]).not.toHaveProperty('role')
  })

  it('单张参考图也能正确组装为对象数组', () => {
    const payload = buildImagePayload({
      model: 'm',
      prompt: 'p',
      size: 'auto',
      quality: 'high',
      n: 1,
      inputReferences: ['https://example.com/single.png'],
    })

    expect(payload.input_references).toEqual([
      { type: 'image_url', image_url: { url: 'https://example.com/single.png' } },
    ])
  })

  it('空数组参考图不生成 input_references 字段', () => {
    const payload = buildImagePayload({
      model: 'm',
      prompt: 'p',
      size: 'auto',
      quality: 'high',
      n: 1,
      inputReferences: [],
    })

    expect(payload).not.toHaveProperty('input_references')
  })

  it('未传 inputReferences 时不生成 input_references 字段', () => {
    const payload = buildImagePayload({
      model: 'm',
      prompt: 'p',
      size: 'auto',
      quality: 'high',
      n: 1,
    })

    expect(payload).not.toHaveProperty('input_references')
  })

  it('未知 size（不在映射表中）时不传 resolution/aspect_ratio，避免下发非法枚举', () => {
    const payload = buildImagePayload({
      model: 'm',
      prompt: 'p',
      size: '2000x2000',
      quality: 'high',
      n: 1,
    })

    // 未知尺寸不下发尺寸参数，交由上游自动适配，宁可丢尺寸控制也不要 400
    expect(payload).not.toHaveProperty('resolution')
    expect(payload).not.toHaveProperty('aspect_ratio')
  })

  it('非法 size（无法解析）时不传 resolution/aspect_ratio', () => {
    const payload = buildImagePayload({
      model: 'm',
      prompt: 'p',
      size: 'invalid',
      quality: 'high',
      n: 1,
    })

    expect(payload).not.toHaveProperty('resolution')
    expect(payload).not.toHaveProperty('aspect_ratio')
  })
})
