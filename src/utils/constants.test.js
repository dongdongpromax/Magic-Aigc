/**
 * 前端共享常量测试
 *
 * 确保 MAX_REFERENCE_IMAGES 与后端 multer limits.files
 * 及 draft_reference_images 上限校验保持一致。
 */
import { describe, expect, it } from 'vitest'
import { MAX_REFERENCE_IMAGES } from './constants'

describe('constants', () => {
  it('MAX_REFERENCE_IMAGES 等于 16', () => {
    expect(MAX_REFERENCE_IMAGES).toBe(16)
  })

  it('MAX_REFERENCE_IMAGES 是数字类型', () => {
    expect(typeof MAX_REFERENCE_IMAGES).toBe('number')
  })
})
