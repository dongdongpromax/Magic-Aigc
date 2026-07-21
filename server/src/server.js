import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { getServerEnv } from './config/env.js'
import { createPool } from './db/pool.js'
import { createSettingsRepository } from './db/repositories/settingsRepository.js'
import { createTopicRepository } from './db/repositories/topicRepository.js'
import { createDraftRepository } from './db/repositories/draftRepository.js'
import { verifyDatabaseConnection } from './db/init.js'
import { createFileStorage } from './modules/images/fileStorage.js'
import { createOpenRouterClient } from './modules/images/openrouterClient.js'

const env = getServerEnv()
const pool = createPool(env)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fileStorage = createFileStorage({
  rootDir: path.resolve(__dirname, '../storage'),
})
const openRouterClient = createOpenRouterClient({
  apiKey: env.openrouterApiKey,
})

function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function buildGeneratedFileName(topicId, index) {
  return `${topicId}-${Date.now()}-${String(index + 1).padStart(2, '0')}.png`
}

async function resolveReferenceInput(fileStorage, item) {
  if (item.dataUrl) return item.dataUrl
  if (item.filePath) return fileStorage.readFileAsDataUrl(item.filePath, item.type || item.mimeType)
  if (item.url?.startsWith('/files/')) {
    return fileStorage.readFileAsDataUrl(item.url, item.type || item.mimeType)
  }
  return item.url
}

await verifyDatabaseConnection(pool)
await fileStorage.ensureDirs()

const settingsRepository = createSettingsRepository(pool)
const topicRepository = createTopicRepository(pool)
const draftRepository = createDraftRepository(pool)

const app = createApp({
  settingsRepository,
  topicRepository,
  draftRepository,
  imageService: {
    async saveReferenceUpload(topicId, files) {
      const savedItems = await Promise.all(
        files.map(async (file) => {
          const saved = await fileStorage.writeReferenceFile(file)
          return {
            id: createId(),
            name: file.originalname,
            filePath: saved.filePath,
            mimeType: file.mimetype,
            sourceMessageId: null,
          }
        }),
      )

      return draftRepository.addReferenceImages(topicId, savedItems)
    },

    async deleteReferenceImage(topicId, referenceId) {
      return draftRepository.removeReferenceImage(topicId, referenceId)
    },

    async generateImageMessage(topicId, payload) {
      const settings = await settingsRepository.getSettings()
      const draft = payload.draft || {}
      const inputReferences = await Promise.all(
        (draft.referenceImages || []).map((item) => resolveReferenceInput(fileStorage, item)),
      )

      const openrouterPayload = {
        model: draft.model || settings.defaultModel,
        prompt: payload.prompt || draft.prompt || '',
        size: draft.size || settings.defaultSize,
        quality: draft.quality || settings.defaultQuality,
        n: draft.n || settings.defaultN,
      }

      if (inputReferences.length) {
        openrouterPayload.input_references = inputReferences
      }

      const response = await openRouterClient.generateImages({
        baseURL: settings.baseURL,
        payload: openrouterPayload,
        timeout: settings.timeout,
      })

      const images = await Promise.all(
        (response.data || []).map(async (item, index) => {
          const fileName = buildGeneratedFileName(topicId, index)
          const savedToProject = Boolean(item.b64_json)
          const localPath = savedToProject
            ? await fileStorage.writeGeneratedBase64(fileName, item.b64_json)
            : ''

          return {
            url: localPath || item.url,
            localPath,
            fileName,
            mimeType: 'image/png',
            width: item.width || null,
            height: item.height || null,
            savedToProject,
            b64: '',
          }
        }),
      )

      const message = await topicRepository.saveGeneratedConversation({
        topicId,
        prompt: payload.prompt || '',
        revisedPrompt: response.revised_prompt || '',
        draft,
        images,
      })

      await draftRepository.clearReferenceImages(topicId)
      await draftRepository.saveDraft(topicId, {
        ...draft,
        prompt: '',
      })

      return {
        images: message.images,
        revisedPrompt: message.revisedPrompt,
      }
    },
  },
})

app.listen(env.port, () => {
  console.log(`backend listening on http://127.0.0.1:${env.port}`)
})
