const BRIDGE_URL = 'http://127.0.0.1:4399/api/save-image'

export async function saveImageToProject(payload) {
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
