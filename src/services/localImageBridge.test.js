/**
 * 本地图片桥接服务测试
 *
 * P1-4 改造后：BRIDGE_URL 从 import.meta.env.VITE_LOCAL_BRIDGE_URL 读取，
 * 模块加载时求值。测试通过 vi.stubEnv + vi.resetModules + 动态 import
 * 注入不同的 env 值，覆盖「已配置」「未配置」「桥接失败」三种场景。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * 动态加载 localImageBridge 模块，确保 env stub 生效
 * @returns {Promise<{ saveImageToProject: Function }>}
 */
async function loadBridge() {
  vi.resetModules()
  return import('./localImageBridge')
}

describe('saveImageToProject（已配置 VITE_LOCAL_BRIDGE_URL）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('把文件名和 base64 提交给本地桥接服务', async () => {
    vi.stubEnv('VITE_LOCAL_BRIDGE_URL', 'http://127.0.0.1:4399/api/save-image')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, relativePath: '/generated/test.png' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { saveImageToProject } = await loadBridge()
    await saveImageToProject({
      topicTitle: '新建创作',
      fileName: 'test.png',
      imageBase64: 'ZmFrZQ==',
      subDir: 'generated',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:4399/api/save-image',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })

  it('桥接失败时抛出统一错误', async () => {
    vi.stubEnv('VITE_LOCAL_BRIDGE_URL', 'http://127.0.0.1:4399/api/save-image')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
      }),
    )

    const { saveImageToProject } = await loadBridge()
    await expect(
      saveImageToProject({
        topicTitle: '新建创作',
        fileName: 'test.png',
        imageBase64: 'ZmFrZQ==',
        subDir: 'generated',
      }),
    ).rejects.toThrow('项目目录保存失败')
  })
})

describe('saveImageToProject（未配置 VITE_LOCAL_BRIDGE_URL）', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('未配置时直接 reject 并提示未配置本地桥接服务', async () => {
    vi.stubEnv('VITE_LOCAL_BRIDGE_URL', '')
    const { saveImageToProject } = await loadBridge()

    await expect(
      saveImageToProject({
        topicTitle: '新建创作',
        fileName: 'test.png',
        imageBase64: 'ZmFrZQ==',
        subDir: 'generated',
      }),
    ).rejects.toThrow('未配置本地桥接服务')
  })
})
