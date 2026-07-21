const STORAGE_KEY = 'ai-chat-draw:chat-store'
const STORAGE_VERSION = 1

function isInlineAssetUrl(value) {
  return typeof value === 'string' && (value.startsWith('data:') || value.startsWith('blob:'))
}

function getPersistedUrl(url, localPath = '') {
  if (localPath) return localPath
  if (typeof url !== 'string') return ''
  if (isInlineAssetUrl(url)) return ''
  return url
}

function sanitizePersistedImage(image = {}) {
  const persistedUrl = getPersistedUrl(image.url, image.localPath)
  const next = {
    ...image,
  }

  delete next.b64
  delete next.b64_json
  delete next.dataUrl

  if (persistedUrl) {
    next.url = persistedUrl
  } else {
    delete next.url
  }

  return next
}

function buildPersistedImageMap(messages = []) {
  return Object.fromEntries(
    messages.flatMap((message) =>
      (message.images || [])
        .map((image) => [image.id, getPersistedUrl(image.url, image.localPath)])
        .filter(([, url]) => Boolean(url)),
    ),
  )
}

function sanitizeReferenceImages(referenceImages = [], imageMap = {}) {
  return referenceImages
    .map((image) => {
      const persistedUrl = imageMap[image.id] || getPersistedUrl(image.url, image.localPath)

      if (!persistedUrl) return null

      const next = {
        ...image,
        url: persistedUrl,
      }

      delete next.dataUrl

      return next
    })
    .filter(Boolean)
}

function sanitizeMessages(messages = [], aggressive = false) {
  return messages.map((message) => {
    if (message.type === 'assistant_images') {
      return {
        ...message,
        images: (message.images || []).map(sanitizePersistedImage).filter((image) => Boolean(image.url)),
      }
    }

    if (message.type === 'user_prompt' && message.draftSnapshot) {
      return {
        ...message,
        draftSnapshot: aggressive
          ? undefined
          : {
              ...message.draftSnapshot,
              referenceImages: sanitizeReferenceImages(message.draftSnapshot.referenceImages || []),
            },
      }
    }

    return message
  })
}

function sanitizeTopics(topics = [], messages = []) {
  const topicCoverMap = Object.fromEntries(
    messages
      .filter((message) => message.type === 'assistant_images')
      .map((message) => [message.topicId, message.images?.[0]?.url || ''])
      .filter(([, url]) => Boolean(url)),
  )

  return topics.map((topic) => {
    const persistedCover = topicCoverMap[topic.id] || getPersistedUrl(topic.coverImage)
    return {
      ...topic,
      coverImage: persistedCover || null,
    }
  })
}

function sanitizeDrafts(drafts = {}, imageMap = {}, aggressive = false) {
  return Object.fromEntries(
    Object.entries(drafts).map(([topicId, draft]) => [
      topicId,
      {
        ...draft,
        referenceImages: aggressive
          ? []
          : sanitizeReferenceImages(draft.referenceImages || [], imageMap),
      },
    ]),
  )
}

function sanitizePayload(payload, aggressive = false) {
  const messages = sanitizeMessages(payload.messages || [], aggressive)
  const imageMap = buildPersistedImageMap(messages)

  return {
    ...payload,
    topics: sanitizeTopics(payload.topics || [], messages),
    messages,
    drafts: sanitizeDrafts(payload.drafts || {}, imageMap, aggressive),
  }
}

export function loadPersistedState() {
  const raw = localStorage.getItem(STORAGE_KEY)

  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    return parsed.version === STORAGE_VERSION ? sanitizePayload(parsed.payload || {}) : null
  } catch {
    return null
  }
}

export function savePersistedState(payload) {
  const write = (nextPayload) =>
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        payload: nextPayload,
      }),
    )

  try {
    write(sanitizePayload(payload))
  } catch (error) {
    if (error?.name === 'QuotaExceededError') {
      write(sanitizePayload(payload, true))
      return
    }

    throw error
  }
}
