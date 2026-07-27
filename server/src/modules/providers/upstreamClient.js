import axios from 'axios'

/**
 * 上游中转站客户端
 *
 * 职责：
 * - 代理调用 OpenAI 兼容端点（GET /models、POST /images）
 * - 多 Key 轮询：进程内游标 Map<providerId, number>，每次请求自增取模
 * - 单把 Key 401 时自动换下一把重试；全部失败抛友好错误
 * - 403 不视为认证错误：可能是地区限制/内容违规等非密钥原因，
 *   直接透传上游真实错误信息（expose:true），不触发密钥轮询
 *
 * 注意：Key 永不离开本模块进入日志或错误消息（仅 checkKeys 返回脱敏尾号）
 */

/**
 * 判断是否为可换 Key 重试的认证类错误
 *
 * 仅 401 视为密钥失效/无效，触发轮询换下一把 Key 重试。
 * 403 不在此列：403 通常是地区限制、模型权限不足或内容违规等非密钥原因，
 * 换 Key 无济于事，反而会浪费所有 Key 并掩盖真实原因。
 * @param {unknown} err
 * @returns {boolean}
 */
function isAuthError(err) {
  const status = err?.response?.status
  return status === 401
}

/**
 * 从上游错误响应中提取用户可读的真实原因
 *
 * OpenRouter 错误响应常见结构：{ error: { message, code } } 或 { message }
 * 优先取嵌套的 error.message，回退到顶层 message，最后回退到 axios 默认 message
 * @param {unknown} err
 * @returns {string}
 */
function extractUpstreamMessage(err) {
  const data = err?.response?.data
  if (data?.error?.message) return data.error.message
  if (typeof data?.message === 'string') return data.message
  return err?.message || '上游请求失败'
}

/**
 * 构造 403 透传错误（expose:true 让 app.js 错误中间件把真实原因回传前端）
 * @param {unknown} err 原始 axios 错误
 * @returns {Error}
 */
function buildForbiddenError(err) {
  const friendly = new Error(extractUpstreamMessage(err))
  friendly.status = 403
  friendly.expose = true
  return friendly
}

/**
 * 创建上游客户端
 */
