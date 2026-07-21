import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { getServerEnv } from './config/env.js'
import { createPool } from './db/pool.js'
import { createSettingsRepository } from './db/repositories/settingsRepository.js'
import { createTopicRepository } from './db/repositories/topicRepository.js'
import { createDraftRepository } from './db/repositories/draftRepository.js'
import { verifyDatabaseConnection } from './db/init.js'
import { runTransaction } from './db/transaction.js'
import { createFileStorage } from './modules/images/fileStorage.js'
import { createOpenRouterClient } from './modules/images/openrouterClient.js'

const env = getServerEnv()
const pool = createPool(env)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const storageRoot = path.resolve(__dirname, '../storage')
const fileStorage = createFileStorage({ rootDir: storageRoot })
const openRouterClient = createOpenRouterClient({
  apiKey: env.openrouterApiKey,
})

/**
 * 生成唯一 ID，优先使用 crypto.randomUUID，回退到时间戳+随机数
 * @returns {string}
 */
function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * 构造生成图的文件名（topicId-时间戳-序号.png）
 * @param {string} topicId 主题 ID
 * @param {number} index 图片序号（0 起始）
 * @returns {string}
 */
function buildGeneratedFileName(topicId, index) {
  return `${topicId}-${Date.now()}-${String(index + 1).padStart(2, '0')}.png`
}

/**
 * 将参考图项解析为可发送给 OpenRouter 的 data URL
 * @param {{ dataUrl?: string; filePath?: string; url?: string; type?: string; mimeType?: string }} item 参考图
 * @returns {Promise<string>}
 */
async function resolveReferenceInput(fileStorage, item) {
  if (item.dataUrl) return item.dataUrl
  if (item.filePath) return fileStorage.readFileAsDataUrl(item.filePath, item.type || item.mimeType)
  if (item.url?.startsWith('/files/')) {
    return fileStorage.readFileAsDataUrl(item.url, item.type || item.mimeType)
  }
  return item.url
}

/**
 * Best-effort 清理已写入磁盘的文件（DB 失败回滚时调用）
 * 文件系统失败不影响错误传播，仅记录警告
 * @param {Array<string>} filePaths 文件相对路径（/files/... 形式）
 * @param {string} rootDir storage 根目录绝对路径
 */
async function cleanupOrphanFiles(filePaths, rootDir) {
  await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        // /files/references/xxx.png → references/xxx.png
        const relativePath = filePath.replace(/^\/files\//, '')
        const absolutePath = path.join(rootDir, relativePath)
        await fs.unlink(absolutePath)
      } catch (err) {
        // 文件可能已不存在或权限不足，仅记录警告
        console.warn(`[cleanup] 清理孤儿文件失败: ${filePath}`, err?.message)
      }
    }),
  )
}

// 启动时探测 DB：失败仅警告不退出，让后端能在 MySQL 未就绪时也启动
// （/api/health 仍会反映 DB 真实状态；API 调用时 pool 会自动重连）
try {
  await verifyDatabaseConnection(pool)
} catch (err) {
  console.warn(
    `[startup] 数据库连接失败，后端仍将启动（API 调用可能失败，请用 \`npm run dev:db\` 启动 MySQL）：${err?.message || err}`,
  )
}
await fileStorage.ensureDirs()

const settingsRepository = createSettingsRepository(pool)
const topicRepository = createTopicRepository(pool)
const draftRepository = createDraftRepository(pool)

