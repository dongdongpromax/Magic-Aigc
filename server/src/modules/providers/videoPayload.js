/**
 * 火山 Seedance 视频生成请求体构建
 *
 * 负责把前端传入的 draft 参数组装为火山方舟
 * POST /contents/generations/tasks 所需的请求体。
 *
 * 请求体规范（已核对火山官方文档）：
 * - model：模型 ID，如 doubao-seedance-2-0-260128
 * - content：信息数组，文本 {type:'text',text} + 可选参考图 {type:'image_url',role,image_url:{url}}
 *   参考图 role 由 videoRefMode 派生：first_frame / last_frame / reference_image，三模式互斥
 * - ratio：画面比例，枚举见 VIDEO_RATIOS，非法值回退 16:9
 * - duration：视频时长（秒），截断到 [4,15]，实际可用范围由上游模型校验
 * - resolution：视频分辨率，枚举见 VIDEO_RESOLUTIONS，非法值回退 720p
 * - watermark：是否加水印，固定 false（保持画面干净）
 * - return_last_frame：是否返回尾帧，固定 false（首版不做连续生成）
 */

/** Seedance 支持的画面比例枚举 */
export const VIDEO_RATIOS = ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive']

/** Seedance 支持的分辨率枚举（4k 仅 Seedance 2.0 标准版支持） */
export const VIDEO_RESOLUTIONS = ['480p', '720p', '1080p', '4k']

/** 视频参考模式枚举（首帧 / 首尾帧 / 多图参考，三模式互斥，不可混用） */
export const VIDEO_REF_MODES = ['first_frame', 'first_last', 'reference']

/** 多图参考模式图片上限 */
const MAX_REFERENCE_IMAGES = 9

/** 视频时长下限（秒） */
const MIN_DURATION = 4
/** 视频时长上限（秒） */
const MAX_DURATION = 15
/** 非法比例时的回退值 */
const DEFAULT_RATIO = '16:9'
/** 默认时长（秒） */
const DEFAULT_DURATION = 5
/** 非法分辨率时的回退值（Seedance 2.0/1.5 Pro 默认 720p，1.0 Pro 默认 1080p，统一取 720p） */
const DEFAULT_RESOLUTION = '720p'

/**
 * 把时长规整为 [MIN_DURATION, MAX_DURATION] 区间内的整数
 * 非数字/空值回退默认时长，超出范围截断到边界
 * @param {unknown} duration
 * @returns {number}
 */
function normalizeDuration(duration) {
  const num = Number(duration)
  if (!Number.isFinite(num)) return DEFAULT_DURATION
  const int = Math.round(num)
  return Math.max(MIN_DURATION, Math.min(MAX_DURATION, int))
}

/**
 * 校验比例是否在枚举内，非法值回退默认比例
 * @param {unknown} ratio
 * @returns {string}
 */
function normalizeRatio(ratio) {
  return VIDEO_RATIOS.includes(ratio) ? ratio : DEFAULT_RATIO
}

/**
 * 校验分辨率是否在枚举内，非法值回退默认分辨率
 * @param {unknown} resolution
 * @returns {string}
 */
function normalizeResolution(resolution) {
  return VIDEO_RESOLUTIONS.includes(resolution) ? resolution : DEFAULT_RESOLUTION
}

/**
 * 按「模式 + 顺序」派生单张参考图的 role
 * - first_frame：第 1 张 → first_frame
 * - first_last：第 1 张 → first_frame，第 2 张 → last_frame
 * - reference：全部 → reference_image
 * @param {string} mode videoRefMode
 * @param {number} index 图片下标
 * @returns {'first_frame'|'last_frame'|'reference_image'}
 */
function deriveRole(mode, index) {
  if (mode === 'first_last') return index === 0 ? 'first_frame' : 'last_frame'
  if (mode === 'reference') return 'reference_image'
  return 'first_frame'
}

/**
 * 构建 Seedance 视频生成请求体
 *
 * content 数组：文本提示词必填，参考图按 videoRefMode 派生 role 依次追加。
 * 三模式互斥（API 约束），非法模式回退 first_frame；首尾帧不足 2 张回退首帧单图。
 *
 * @param {{ model: string; prompt: string; ratio?: string; duration?: number; resolution?: string; videoRefMode?: string; imageUrls?: Array<string> }} input
 * @returns {{ model: string; content: Array<object>; ratio: string; duration: number; resolution: string; watermark: boolean; return_last_frame: boolean }}
 */
export function buildVideoPayload({ model, prompt, ratio, duration, resolution, videoRefMode, imageUrls }) {
  // content 数组：文本提示词必填
  const content = [{ type: 'text', text: String(prompt || '') }]

  // 模式校验：非法值回退 first_frame
  const mode = VIDEO_REF_MODES.includes(videoRefMode) ? videoRefMode : 'first_frame'
  let urls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : []

  // 按模式做数量校验/回退（三模式互斥，不可混用）
  if (mode === 'first_frame') {
    urls = urls.slice(0, 1)
  } else if (mode === 'first_last') {
    // 首尾帧需恰好 2 张；不足 2 张回退为首帧单图（role 派生仍正确）
    urls = urls.length < 2 ? urls.slice(0, 1) : urls.slice(0, 2)
  } else {
    // reference
    urls = urls.slice(0, MAX_REFERENCE_IMAGES)
  }

  // 参考图按顺序追加，role 由「模式 + 下标」派生
  urls.forEach((url, index) => {
    content.push({ type: 'image_url', role: deriveRole(mode, index), image_url: { url } })
  })

  return {
    model: String(model || ''),
    content,
    ratio: normalizeRatio(ratio),
    duration: normalizeDuration(duration),
    resolution: normalizeResolution(resolution),
    watermark: false,
    return_last_frame: false,
  }
}
