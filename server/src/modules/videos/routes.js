import { Router } from 'express'

/**
 * 视频生成相关路由
 *
 * 参考 modules/images/routes.js 风格：工厂函数 + 依赖注入 + next(error) 透传错误。
 */

/**
 * 创建视频生成路由
 * @param {{ videoService: object }} deps 依赖注入
 */
export function createVideoRoutes({ videoService }) {
  const router = Router()

  /**
   * 生成视频消息（火山 Seedance → 后端轮询 → 下载落盘 → 事务保存）
   *
   * 请求体：{ prompt: string, draft: { model, providerId, ratio, duration, referenceImages } }
   * 响应：{ videos, providerName, ratio, duration }
   */
  router.post('/topics/:topicId/messages/video', async (req, res, next) => {
    try {
      const result = await videoService.generateVideoMessage(req.params.topicId, req.body || {})
      res.status(201).json(result)
    } catch (error) {
      next(error)
    }
  })

  return router
}
