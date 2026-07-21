import { backendClient } from '@/services/backendClient'

/**
 * 生成两位补零字符串
 * @param {number} value
 * @returns {string}
 */
function pad(value) {
  return String(value).padStart(2, '0')
}

/**
 * 净化文件名：去除非法字符，压缩连续分隔符，去除首尾横线
 * @param {string} value 原始文件名
 * @returns {string}
 */
function sanitizeName(value) {
  const normalized = (value || 'image-session')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized || 'image-session'
}

/**
 * 构造时间戳字符串（YYYYMMDD-HHMMSS）
 * @param {Date} date
 * @returns {string}
 */
export function buildTimestamp(date = new Date()) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('') + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

/**
 * 构造生成图的文件名
 * @param {string} topicTitle 主题标题
 * @param {string} stamp 时间戳
 * @param {number} index 图片序号（0 起始）
 * @returns {string}
 */
export function buildImageFileName(topicTitle, stamp, index) {
  const safeTopic = sanitizeName(topicTitle)
  const order = String(index + 1).padStart(2, '0')
  return `${safeTopic}-${stamp}-${order}.png`
}

/**
 * 触发浏览器下载
 *
 * P1-5: 支持相对路径（/files/...）和 data URL 两种形式。
 * 相对路径会拼接后端 baseURL，避免被浏览器解析为当前页面路径。
 *
 * @param {{ dataUrl: string; fileName: string }} payload 下载源和文件名
 */
export function triggerBrowserDownload({ dataUrl, fileName }) {
  const anchor = document.createElement('a')
  // 相对路径（/files/...）拼接后端 baseURL；data URL 或绝对 URL 原样使用
  anchor.href = dataUrl.startsWith('/')
    ? `${backendClient.defaults.baseURL}${dataUrl}`
    : dataUrl
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
