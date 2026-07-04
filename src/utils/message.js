function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function createUserPromptMessage(topicId, prompt, draft) {
  return {
    id: createId(),
    topicId,
    type: 'user_prompt',
    role: 'user',
    prompt,
    draftSnapshot: { ...draft, referenceImages: [...(draft.referenceImages || [])] },
    createdAt: Date.now(),
  }
}

export function createStatusMessage(topicId, status, meta = {}) {
  return {
    id: createId(),
    topicId,
    type: 'system_status',
    role: 'system',
    status,
    meta,
    createdAt: Date.now(),
  }
}
