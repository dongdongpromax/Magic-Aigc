import { Router } from 'express'

export function createTopicRoutes({ topicRepository, draftRepository }) {
  const router = Router()

  router.get('/topics', async (_req, res, next) => {
    try {
      res.json(await topicRepository.listTopics())
    } catch (error) {
      next(error)
    }
  })

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

  router.get('/topics/:topicId/messages', async (req, res, next) => {
    try {
      res.json(await topicRepository.listMessages(req.params.topicId))
    } catch (error) {
      next(error)
    }
  })

  router.get('/topics/:topicId/draft', async (req, res, next) => {
    try {
      res.json(await draftRepository.getDraft(req.params.topicId))
    } catch (error) {
      next(error)
    }
  })

  router.put('/topics/:topicId/draft', async (req, res, next) => {
    try {
      res.json(await draftRepository.saveDraft(req.params.topicId, req.body || {}))
    } catch (error) {
      next(error)
    }
  })

  return router
}
