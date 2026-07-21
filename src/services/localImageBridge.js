/**
 * 本地图片桥接服务
 *
 * 历史用途：把生成图保存到项目本地目录（端口 4399 的独立服务）。
 * 现状：后端 generateImageMessage 已把 b64 写入 server/storage/generated/，
 *       前端无需再调用此桥接；模块保留以备未来需要本地目录保存时通过 env 启用。
 *
 * 配置：VITE_LOCAL_BRIDGE_URL 注入桥接地址；未配置时 saveImageToProject 直接 reject。
 */

const BRIDGE_URL = import.meta.env?.VITE_LOCAL_BRIDGE_URL || ''

/**
 * 保存图片到本地项目目录
 * @param {{ topicTitle: string; fileName: string; imageBase64: string; subDir?: string }} payload 图片信息
 * @returns {Promise<{ relativePath: string }>}
 * @throws {Error} 未配置 VITE_LOCAL_BRIDGE_URL 时直接 reject
 */
export async function saveImageToProject(payload) {
  if (!BRIDGE_URL) {
    throw new Error('未配置本地桥接服务（VITE_LOCAL_BRIDGE_URL）')
  }

  const response = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error('项目目录保存失败')
  }

  return response.json()
}

export { BRIDGE_URL }
