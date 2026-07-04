function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function normalizeImageResponse(payload) {
  return {
    images: (payload.data || []).map((item) => ({
      id: createId(),
      url: item.url || `data:image/png;base64,${item.b64_json}`,
      b64: item.b64_json || '',
      width: item.width || null,
      height: item.height || null,
    })),
    revisedPrompt: payload.revised_prompt || '',
  }
}