const app = createApp({
  settingsRepository,
  topicRepository,
  draftRepository,
  // P1-6: 健康检查注入，/api/health 会调用此函数探测 DB
  healthCheck: async () => verifyDatabaseConnection(pool),
  imageService: {
    /**
     * 保存上传的参考图文件并登记到 draft_reference_images 表
     */
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

      // 参考图上传用事务包裹，避免部分插入
      return runTransaction(pool, async (conn) => {
        return draftRepository.addReferenceImages(topicId, savedItems, conn)
      })
    },

    async deleteReferenceImage(topicId, referenceId) {
      return draftRepository.removeReferenceImage(topicId, referenceId)
    },

    /**
     * 「设为参考图」：把历史消息中的图片登记为当前主题的参考图
     *
     * 复用 message_images.file_path，不复制文件。
     * 在事务内完成：校验消息归属 → 查询图片元数据 → 校验 16 张上限 → 插入 draft_reference_images
     */
    async registerReferenceFromMessage(topicId, { messageId, imageIds }) {
      if (!messageId || !Array.isArray(imageIds) || imageIds.length === 0) {
        const err = new Error('messageId 和 imageIds 不能为空')
        err.status = 400
        throw err
      }

      return runTransaction(pool, async (conn) => {
        // 校验消息属于该主题，防跨主题引用
        const belongs = await topicRepository.verifyMessageBelongsToTopic(topicId, messageId, conn)
        if (!belongs) {
          const err = new Error('消息不存在或不属于该主题')
          err.status = 404
          throw err
        }

        // 校验 16 张上限（当前数量 + 新增数量）
        const currentCount = await draftRepository.countReferenceImages(topicId, conn)
        if (currentCount + imageIds.length > 16) {
          const err = new Error(`参考图已达上限（当前 ${currentCount} 张，最多 16 张）`)
          err.status = 400
          throw err
        }

        await draftRepository.addReferenceImagesFromMessage(topicId, messageId, imageIds, conn)

        // 返回最新参考图列表
        return { referenceImages: await draftRepository.listReferenceImages(topicId, conn) }
      })
    },

    /**
     * 生成图片消息：调用 OpenRouter → 写文件 → 事务内保存消息/清理参考图/重置草稿
     *
     * 事务边界：saveGeneratedConversation + clearReferenceImages + saveDraft 三步原子化
     * 文件清理：先写盘再开事务，DB 失败时 best-effort unlink 已写文件
     */
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

      // API 调用失败时还没写文件，无需清理
      const response = await openRouterClient.generateImages({
        baseURL: settings.baseURL,
        payload: openrouterPayload,
        timeout: settings.timeout,
      })

      // 文件先写盘（b64 太大不便在事务里持连接），记录所有成功写入的路径
      const writtenPaths = []
      let images
      try {
        images = await Promise.all(
          (response.data || []).map(async (item, index) => {
            const fileName = buildGeneratedFileName(topicId, index)
            const savedToProject = Boolean(item.b64_json)
            const localPath = savedToProject
              ? await fileStorage.writeGeneratedBase64(fileName, item.b64_json)
              : ''

            if (localPath) writtenPaths.push(localPath)

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

        // 三步 DB 操作合并到一个事务，任一失败全回滚
        const message = await runTransaction(pool, async (conn) => {
          const saved = await topicRepository.saveGeneratedConversation(
            {
              topicId,
              prompt: payload.prompt || '',
              revisedPrompt: response.revised_prompt || '',
              draft,
              images,
            },
            conn,
          )
          await draftRepository.clearReferenceImages(topicId, conn)
          await draftRepository.saveDraft(topicId, { ...draft, prompt: '' }, conn)
          return saved
        })

        return {
          images: message.images,
          revisedPrompt: message.revisedPrompt,
        }
      } catch (err) {
        // DB 失败但文件已写 → best-effort 清理，避免孤儿文件
        if (writtenPaths.length) {
          await cleanupOrphanFiles(writtenPaths, storageRoot)
        }
        throw err
      }
    },
  },
  // P0-8: 主题服务，承载删除主题的事务+文件清理
  topicService: {
    /**
     * 删除主题：事务内删除 5 表数据，事务后 best-effort 清理文件
     */
    async deleteTopic(topicId) {
      // 先在事务内收集文件路径并删除数据
      const filePaths = await runTransaction(pool, async (conn) => {
        const paths = await topicRepository.listTopicFilePaths(topicId, conn)
        const deleted = await topicRepository.deleteTopic(topicId, conn)
        if (!deleted) {
          const err = new Error('主题不存在')
          err.status = 404
          throw err
        }
        return paths
      })

      // 事务提交后再清理文件（DB 是真相，文件系统失败不影响响应）
      if (filePaths.length) {
        await cleanupOrphanFiles(filePaths, storageRoot)
      }

      return { success: true }
    },
  },
})

app.listen(env.port, () => {
  console.log(`backend listening on http://127.0.0.1:${env.port}`)
})
