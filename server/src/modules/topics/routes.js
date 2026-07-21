import { Router } from 'express'

/**
 * 创建主题相关路由
 * @param {{ topicRepository: object; draftRepository: object; topicService?: object }} deps 依赖注入
 */
export function createTopicRoutes({ topicRepository, draftRepository, topicService }) {
  const router = Router()

  /**
   * 列出所有主题
   */
  router.get('/topics', async (_req, res, next) => {
    try {
      res.json(await topicRepository.listTopics())
    } catch (error) {
      next(error)
    }
  })

  /**
   * 创建主题（同时初始化空草稿）
   * 用事务包裹 createTopic + saveDraft，避免部分失败
   * 注意：当前实现未在事务内执行，因为 createTopic 在 repository 内部用 pool.query；
   * 后续可由 service 层统一通过 runTransaction 包裹。这里保持兼容现状。
   */
  router.post('/topics', async (req, res, next) => {
    try {
      const topic = await topicRepository.createTopic(req.body?.title || '新主题')
      await draftRepository.saveDraft(topic.id, {
        prompt: '',
        model: 'openai/gpt-image-2',
        size: 'auto',
        quality: 'high',
        n: 1,
      })
      res.status(201).json(topic)
    } catch (error) {
      next(error)
    }
  })

  /**
   * P0-8: 删除主题（含级联清理 messages/drafts/references/images + 文件）
   */
  router.delete('/topics/:topicId', async (req, res, next) => {
    try {
      if (!topicService?.deleteTopic) {
        const err = new Error('主题删除服务未配置')
        err.status = 501
        throw err
      }
      await topicService.deleteTopic(req.params.topicId)
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  /**
   * 列出指定主题的消息
   */
  router.get('/topics/:topicId/messages', async (req, res, next) => {
    try {
      res.json(await topicRepository.listMessages(req.params.topicId))
    } catch (error) {
      next(error)
    }
  })

  /**
   * 获取草稿（含参考图）
   */
  router.get('/topics/:topicId/draft', async (req, res, next) => {
    try {
      res.json(await draftRepository.getDraft(req.params.topicId))
    } catch (error) {
      next(error)
    }
  })

  /**
   * 保存草稿（prompt/model/size/quality/n）
   */
  router.put('/topics/:topicId/draft', async (req, res, next) => {
    try {
      res.json(await draftRepository.saveDraft(req.params.topicId, req.body || {}))
    } catch (error) {
      next(error)
    }
  })

  return router
}
