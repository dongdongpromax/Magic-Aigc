/**
 * 图像生成 payload 构建
 *
 * OpenRouter 图像 API（POST /api/v1/images）对尺寸参数有严格枚举校验：
 * - aspect_ratio：必须是合法枚举值（如 "21:9"），不可传约分后的值
 *   （"7:3" 会被 400 拒绝：Invalid option: expected one of "1:1"|"16:9"|...）
 * - resolution：必须是档位字符串（"1K"/"2K"/"4K"），不可传像素串
 *   （"1792x768" 同样会被 400 拒绝）
 *
 * 前端 InputConsole 的 sizeOptions 每个 value 都对应一个合法的 aspect_ratio 枚举值，
 * 此处用 SIZE_MAP 把尺寸 value 映射到 { aspect_ratio, resolution }，确保参数始终合法。
 * size === 'auto' 或未在表中时，不传尺寸字段，由上游自动适配。
 */

/**
 * 尺寸 → { aspect_ratio, resolution } 映射表
 *
 * - aspect_ratio：取 OpenRouter 接受的枚举值，与前端 sizeOptions.ratio 完全对齐，
 *   绝不约分（如 1792×768 用 "21:9" 而非 "7:3"）。
 * - resolution：按总像素量归档到档位。1024×1024（≈1.05MP）是 1K 基准档；
 *   其余含 1536/1792 边的尺寸（≈1.2~2.4MP）归 2K 档，对应用户选择更高清的意图。
 *   （当前前端无 4K 级尺寸选项，故不出现 4K。）
 *
 * 合法 aspect_ratio 枚举（来自上游 ZodError，全局通用）：
 *   "1:1" "1:2" "1:4" "1:8" "2:1" "2:3" "3:2" "3:4" "4:1" "4:3" "4:5" "5:4"
 *   "8:1" "9:16" "16:9" "9:19.5" "19.5:9" "9:20" "20:9" "9:21" "21:9" "auto"
 */
const SIZE_MAP = {
  '1024x1024': { aspect_ratio: '1:1', resolution: '1K' },
  '1536x1536': { aspect_ratio: '1:1', resolution: '2K' },
  '1536x1152': { aspect_ratio: '4:3', resolution: '2K' },
  '1536x1024': { aspect_ratio: '3:2', resolution: '2K' },
  '1536x864': { aspect_ratio: '16:9', resolution: '2K' },
  '1792x768': { aspect_ratio: '21:9', resolution: '2K' },
  '1536x768': { aspect_ratio: '2:1', resolution: '2K' },
  '1152x1536': { aspect_ratio: '3:4', resolution: '2K' },
  '1024x1536': { aspect_ratio: '2:3', resolution: '2K' },
  '864x1536': { aspect_ratio: '9:16', resolution: '2K' },
  '768x1792': { aspect_ratio: '9:21', resolution: '2K' },
  '768x1536': { aspect_ratio: '1:2', resolution: '2K' },
}

/**
 * 构建上游图像生成 payload
 *
 * @param {{ model: string; prompt: string; size: string; quality: string; n: number; inputReferences?: Array<string> }} args
 * @returns {object}
 */
export function buildImagePayload({ model, prompt, size, quality, n, inputReferences }) {
  const payload = { model, prompt, quality, n }

  // 仅当 size 是已知尺寸时才下发尺寸参数；auto / 未知值一律不传，交由上游自动适配
  // （避免下发非法枚举值导致 400）
  const mapped = size && size !== 'auto' ? SIZE_MAP[size] : null
  if (mapped) {
    payload.aspect_ratio = mapped.aspect_ratio
    payload.resolution = mapped.resolution
  }

  // 参考图按 OpenRouter 图像 API 规范组装为对象数组：
  // [{ type: 'image_url', image_url: { url } }]
  // url 可为 HTTPS 链接或 base64 data URL（由 resolveReferenceInput 解析得到）
  // 注意：图像 API 的 input_references 不带 role（role 是视频 Seedance 专用字段）
  if (inputReferences?.length) {
    payload.input_references = inputReferences.map((url) => ({
      type: 'image_url',
      image_url: { url },
    }))
  }

  return payload
}
