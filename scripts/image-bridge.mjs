import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const saveRoot = path.join(projectRoot, 'public', 'generated')
const host = '127.0.0.1'
const port = 4399

await fs.mkdir(saveRoot, { recursive: true })

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

function sanitizeFileName(name) {
  return String(name || 'image-session.png')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\.\.+/g, '.')
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/api/save-image') {
    sendJson(res, 404, { success: false, message: 'Not Found' })
    return
  }

  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)

    const { fileName, imageBase64 } = JSON.parse(Buffer.concat(chunks).toString('utf8'))

    if (!fileName || !imageBase64) {
      sendJson(res, 400, { success: false, message: '缺少文件名或图片内容' })
      return
    }

    const safeName = sanitizeFileName(fileName)
    const filePath = path.join(saveRoot, safeName)
    const buffer = Buffer.from(imageBase64, 'base64')

    await fs.writeFile(filePath, buffer)

    sendJson(res, 200, {
      success: true,
      relativePath: `/generated/${safeName}`,
      absolutePath: filePath,
    })
  } catch (error) {
    sendJson(res, 500, {
      success: false,
      message: error instanceof Error ? error.message : '项目目录保存失败',
    })
  }
})

server.listen(port, host, () => {
  console.log(`image bridge listening on http://${host}:${port}`)
})
