/**
 * 视频模型共享配置
 *
 * 集中定义视频生成的选项枚举、参考图上限与默认值，
 * 供 InputConsole 参数面板与 GeneralSettings 视频默认配置复用，
 * 避免选项 / 默认值散落多处导致不一致。
 */

/** 视频画面比例选项（火山 Seedance 支持的枚举） */
export const videoRatioOptions = [
  { label: '16:9', value: '16:9' },
  { label: '4:3', value: '4:3' },
  { label: '1:1', value: '1:1' },
  { label: '3:4', value: '3:4' },
  { label: '9:16', value: '9:16' },
  { label: '21:9', value: '21:9' },
  { label: '自适应', value: 'adaptive' },
]

/** 视频时长选项（4-15 秒） */
export const videoDurationOptions = Array.from({ length: 12 }, (_, i) => i + 4).map((s) => ({
  label: `${s} 秒`,
  value: s,
}))

/** 视频清晰度选项（火山 Seedance 支持 480p/720p/1080p/4k） */
export const videoResolutionOptions = [
  { label: '480p', value: '480p' },
  { label: '720p', value: '720p' },
  { label: '1080p', value: '1080p' },
  { label: '4K', value: '4k' },
]

/** 视频参考模式选项（首帧 / 首尾帧 / 多图参考，三模式互斥） */
export const videoRefModeOptions = [
  { label: '首帧', value: 'first_frame' },
  { label: '首尾帧', value: 'first_last' },
  { label: '多图参考', value: 'reference' },
]

/** 各参考模式参考图上限（与后端 VIDEO_REF_LIMITS 对齐） */
export const VIDEO_REF_LIMITS = { first_frame: 1, first_last: 2, reference: 9 }

/** 视频默认参数（供 appConfig 默认值与草稿初始化复用，单一数据源） */
export const DEFAULT_VIDEO_RATIO = '16:9'
export const DEFAULT_VIDEO_DURATION = 5
export const DEFAULT_VIDEO_RESOLUTION = '720p'
export const DEFAULT_VIDEO_REF_MODE = 'first_frame'
