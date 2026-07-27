import multer from 'multer'
import { Router } from 'express'

/**
 * 提示词素材上传允许的 MIME 类型白名单
 * 覆盖图片 / 视频 / 音频三类效果素材
 */
const ALLOWED_MIME = new Set([
  // 图片
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  // 视频
  'video/mp4',
  'video/webm',
  // 音频
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
])

/**
 * 根据 MIME 推断素材 kind（用于前端按类型渲染缩略图/播放器）
 * @param {string} mimeType
 * @returns {string} image | video | audio | file
 */
function kindOfMime(mimeType) {
  if (!mimeType) return 'file'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  return 'file'
}

/**
 * multer 配置：内存存储（后续由 fileStorage 落盘到 prompts 目录）
 * - 单文件最大 50MB（视频素材较大）
 * - 单次最多 16 个文件
 * - fileFilter 限制白名单类型
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 16,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname), false)
    }
    cb(null, true)
  },
})

/**
 * 校验并标准化提示词新增/更新载荷
 * @param {object} body 请求体
 * @param {boolean} partial 是否为部分更新（PATCH 语义，允许字段缺失）
 * @returns {{ ok: boolean; message?: string; value?: object }}
 */
function validatePayload(body, partial = false) {
  const value = {}
  const requireField = (key, label) => {
    if (body[key] === undefined || body[key] === null || body[key] === '') {
      if (!partial) {
        return { ok: false, message: `${label}不能为空` }
      }
      return null
    }
    value[key] = body[key]
    return null
  }

  const miss = requireField('title', '标题') || requireField('content', '提示词正文') || requireField('type', '类型')
  if (miss) return miss

  // type 取值校验
  if (value.type !== undefined && !['video', 'image', 'audio', 'text'].includes(value.type)) {
    return { ok: false, message: '类型必须是 video / image / audio / text 之一' }
  }

  // tags 可选，需为数组
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) {
      return { ok: false, message: '标签必须是数组' }
    }
    value.tags = body.tags.filter((t) => typeof t === 'string')
  }

  // assets 可选，需为数组
  if (body.assets !== undefined) {
    if (!Array.isArray(body.assets)) {
      return { ok: false, message: '素材必须是数组' }
    }
    value.assets = body.assets
  }

  // notes 可选
  if (body.notes !== undefined) {
    value.notes = body.notes
  }

  return { ok: true, value }
}

/**
 * 创建提示词库路由
 *
 * 端点：
 * - GET    /prompts            列表筛选（?type=&tag=&keyword=&limit=）
 * - GET    /prompts/:id        获取详情
 * - POST   /prompts            新增提示词
 * - PUT    /prompts/:id        更新提示词
 * - DELETE /prompts/:id        删除提示词（同时清理素材文件）
 * - POST   /prompts/upload     上传效果素材 → 返回 { url, mimeType, kind, name }
 *
 * @param {{ promptRepository: object; fileStorage?: object }} deps 依赖注入
 */
export function createPromptRoutes({ promptRepository, fileStorage }) {
  const router = Router()

  /** 列表筛选 */
  router.get('/prompts', async (req, res, next) => {
    try {
      const { type, tag, keyword } = req.query
      const limit = Number(req.query.limit) || 200
      const list = await promptRepository.list({
        type: type || undefined,
        tag: tag || undefined,
        keyword: keyword || undefined,
        limit,
      })
      res.json(list)
    } catch (error) {
      next(error)
    }
  })

  /** 获取详情 */
  router.get('/prompts/:id', async (req, res, next) => {
    try {
      const detail = await promptRepository.findById(req.params.id)
      if (!detail) {
        const err = new Error('提示词不存在')
        err.status = 404
        throw err
      }
      res.json(detail)
    } catch (error) {
      next(error)
    }
  })

  /** 新增 */
  router.post('/prompts', async (req, res, next) => {
    try {
      const result = validatePayload(req.body || {}, false)
      if (!result.ok) {
        const err = new Error(result.message)
        err.status = 400
        throw err
      }
      const id = await promptRepository.create(result.value)
      const detail = await promptRepository.findById(id)
      res.status(201).json(detail)
    } catch (error) {
      next(error)
    }
  })

  /** 更新 */
  router.put('/prompts/:id', async (req, res, next) => {
    try {
      const result = validatePayload(req.body || {}, true)
      if (!result.ok) {
        const err = new Error(result.message)
        err.status = 400
        throw err
      }
      const ok = await promptRepository.update(req.params.id, result.value)
      if (!ok) {
        const err = new Error('提示词不存在')
        err.status = 404
        throw err
      }
      const detail = await promptRepository.findById(req.params.id)
      res.json(detail)
    } catch (error) {
      next(error)
    }
  })

  /**
   * 删除提示词
   * 先查记录收集 assets 文件路径，删 DB 行，再 best-effort 清理文件
   * （DB 是真相，文件清理失败不影响响应）
   */
  router.delete('/prompts/:id', async (req, res, next) => {
    try {
      const existing = await promptRepository.findById(req.params.id)
      if (!existing) {
        const err = new Error('提示词不存在')
        err.status = 404
        throw err
      }

      await promptRepository.deleteById(req.params.id)

      // best-effort 清理素材文件（失败不影响响应）
      if (fileStorage && Array.isArray(existing.assets)) {
        await Promise.all(
          existing.assets.map(async (asset) => {
            try {
              await fileStorage.deletePromptAsset(asset.url)
            } catch {
              // 静默忽略单个文件清理失败
            }
          }),
        )
      }

      res.json({ success: true })
    } catch (error) {
      next(error)
    }
  })

  /**
   * 上传效果素材
   * 多文件上传，每文件经 fileStorage.writePromptAsset 落盘到 prompts 目录
   * 返回素材元数据数组，前端保存提示词时写入 assets 字段
   */
  router.post('/prompts/upload', upload.array('files', 16), async (req, res, next) => {
    try {
      const files = req.files || []
      if (!files.length) {
        const err = new Error('未接收到文件')
        err.status = 400
        throw err
      }

      const items = await Promise.all(
        files.map(async (file) => {
          const saved = await fileStorage.writePromptAsset(file)
          return {
            url: saved.filePath,
            mimeType: file.mimetype,
            kind: kindOfMime(file.mimetype),
            name: file.originalname,
          }
        }),
      )

      res.status(201).json(items)
    } catch (error) {
      next(error)
    }
  })

  return router
}
