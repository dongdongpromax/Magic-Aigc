import { Router } from 'express'

export function createSettingsRoutes({ settingsRepository }) {
  const router = Router()

  router.get('/settings', async (_req, res, next) => {
    try {
      res.json(await settingsRepository.getSettings())
    } catch (error) {
      next(error)
    }
  })

  router.put('/settings', async (req, res, next) => {
    try {
      res.json(await settingsRepository.saveSettings(req.body || {}))
    } catch (error) {
      next(error)
    }
  })

  return router
}
