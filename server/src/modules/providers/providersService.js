/**
 * 中转站业务服务
 *
 * 职责：
 * - checkProvider：Key 可用性检测（委托 upstreamClient）
 * - fetchModels：代理拉取上游模型并 diff 合并入库
 * - resolveForDraft：按 draft.providerId 解析出生成用的 provider（含回退链）
 */

/** 图像模型关键词（命中即认为支持图像生成） */
const IMAGE_KEYWORDS = ['image', 'dall-e', 'flux', 'seedream', 'seededit', 'imagen']

/**
 * 判断模型 ID 是否为图像生成模型
 * @param {string} modelId
 * @returns {boolean}
 */
export function isImageModelId(modelId) {
  const lower = String(modelId).toLowerCase()
  return IMAGE_KEYWORDS.some((keyword) => lower.includes(keyword))
}

/**
 * 创建中转站服务
 * @param {{ providersRepository: object; upstreamClient: object; settingsRepository: object }} deps
 */
export function createProvidersService({
  providersRepository,
  upstreamClient,
  settingsRepository,
}) {
  /**
   * 取 provider，不存在抛 404
   */
  async function mustGetProvider(id) {
    const provider = await providersRepository.getProvider(id)
    if (!provider) {
      const err = new Error('中转站不存在')
      err.status = 404
      throw err
    }
    return provider
  }

  return {
    listProviders: () => providersRepository.listProviders(),

    /**
     * 新增自定义中转站
     * @param {{ name: string; baseUrl: string }} data
     */
    async createProvider(data) {
      const id =
        globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
      return providersRepository.createProvider({
        id,
        name: String(data.name).trim(),
        baseUrl: String(data.baseUrl).trim().replace(/\/+$/, ''),
        apiKeys: [],
      })
    },

    /**
     * 更新中转站（apiKeys 传数组整体替换）
     */
    async updateProvider(id, patch) {
      await mustGetProvider(id)
      const next = { ...patch }
      if (next.baseUrl) next.baseUrl = String(next.baseUrl).trim().replace(/\/+$/, '')
      return providersRepository.updateProvider(id, next)
    },

    async setProviderEnabled(id, enabled) {
      await mustGetProvider(id)
      await providersRepository.setProviderEnabled(id, enabled)
    },

    async deleteProvider(id) {
      await mustGetProvider(id)
      await providersRepository.deleteProvider(id)
    },

    /**
     * 检测该家全部 Key 的可用性
     * @param {string} id
     */
    async checkProvider(id) {
      const provider = await mustGetProvider(id)
      return upstreamClient.checkKeys(provider)
    },

    listModels: (id) => providersRepository.listModels(id),

    /**
     * 代理拉取上游模型列表并 diff 合并入库
     *
     * 合并规则：
     * - 新增：is_image 命中关键词 → enabled=1，否则 0
     * - 已存在：仅更新 display_name（保留用户 enabled 状态）
     * - 上游消失：不删除，modelId 放入 staleModelIds 响应
     *
     * @param {string} id
     * @returns {Promise<{ added: number; updated: number; total: number; autoEnabled: number; staleModelIds: Array<string> }>}
     */
    async fetchModels(id) {
      const provider = await mustGetProvider(id)
      const upstream = await upstreamClient.listModels(provider)

      const existing = await providersRepository.listModels(id)
      const existingIds = new Set(existing.map((m) => m.modelId))
      const upstreamIds = new Set(upstream.map((m) => m.id))

      const toUpsert = upstream.map((m) => ({
        modelId: m.id,
        displayName: m.name || m.id,
        isImage: isImageModelId(m.id),
      }))
      await providersRepository.upsertFetchedModels(id, toUpsert)

      const added = toUpsert.filter((m) => !existingIds.has(m.modelId))
      return {
        added: added.length,
        updated: toUpsert.length - added.length,
        total: toUpsert.length,
        autoEnabled: added.filter((m) => m.isImage).length,
        staleModelIds: existing.filter((m) => !upstreamIds.has(m.modelId)).map((m) => m.modelId),
      }
    },

    /**
     * 手动添加模型（isImage 按关键词自动判断）
     */
    async addModel(id, data) {
      await mustGetProvider(id)
      return providersRepository.addModel(id, {
        modelId: String(data.modelId).trim(),
        displayName: data.displayName || String(data.modelId).trim(),
        isImage: isImageModelId(data.modelId),
      })
    },

    setModelEnabled: (id, modelId, enabled) =>
      providersRepository.setModelEnabled(id, modelId, enabled),

    deleteModel: (id, modelId) => providersRepository.deleteModel(id, modelId),

    /**
     * 解析生成请求应使用的 provider
     *
     * 回退链：draft.providerId → app_settings.default_provider_id → 第一个 enabled
     * @param {string|undefined} draftProviderId 草稿里选中的 provider
     * @returns {Promise<object>} 可用 provider
     * @throws 400 指定 provider 停用/无 Key；404 没有任何可用 provider
     */
    async resolveForDraft(draftProviderId) {
      let provider = null

      if (draftProviderId) {
        provider = await providersRepository.getProvider(draftProviderId)
        if (!provider) {
          const err = new Error('所选中转站不存在，请重新选择')
          err.status = 400
          throw err
        }
        if (!provider.enabled) {
          const err = new Error(`${provider.name} 已停用，请在设置中启用或更换中转站`)
          err.status = 400
          throw err
        }
      } else {
        const settings = await settingsRepository.getSettings()
        if (settings.defaultProviderId) {
          provider = await providersRepository.getProvider(settings.defaultProviderId)
          if (provider && !provider.enabled) provider = null
        }
        if (!provider) {
          provider = await providersRepository.getFirstEnabledProvider()
        }
      }

      if (!provider) {
        const err = new Error('没有可用的中转站，请在设置中启用至少一家')
        err.status = 400
        throw err
      }
      if (!provider.apiKeys?.length) {
        const err = new Error(`${provider.name} 未配置 API 密钥，请在设置中添加`)
        err.status = 400
        throw err
      }

      return provider
    },
  }
}
