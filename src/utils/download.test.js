import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildImageFileName, buildTimestamp, triggerBrowserDownload } from './download'

describe('buildImageFileName', () => {
  it('清理主题名非法字符并附带序号', () => {
    expect(buildImageFileName('赛博/山脉:日落', '20260703-224500', 0)).toBe(
      '赛博-山脉-日落-20260703-224500-01.png',
    )
  })

  it('没有主题名时回退到默认名', () => {
    expect(buildImageFileName('', '20260703-224500', 1)).toBe('image-session-20260703-224500-02.png')
  })
})

describe('buildTimestamp', () => {
  it('把日期格式化成文件名时间戳', () => {
    const value = buildTimestamp(new Date('2026-07-03T22:45:00'))
    expect(value).toBe('20260703-224500')
  })
})

describe('triggerBrowserDownload', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('创建 a 标签并触发 click', () => {
    const click = vi.fn()
    const anchor = {
      click,
      remove: vi.fn(),
      set href(value) {
        this._href = value
      },
      set download(value) {
        this._download = value
      },
    }

    vi.spyOn(document, 'createElement').mockReturnValue(anchor)
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => anchor)

    triggerBrowserDownload({
      dataUrl: 'data:image/png;base64,ZmFrZQ==',
      fileName: 'test.png',
    })

    expect(anchor._href).toBe('data:image/png;base64,ZmFrZQ==')
    expect(anchor._download).toBe('test.png')
    expect(click).toHaveBeenCalled()
  })

  it('相对路径（/files/...）拼接后端 baseURL', async () => {
    const { backendClient } = await import('@/services/backendClient')
    // 模拟后端 baseURL
    Object.defineProperty(backendClient.defaults, 'baseURL', {
      value: 'http://127.0.0.1:4398',
      configurable: true,
    })

    const anchor = {
      click: vi.fn(),
      remove: vi.fn(),
      set href(value) {
        this._href = value
      },
      set download(value) {
        this._download = value
      },
    }

    vi.spyOn(document, 'createElement').mockReturnValue(anchor)
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => anchor)

    triggerBrowserDownload({
      dataUrl: '/files/generated/test.png',
      fileName: 'test.png',
    })

    // 相对路径应拼接 baseURL
    expect(anchor._href).toBe('http://127.0.0.1:4398/files/generated/test.png')
  })

  it('data URL 原样使用不拼接 baseURL', async () => {
    const { backendClient } = await import('@/services/backendClient')
    Object.defineProperty(backendClient.defaults, 'baseURL', {
      value: 'http://127.0.0.1:4398',
      configurable: true,
    })

    const anchor = {
      click: vi.fn(),
      remove: vi.fn(),
      set href(value) {
        this._href = value
      },
      set download(value) {
        this._download = value
      },
    }

    vi.spyOn(document, 'createElement').mockReturnValue(anchor)
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => anchor)

    triggerBrowserDownload({
      dataUrl: 'data:image/png;base64,ZmFrZQ==',
      fileName: 'test.png',
    })

    // data URL 不应拼接 baseURL
    expect(anchor._href).toBe('data:image/png;base64,ZmFrZQ==')
  })
})
