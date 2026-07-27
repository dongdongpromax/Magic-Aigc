import { Router } from 'express'

/**
 * 创建统计路由
 *
 * 端点：
 * - GET /stats/summary  返回生成次数汇总（totalGenerations/imageCount/videoCount/promptCount）
 *
 * promptCount 来自 prompts 表，仅当 promptRepository 注入时返回；旧测试不注入时为 0。
 *
 * @param {{ usageLogRepository: object; promptRepository?: object }} deps 依赖注入
 */
export function createStatsRoutes({ usageLogRepository, promptRepository }) {
  const router = Router()

  /** 生成次数汇总：从 usage_logs 按 type 聚合 + prompts 表计数 */
  router.get('/stats/summary', async (_req, res, next) => {
    try {
      const stats = await usageLogRepository.countByType()
      // promptRepository 未注入（旧测试场景）时 promptCount 为 0
      const promptCount = promptRepository ? await promptRepository.count() : 0
      res.json({
        totalGenerations: stats.total,
        imageCount: stats.image,
        videoCount: stats.video,
        promptCount,
      })
    } catch (error) {
      next(error)
    }
  })

  return router
}
