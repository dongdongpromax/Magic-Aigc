/**
 * 图像生成 payload 构建
 *
 * 修复遗留 timeout bug：OpenRouter 图像 API 不认旧 `size` 直传格式
 * （size:"auto" 会导致上游长时间无响应），改为：
 * - size === 'auto'：不传任何尺寸字段，由上游自动适配
 * - 非 auto：传 resolution（'1536x864'）+ aspect_ratio（约分后的 '16:9'）
 */

/**
 * 最大公约数（用于宽高比约分）
 */
function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b)
}

/**
 * 构建上游图像生成 payload
 * @param {{ model: string; prompt: string; size: string; quality: string; n: number; inputReferences?: Array<string> }} args
 * @returns {object}
 */
export function buildImagePayload({ model, prompt, size, quality, n, inputReferences }) {
  const payload = { model, prompt, quality, n }

  if (size && size !== 'auto') {
    const [w, h] = String(size).split('x').map(Number)
    if (w > 0 && h > 0) {
      payload.resolution = `${w}x${h}`
      const divisor = gcd(w, h)
      payload.aspect_ratio = `${w / divisor}:${h / divisor}`
    }
  }

  if (inputReferences?.length) {
    payload.input_references = inputReferences
  }

  return payload
}
