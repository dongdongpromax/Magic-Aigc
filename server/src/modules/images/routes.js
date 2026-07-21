import multer from 'multer'
import { Router } from 'express'

const upload = multer({ storage: multer.memoryStorage() })

export function createImageRoutes({ imageService }) {
  const router = Router()

  router.post('/topics/:topicId/references', upload.array('files', 16), async (req, res, next) => {
    try {
      const items = await imageService.saveReferenceUpload(req.params.topicId, req.files || [])
      res.status(201).json(items)
    } catch (error) {
      next(error)
    }
  })

  router.post('/topics/:topicId/messages/image', async (req, res, next) => {
    try {
      const result = await imageService.generateImageMessage(req.params.topicId, req.body || {})
      res.status(201).json(result)
    } catch (error) {
      next(error)
    }
  })

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
