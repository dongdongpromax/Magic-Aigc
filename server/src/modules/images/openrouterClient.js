import axios from 'axios'

/**
 * 创建 OpenRouter 图像生成客户端
 * @param {{ apiKey: string }} deps 依赖配置
 * @returns {{ generateImages: (args: { baseURL: string; payload: unknown; timeout: number }) => Promise<unknown> }}
 */
export function createOpenRouterClient({ apiKey }) {
  return {
    /**
     * 调用 OpenRouter 图像生成接口
     * @param {{ baseURL: string; payload: unknown; timeout: number }} args 请求参数
     * @returns {Promise<unknown>} 接口返回的图像数据
     * @throws {Error} 当 apiKey 未配置时抛出明确错误，避免空 Bearer 产生困惑的 401
     */
    async generateImages({ baseURL, payload, timeout }) {
      // 显式校验 apiKey，避免使用空 Bearer 发请求导致上游返回难以排查的 401
      if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY 未配置，请在 server/.env 中设置 OPENROUTER_API_KEY')
      }

      try {
        const response = await axios.post(`${baseURL}/images`, payload, {
          timeout,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        })

        return response.data
      } catch (err) {
        // 翻译上游认证/权限错误为友好消息，避免透传 axios 默认的
        // "Request failed with status code 403" 让调用方无从排查
        const upstreamStatus = err?.response?.status
        if (upstreamStatus === 401 || upstreamStatus === 403) {
          const friendly = new Error(
            `图像生成服务认证失败（HTTP ${upstreamStatus}），请检查 server/.env 的 OPENROUTER_API_KEY：可能已失效/被撤销（泄露的 key 会被 OpenRouter 自动禁用）、账户余额不足或无权访问该模型`,
          )
          friendly.status = upstreamStatus
          friendly.upstreamMessage = err?.response?.data
          throw friendly
        }
        throw err
      }
    },
  }
}
