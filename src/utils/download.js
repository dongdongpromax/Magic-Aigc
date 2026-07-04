function pad(value) {
  return String(value).padStart(2, '0')
}

function sanitizeName(value) {
  const normalized = (value || 'image-session')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized || 'image-session'
}

export function buildTimestamp(date = new Date()) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('') + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

export function buildImageFileName(topicTitle, stamp, index) {
  const safeTopic = sanitizeName(topicTitle)
  const order = String(index + 1).padStart(2, '0')
  return `${safeTopic}-${stamp}-${order}.png`
}

export function triggerBrowserDownload({ dataUrl, fileName }) {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
