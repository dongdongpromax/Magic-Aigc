import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import { createImageRoutes } from './modules/images/routes.js'
import { createSettingsRoutes } from './modules/settings/routes.js'
import { createTopicRoutes } from './modules/topics/routes.js'

export function createApp(deps = {}) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const storageRoot = path.resolve(__dirname, '../storage')
  const app = express()

  app.use(cors())
  app.use(express.json({ limit: '10mb' }))
  app.use('/files', express.static(storageRoot))

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.use('/api', createSettingsRoutes({ settingsRepository: deps.settingsRepository }))
  app.use(
    '/api',
    createTopicRoutes({
      topicRepository: deps.topicRepository,
      draftRepository: deps.draftRepository,
    }),
  )
  app.use('/api', createImageRoutes({ imageService: deps.imageService }))

  app.use((error, _req, res, _next) => {
    res.status(500).json({
      message: error instanceof Error ? error.message : 'server error',
    })
  })

  return app
}
