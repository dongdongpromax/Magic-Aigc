import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * 文件存储模块
 *
 * 负责 server/storage/references/ 和 server/storage/generated/ 两个目录的文件读写。
 * 所有文件名经净化处理，防止路径遍历和非法字符注入。
 */

/**
 * 创建文件存储
 * @param {{ rootDir: string }} deps 根目录配置
 * @returns {object} 文件存储对象
 */
export function createFileStorage({ rootDir }) {
  const referencesDir = path.join(rootDir, 'references')
  const generatedDir = path.join(rootDir, 'generated')
  const promptsDir = path.join(rootDir, 'prompts')

  return {
    /**
     * 确保 references / generated / prompts 目录存在
     */
    async ensureDirs() {
      await fs.mkdir(referencesDir, { recursive: true })
      await fs.mkdir(generatedDir, { recursive: true })
      await fs.mkdir(promptsDir, { recursive: true })
    },

    /**
     * 保存上传的参考图文件
     *
     * 文件名净化策略（P0-4 修复 A5 路径遍历风险）：
     *   1. path.basename 去除 originalname 中的目录部分（防 ../）
     *   2. 正则白名单只保留单词字符、中文、点、横线，其余替换为 _
     *   3. 截断到 64 字符避免超长文件名
     *   4. 保留原始扩展名用于 MIME 推断，无扩展名时默认 .png
     *
     * @param {{ originalname: string; buffer: Buffer }} file multer 文件对象
     * @returns {Promise<{ fileName: string; filePath: string }>} 文件名和可访问路径
     */
    async writeReferenceFile(file) {
      const safeExt = path.extname(file.originalname || '').toLowerCase()
      const safeBase =
        path
          .basename(file.originalname || 'upload', safeExt)
          .replace(/[^\w\u4e00-\u9fa5.-]/g, '_')
          .slice(0, 64) || 'upload'
      const fileName = `${Date.now()}-${safeBase}${safeExt || '.png'}`
      const absolutePath = path.join(referencesDir, fileName)

      await fs.writeFile(absolutePath, file.buffer)

      return {
        fileName,
        filePath: `/files/references/${fileName}`,
      }
    },

    /**
     * 保存生成图为 base64 编码的 PNG
     * @param {string} fileName 文件名
     * @param {string} base64 base64 编码的图片数据
     * @returns {Promise<string>} 可访问路径
     */
    async writeGeneratedBase64(fileName, base64) {
      const absolutePath = path.join(generatedDir, fileName)
      await fs.writeFile(absolutePath, Buffer.from(base64, 'base64'))
      return `/files/generated/${fileName}`
    },

    /**
     * 保存生成的二进制文件（视频等非文本媒体）
     *
     * 视频生成任务完成后，上游返回的 video_url 是 24h 有效的预签名链接，
     * 必须下载并以 Buffer 形式落盘到本地，刷新后仍可访问。
     *
     * @param {string} fileName 文件名（含扩展名，如 xxx.mp4）
     * @param {Buffer} buffer 二进制数据
     * @returns {Promise<string>} 可访问路径 /files/generated/{fileName}
     */
    async writeGeneratedBuffer(fileName, buffer) {
      const absolutePath = path.join(generatedDir, fileName)
      await fs.writeFile(absolutePath, buffer)
      return `/files/generated/${fileName}`
    },

    /**
     * 读取文件并转为 data URL（用于发送给 OpenRouter）
     * @param {string} filePath 文件路径（/files/... 形式）
     * @param {string} mimeType MIME 类型
     * @returns {Promise<string>} data URL
     */
    async readFileAsDataUrl(filePath, mimeType = 'image/png') {
      const relativePath = filePath.replace(/^\/files\//, '')
      const absolutePath = path.join(rootDir, relativePath)
      const buffer = await fs.readFile(absolutePath)
      return `data:${mimeType};base64,${buffer.toString('base64')}`
    },

    /**
     * 保存提示词效果素材文件（图片/视频/音频）
     *
     * 文件名净化策略与 writeReferenceFile 一致：
     *   1. path.basename 去除 originalname 中的目录部分（防 ../）
     *   2. 正则白名单只保留单词字符、中文、点、横线，其余替换为 _
     *   3. 截断到 64 字符避免超长文件名
     *   4. 保留原始扩展名，无扩展名时根据 MIME 推断
     *
     * @param {{ originalname: string; buffer: Buffer; mimetype?: string }} file multer 文件对象
     * @returns {Promise<{ fileName: string; filePath: string }>} 文件名和可访问路径
     */
    async writePromptAsset(file) {
      const safeExt = path.extname(file.originalname || '').toLowerCase()
      const safeBase =
        path
          .basename(file.originalname || 'asset', safeExt)
          .replace(/[^\w\u4e00-\u9fa5.-]/g, '_')
          .slice(0, 64) || 'asset'
      // 无扩展名时按 MIME 推断，避免落盘文件无后缀导致静态服务无法设置 Content-Type
      let ext = safeExt
      if (!ext && file.mimetype) {
        const mimeToExt = {
          'image/png': '.png',
          'image/jpeg': '.jpg',
          'image/webp': '.webp',
          'image/gif': '.gif',
          'video/mp4': '.mp4',
          'video/webm': '.webm',
          'audio/mpeg': '.mp3',
          'audio/wav': '.wav',
          'audio/ogg': '.ogg',
        }
        ext = mimeToExt[file.mimetype] || ''
      }
      const fileName = `${Date.now()}-${safeBase}${ext}`
      const absolutePath = path.join(promptsDir, fileName)

      await fs.writeFile(absolutePath, file.buffer)

      return {
        fileName,
        filePath: `/files/prompts/${fileName}`,
      }
    },

    /**
     * 删除提示词素材文件（按 /files/prompts/xxx 形式的路径）
     * 文件不存在时静默成功（best-effort，与 cleanupOrphanFiles 一致）
     * @param {string} filePath 文件路径（/files/prompts/xxx 形式）
     * @returns {Promise<boolean>} 是否实际删除了文件
     */
    async deletePromptAsset(filePath) {
      if (!filePath || !filePath.startsWith('/files/prompts/')) return false
      const relativePath = filePath.replace(/^\/files\//, '')
      const absolutePath = path.join(rootDir, relativePath)
      try {
        await fs.unlink(absolutePath)
        return true
      } catch (err) {
        // 文件可能已不存在（重复删除 / 手动清理过），静默返回 false
        return false
      }
    },
  }
}
