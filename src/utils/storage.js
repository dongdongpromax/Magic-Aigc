const STORAGE_KEY = 'ai-chat-draw:chat-store'
const STORAGE_VERSION = 1

export function loadPersistedState() {
  const raw = localStorage.getItem(STORAGE_KEY)

  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    return parsed.version === STORAGE_VERSION ? parsed.payload : null
  } catch {
    return null
  }
}

export function savePersistedState(payload) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: STORAGE_VERSION,
      payload,
    }),
  )
}
