import { Router } from 'express'

/**
 * 创建统计路由
 *
 * 端点：
 * - GET /stats/summary  返回生成次数汇总（totalGenerations/imageCount/videoCount）
 *
 * 阶段 3 prompts 表建好后，在此追加 promptCount 字段。
 *
 * @param {{ usageLogRepository: object }} deps 依赖注入
 */
export function createStatsRoutes({ usageLogRepository }) {
  const router = Router()

  /** 生成次数汇总：从 usage_logs 按 type 聚合 */
  router.get('/stats/summary', async (_req, res, next) => {
    try {
      const stats = await usageLogRepository.countByType()
      res.json({
        totalGenerations: stats.total,
        imageCount: stats.image,
        videoCount: stats.video,
      })
    } catch (error) {
      next(error)
    }
  })

  return router
}
