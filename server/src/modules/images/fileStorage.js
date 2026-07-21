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

  return {
    /**
     * 确保 references 和 generated 目录存在
     */
    async ensureDirs() {
      await fs.mkdir(referencesDir, { recursive: true })
      await fs.mkdir(generatedDir, { recursive: true })
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
  }
}
