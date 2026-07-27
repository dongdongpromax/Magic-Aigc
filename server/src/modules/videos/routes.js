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
   * 响应（成功）：{ videos, providerName, ratio, duration, resolution, videoRefMode }
   * 响应（超时）：{ status: 'pending', taskId, providerId, pendingMessageId, providerName, ... }
   *               —— 轮询超时但不丢弃任务，前端展示 pending 卡片供用户后续检查
   */
  router.post('/topics/:topicId/messages/video', async (req, res, next) => {
    try {
      const result = await videoService.generateVideoMessage(req.params.topicId, req.body || {})
      // pending 结果用 202 Accepted（任务已受理但未完成），成功用 201 Created
      res.status(result.status === 'pending' ? 202 : 201).json(result)
    } catch (error) {
      next(error)
    }
  })

  /**
   * 回查 pending 视频任务（用户点「检查状态」时调用）
   *
   * 路径参数：topicId, messageId（pending 消息 ID）
   * 响应（已完成）：{ status: 'done', video, providerName }
   * 响应（仍在生成）：{ status: 'pending', taskId, message }
   */
  router.post('/topics/:topicId/messages/:messageId/retry-video', async (req, res, next) => {
    try {
      const result = await videoService.retryPendingVideo(req.params.topicId, req.params.messageId)
      res.status(result.status === 'done' ? 200 : 202).json(result)
    } catch (error) {
      next(error)
    }
  })

  return router
}
