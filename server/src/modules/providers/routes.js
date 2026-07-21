import { Router } from 'express'

/**
 * 创建中转站路由
 * @param {{ providersService: object }} deps 依赖注入
 */
export function createProviderRoutes({ providersService }) {
  const router = Router()

  /** 校验创建参数 */
  function validateCreate(body) {
    if (!body?.name?.trim() || !body?.baseUrl?.trim()) {
      const err = new Error('name 和 baseUrl 不能为空')
      err.status = 400
      throw err
    }
  }

  router.get('/providers', async (_req, res, next) => {
    try {
      res.json(await providersService.listProviders())
    } catch (error) {
      next(error)
    }
  })

  router.post('/providers', async (req, res, next) => {
    try {
      validateCreate(req.body)
      res.status(201).json(await providersService.createProvider(req.body))
    } catch (error) {
      next(error)
    }
  })

  router.put('/providers/:id', async (req, res, next) => {
    try {
      // 仅白名单字段允许更新，防止 id/enabled 等被意外覆盖
      const { name, baseUrl, apiKeys, requestMode } = req.body || {}
      const patch = {}
      if (name !== undefined) patch.name = name
      if (baseUrl !== undefined) patch.baseUrl = baseUrl
      if (apiKeys !== undefined) patch.apiKeys = Array.isArray(apiKeys) ? apiKeys : []
      if (requestMode !== undefined) patch.requestMode = requestMode
      res.json(await providersService.updateProvider(req.params.id, patch))
    } catch (error) {
      next(error)
    }
  })

  router.patch('/providers/:id/enabled', async (req, res, next) => {
    try {
      await providersService.setProviderEnabled(req.params.id, Boolean(req.body?.enabled))
      res.json({ success: true })
    } catch (error) {
      next(error)
    }
  })

  router.delete('/providers/:id', async (req, res, next) => {
    try {
      await providersService.deleteProvider(req.params.id)
      res.json({ success: true })
    } catch (error) {
      next(error)
    }
  })

  router.post('/providers/:id/check', async (req, res, next) => {
    try {
      res.json(await providersService.checkProvider(req.params.id))
    } catch (error) {
      next(error)
    }
  })

  router.get('/providers/:id/models', async (req, res, next) => {
    try {
      res.json(await providersService.listModels(req.params.id))
    } catch (error) {
      next(error)
    }
  })

  router.post('/providers/:id/models/fetch', async (req, res, next) => {
    try {
      res.json(await providersService.fetchModels(req.params.id))
    } catch (error) {
      next(error)
    }
  })

  router.post('/providers/:id/models', async (req, res, next) => {
    try {
      if (!req.body?.modelId?.trim()) {
        const err = new Error('modelId 不能为空')
        err.status = 400
        throw err
      }
      res.status(201).json(await providersService.addModel(req.params.id, req.body))
    } catch (error) {
      next(error)
    }
  })

  router.patch('/providers/:id/models/:modelId/enabled', async (req, res, next) => {
    try {
      await providersService.setModelEnabled(
        req.params.id,
        decodeURIComponent(req.params.modelId),
        Boolean(req.body?.enabled),
      )
      res.json({ success: true })
    } catch (error) {
      next(error)
    }
  })

  router.delete('/providers/:id/models/:modelId', async (req, res, next) => {
    try {
      await providersService.deleteModel(req.params.id, decodeURIComponent(req.params.modelId))
      res.json({ success: true })
    } catch (error) {
      next(error)
    }
  })

  return router
}
