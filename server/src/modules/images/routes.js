import multer from 'multer'
import { Router } from 'express'

/**
 * 允许上传的图片 MIME 类型白名单
 * 对应 README 中声明的 png / jpg / jpeg / webp
 */
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])

/**
 * multer 配置：
 * - memoryStorage：文件加载到内存（后续由 fileStorage 落盘）
 * - limits.fileSize：单文件最大 10MB，防 OOM
 * - limits.files：最多 16 个文件，对齐业务上限
 * - fileFilter：只允许白名单内的图片类型
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 16,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      // 抛 MulterError 会被 app.js 的错误中间件识别为客户端错误，返回 400
      return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname), false)
    }
    cb(null, true)
  },
})

/**
 * 创建图片相关路由
 * @param {{ imageService: object }} deps 依赖注入
 */
export function createImageRoutes({ imageService }) {
  const router = Router()

  /**
   * 上传参考图文件
   * 限制：最多 16 个文件，单文件最大 10MB，仅 png/jpeg/webp
   */
  router.post('/topics/:topicId/references', upload.array('files', 16), async (req, res, next) => {
    try {
      const items = await imageService.saveReferenceUpload(req.params.topicId, req.files || [])
      res.status(201).json(items)
    } catch (error) {
      next(error)
    }
  })

  /**
   * 「设为参考图」：把历史消息中的图片登记为当前主题的参考图
   * 复用 message_images.file_path，不复制文件
   */
  router.post('/topics/:topicId/references/from-message', async (req, res, next) => {
    try {
      const result = await imageService.registerReferenceFromMessage(req.params.topicId, {
        messageId: req.body?.messageId,
        imageIds: req.body?.imageIds || [],
      })
      res.status(201).json(result)
    } catch (error) {
      next(error)
    }
  })

  /**
   * 生成图片消息（调用 OpenRouter → 写文件 → 事务保存）
   */
  router.post('/topics/:topicId/messages/image', async (req, res, next) => {
    try {
      const result = await imageService.generateImageMessage(req.params.topicId, req.body || {})
      res.status(201).json(result)
    } catch (error) {
      next(error)
    }
  })

  /**
   * 删除单个参考图记录（仅删 DB 行，不删文件，因文件可能被其他引用）
   */
  router.delete('/topics/:topicId/references/:referenceId', async (req, res, next) => {
    try {
      const result = await imageService.deleteReferenceImage(
        req.params.topicId,
        req.params.referenceId,
      )
      res.json(result)
    } catch (error) {
      next(error)
    }
  })

  return router
}
