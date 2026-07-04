import { createAiClient } from './aiClient'
import { normalizeImageResponse } from '@/utils/normalize'

function normalizeModelId(model) {
  if (!model) return 'openai/gpt-image-2'
  if (model === 'gpt-image-2') return 'openai/gpt-image-2'
  return model
}

function buildImagePayload(draft, prompt) {
  const payload = {
    model: normalizeModelId(draft.model),
    prompt,
    size: draft.size,
    quality: draft.quality,
    n: draft.n,
  }

  if (draft.referenceImages?.length) {
    payload.input_references = draft.referenceImages.map((item) => item.dataUrl || item.url || item)
  }

  if (draft.background) payload.background = draft.background
  if (typeof draft.outputCompression === 'number') payload.output_compression = draft.outputCompression

  return payload
}

export async function requestImages(config, draft, prompt) {
  const client = createAiClient(config)

  const isChatMode = config.requestMode === 'openai-chat'
  const endpoint = isChatMode ? '/chat/completions' : '/images'
  const body =
    isChatMode
      ? {
          model: normalizeModelId(draft.model),
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }
      : buildImagePayload(draft, prompt)

  const response = await client.post(endpoint, body)
  const data = isChatMode ? response.data?.images || response.data : response.data

  return normalizeImageResponse(data)
}
