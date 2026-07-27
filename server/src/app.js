import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import { MulterError } from 'multer'
import { createImageRoutes } from './modules/images/routes.js'
import { createProviderRoutes } from './modules/providers/routes.js'
import { createVideoRoutes } from './modules/videos/routes.js'
import { createSettingsRoutes } from './modules/settings/routes.js'
import { createTopicRoutes } from './modules/topics/routes.js'
import { createUsageLogRoutes } from './modules/logs/routes.js'
import { createStatsRoutes } from './modules/stats/routes.js'

/**
 * 判断错误是否属于客户端错误（可向调用方暴露消息）
 * @param {unknown} error
 * @returns {boolean}
 */
function isClientError(error) {
  // multer 限制类错误（文件超限、文件类型不符等）
  if (error instanceof MulterError) return true
  // 自定义业务校验错误（如参考图超上限、消息不存在等）
  if (error?.name === 'ValidationError') return true
  // 显式标记可向调用方暴露的错误（如视频生成上游失败 502/超时 504，
  // 其 message 是用户可读的上游原因「内容不合规」等，需透传给前端）
  if (error?.expose === true) return true
  // 显式带 4xx status 的错误
  if (error?.status && error.status >= 400 && error.status < 500) return true
  return false
}

/**
 * 创建 Express 应用
 * @param {{
 *   settingsRepository?: object;
 *   topicRepository?: object;
 *   draftRepository?: object;
 *   imageService?: object;
 *   topicService?: object;
 *   providersService?: object;
 *   videoService?: object;
 *   usageLogRepository?: object;
 *   healthCheck?: () => Promise<void>;
 * }} deps 依赖注入
 */
export function createApp(deps = {}) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const storageRoot = path.resolve(__dirname, '../storage')
  const app = express()

  // P2-3: CORS 限制 origin，生产环境通过 CORS_ORIGIN 配置白名单
  const corsOrigin = process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean)
  app.use(cors(corsOrigin?.length ? { origin: corsOrigin } : undefined))
  app.use(express.json({ limit: '10mb' }))
  app.use('/files', express.static(storageRoot))

  // P1-6: 健康检查端点，注入 healthCheck 时探测 DB 连通性
  app.get('/api/health', async (_req, res) => {
    if (!deps.healthCheck) {
      // 未注入 healthCheck 时保持兼容（测试场景）
      return res.json({ ok: true, db: 'unknown' })
    }
    try {
      await deps.healthCheck()
      res.json({ ok: true, db: 'up' })
    } catch (err) {
      console.error('[health] DB check failed:', err?.message)
      res.status(503).json({ ok: false, db: 'down' })
    }
  })

  app.use('/api', createSettingsRoutes({ settingsRepository: deps.settingsRepository }))
  app.use(
    '/api',
    createTopicRoutes({
      topicRepository: deps.topicRepository,
      draftRepository: deps.draftRepository,
      topicService: deps.topicService,
    }),
  )
  app.use('/api', createImageRoutes({ imageService: deps.imageService }))
  // deps.providersService 未注入时（旧测试）跳过，保持向后兼容
  if (deps.providersService) {
    app.use('/api', createProviderRoutes({ providersService: deps.providersService }))
  }
  // 视频生成路由：deps.videoService 未注入时（旧测试）跳过，保持向后兼容
  if (deps.videoService) {
    app.use('/api', createVideoRoutes({ videoService: deps.videoService }))
  }
  // 使用日志路由：deps.usageLogRepository 未注入时（旧测试）跳过，保持向后兼容
  if (deps.usageLogRepository) {
    app.use('/api', createUsageLogRoutes({ usageLogRepository: deps.usageLogRepository }))
    app.use('/api', createStatsRoutes({ usageLogRepository: deps.usageLogRepository }))
  }

  // P0-6: 错误处理中间件分类脱敏
  // - 客户端错误（multer/业务校验/4xx）：返回具体消息
  // - 内部错误（SQL/文件系统）：返回通用消息，详情进日志，避免泄露
  app.use((error, _req, res, _next) => {
    if (isClientError(error)) {
      const status = error.status || (error instanceof MulterError ? 400 : 400)
      return res.status(status).json({ message: error.message })
    }
    console.error('[unhandled]', error)
    res.status(500).json({ message: 'internal server error' })
  })

  return app
}