export function createUpstreamClient() {
  /** @type {Map<string, number>} 每家provider的轮询游标 */
  const cursors = new Map()

  /**
   * 按轮询游标取下一把 Key
   * @param {{ id: string; apiKeys: Array<string> }} provider
   * @returns {string}
   */
  function pickKey(provider) {
    const next = (cursors.get(provider.id) ?? -1) + 1
    cursors.set(provider.id, next)
    return provider.apiKeys[next % provider.apiKeys.length]
  }

  /**
   * 带 Key 轮询的请求执行器：
   * 每把 Key 最多试一次；401 换下一把；403 透传上游真实原因（不换 Key）；其余错误直接抛
   * @param {{ id: string; name: string; apiKeys: Array<string> }} provider
   * @param {(key: string) => Promise<unknown>} fn 用指定 Key 发请求的函数
   * @returns {Promise<unknown>}
   */
  async function withKeyRotation(provider, fn) {
    if (!provider.apiKeys?.length) {
      const err = new Error(`${provider.name} 未配置 API 密钥，请在设置中添加`)
      err.status = 400
      throw err
    }

    const tried = new Set()
    for (let attempt = 0; attempt < provider.apiKeys.length; attempt++) {
      const key = pickKey(provider)
      if (tried.has(key)) break // Key 有重复时避免死循环
      tried.add(key)
      try {
        return await fn(key)
      } catch (err) {
        // 401：密钥失效/无效，换下一把 Key 重试
        if (isAuthError(err)) continue
        // 403：地区限制/模型权限/内容违规等非密钥原因，换 Key 无效，
        // 透传上游真实错误信息给前端（expose:true）
        if (err?.response?.status === 403) throw buildForbiddenError(err)
        throw err
      }
    }

    const friendly = new Error(
      `${provider.name} 认证失败（全部 ${tried.size} 把密钥均被拒绝），请检查密钥是否失效/被撤销或账户余额不足`,
    )
    friendly.status = 401
    throw friendly
  }

  return {
    /**
     * 拉取上游模型列表
     * @param {{ id: string; name: string; baseUrl: string; apiKeys: Array<string> }} provider
     * @returns {Promise<Array<{ id: string; name?: string }>>}
     */
    async listModels(provider) {
      const data = await withKeyRotation(provider, async (key) => {
        const response = await axios.get(`${provider.baseUrl}/models`, {
          timeout: 30000,
          headers: { Authorization: `Bearer ${key}` },
        })
        return response.data
      })
      return data?.data || []
    },

    /**
     * 调用上游图像生成接口
     * @param {{ id: string; name: string; baseUrl: string; apiKeys: Array<string> }} provider
     * @param {object} payload 图像生成 payload
     * @param {number} timeout 超时毫秒
     * @returns {Promise<unknown>} 上游响应 data
     */
    async generateImages(provider, payload, timeout) {
      return withKeyRotation(provider, async (key) => {
        const response = await axios.post(`${provider.baseUrl}/images`, payload, {
          timeout,
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
        })
        return response.data
      })
    },

    /**
     * 创建视频生成任务（火山 Seedance 异步任务接口）
     *
     * POST {baseUrl}/contents/generations/tasks
     * 返回 { id: 'cgt-xxx' }，后续用 getVideoTask 轮询状态。
     *
     * @param {{ id: string; name: string; baseUrl: string; apiKeys: Array<string> }} provider
     * @param {object} payload buildVideoPayload 构建的请求体
     * @param {number} timeout 创建任务超时毫秒（默认 60s）
     * @returns {Promise<{ id: string }>} 上游返回的任务对象
     */
    async createVideoTask(provider, payload, timeout = 60000) {
      return withKeyRotation(provider, async (key) => {
        const response = await axios.post(
          `${provider.baseUrl}/contents/generations/tasks`,
          payload,
          {
            timeout,
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
          },
        )
        return response.data
      })
    },

    /**
     * 查询视频生成任务状态（火山 Seedance 异步任务接口）
     *
     * GET {baseUrl}/contents/generations/tasks/{id}
     * 返回 { id, model, status, content:{video_url,...}, usage, error:{message} }
     * status 枚举：queued | running | succeeded | failed | cancelled | expired
     *
     * @param {{ id: string; name: string; baseUrl: string; apiKeys: Array<string> }} provider
     * @param {string} taskId 任务 ID
     * @param {number} timeout 查询超时毫秒（默认 30s）
     * @returns {Promise<object>} 任务状态对象
     */
    async getVideoTask(provider, taskId, timeout = 30000) {
      return withKeyRotation(provider, async (key) => {
        const response = await axios.get(
          `${provider.baseUrl}/contents/generations/tasks/${encodeURIComponent(taskId)}`,
          {
            timeout,
            headers: { Authorization: `Bearer ${key}` },
          },
        )
        return response.data
      })
    },

    /**
     * 逐把 Key 探测可用性（不走轮询，每把都试）
     * @param {{ baseUrl: string; apiKeys: Array<string> }} provider
     * @returns {Promise<{ total: number; available: number; results: Array<{ tail: string; ok: boolean; status?: number; latencyMs: number }> }>}
     */
    async checkKeys(provider) {
      const results = []
      for (const key of provider.apiKeys || []) {
        const startedAt = Date.now()
        try {
          await axios.get(`${provider.baseUrl}/models`, {
            timeout: 15000,
            headers: { Authorization: `Bearer ${key}` },
          })
          results.push({ tail: String(key).slice(-4), ok: true, latencyMs: Date.now() - startedAt })
        } catch (err) {
          results.push({
            tail: String(key).slice(-4),
            ok: false,
            status: err?.response?.status,
            latencyMs: Date.now() - startedAt,
          })
        }
      }
      return {
        total: results.length,
        available: results.filter((r) => r.ok).length,
        results,
      }
    },
  }
}
