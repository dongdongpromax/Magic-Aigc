import axios from 'axios'
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildVideoPayload } from '../providers/videoPayload.js'
import { sanitizeForLog } from '../logs/logSanitizer.js'

/**
 * 视频生成服务
 *
 * 职责：编排火山 Seedance 视频生成的完整流程
 * - 解析首帧参考图 → 解析中转站 → 构建请求体 → 创建异步任务
 * - 后端轮询直到终态（succeeded/failed/cancelled/expired）
 * - 下载视频落盘（video_url 为 24h 预签名链接，必须本地化）
 * - 事务内保存消息 + 清参考图 + 重置草稿
 *
 * 平行于 server.js 的 imageService.generateImageMessage，前端零轮询逻辑。
 */

/** 轮询间隔（毫秒） */
const POLL_INTERVAL_MS = 5000
/** 轮询总超时（毫秒，5 分钟，覆盖 30-120 秒生成 + 排队） */
const MAX_TOTAL_WAIT_MS = 300000
/** 视频下载超时（毫秒，2 分钟） */
const DOWNLOAD_TIMEOUT_MS = 120000

/**
 * 把参考图项解析为可发送给上游的 data URL（base64）
 * 复用 server.js 的 resolveReferenceInput 逻辑
 * @param {object} fileStorage
 * @param {{ dataUrl?: string; filePath?: string; url?: string; type?: string; mimeType?: string }} item
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
 * best-effort 清理已写入磁盘的文件（DB 失败回滚时调用）
 * 文件系统失败不影响错误传播，仅记录警告
 * @param {Array<string>} filePaths /files/... 形式的路径
 * @param {string} rootDir storage 根目录绝对路径
 */
async function cleanupOrphanFiles(filePaths, rootDir) {
  await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        const relativePath = filePath.replace(/^\/files\//, '')
        const absolutePath = path.join(rootDir, relativePath)
        await fs.unlink(absolutePath)
      } catch (err) {
        console.warn(`[cleanup] 清理孤儿文件失败: ${filePath}`, err?.message)
      }
    }),
  )
}

/**
 * 创建视频生成服务
 * @param {{
 *   providersService: object;
 *   upstreamClient: object;
 *   fileStorage: object;
 *   topicRepository: object;
 *   draftRepository: object;
 *   settingsRepository: object;
 *   pool: import('mysql2/promise').Pool;
 *   runTransaction: (pool: unknown, fn: (conn: unknown) => Promise<unknown>) => Promise<unknown>;
 *   storageRoot: string;
 *   usageLogger?: object;
 * }} deps
 */
export function createVideoService(deps) {
  const {
    providersService,
    upstreamClient,
    fileStorage,
    topicRepository,
    draftRepository,
    pool,
    runTransaction,
    storageRoot,
    usageLogger,
  } = deps

  /**
   * 轮询视频任务直到终态
   * - succeeded：返回终态任务对象
   * - failed/cancelled：抛 502（带上游错误信息）
   * - expired：抛 504
   * - 超时（超过 MAX_TOTAL_WAIT_MS）：抛 504
   * @param {object} provider
   * @param {string} taskId
   * @returns {Promise<object>} succeeded 终态任务对象
   */
  async function pollUntilTerminal(provider, taskId) {
    const deadline = Date.now() + MAX_TOTAL_WAIT_MS
    while (Date.now() < deadline) {
      const task = await upstreamClient.getVideoTask(provider, taskId)
      if (task.status === 'succeeded') return task
      if (task.status === 'failed' || task.status === 'cancelled') {
        const err = new Error(`视频生成失败：${task.error?.message || task.status}`)
        err.status = 502
        // 上游原因（如「内容不合规」）对用户可读，标记透传给前端
        err.expose = true
        throw err
      }
      if (task.status === 'expired') {
        const err = new Error('视频生成任务超时（上游 expired）')
        err.status = 504
        err.expose = true
        throw err
      }
      // queued/running 继续等待
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
    const err = new Error('视频生成超时（等待超过 5 分钟）')
    err.status = 504
    err.expose = true
    throw err
  }

  /**
   * 下载视频到本地并落盘
   * @param {string} videoUrl 上游预签名 URL（24h 有效）
   * @param {string} topicId 主题 ID（用于文件名）
   * @returns {Promise<{ url: string; localPath: string; fileName: string; mimeType: string; savedToProject: boolean }>}
   */
  async function downloadVideoToLocal(videoUrl, topicId) {
    const fileName = `${topicId}-${Date.now()}.mp4`
    const response = await axios.get(videoUrl, {
      responseType: 'arraybuffer',
      timeout: DOWNLOAD_TIMEOUT_MS,
    })
    const localPath = await fileStorage.writeGeneratedBuffer(fileName, Buffer.from(response.data))
    return {
      url: localPath,
      localPath,
      fileName,
      mimeType: 'video/mp4',
      savedToProject: true,
    }
  }

  return {
    /**
     * 生成视频消息：解析首帧 → 解析中转站 → 构建请求 → 创建任务 → 轮询 → 下载落盘 → 事务保存
     *
     * 事务边界：saveVideoConversation + clearReferenceImages + saveDraft 三步原子化
     * 文件清理：先下载落盘再开事务，DB 失败时 best-effort unlink 已写文件
     *
     * @param {string} topicId 主题 ID
     * @param {{ prompt?: string; draft?: object }} payload
     * @returns {Promise<{ videos: Array<object>; providerName: string; ratio: string; duration: number; resolution: string }>}
     */
    async generateVideoMessage(topicId, payload) {
      const logStartTime = Date.now()
      // 提前声明以便 catch 块也能访问已捕获的数据
      let videoPayload = null
      let createTaskResponse = null
      let finalTaskResponse = null
      const logEntry = {
        type: 'video',
        topicId,
        prompt: payload.prompt || payload.draft?.prompt || '',
        model: payload.draft?.model || '',
      }

      try {
        const draft = payload.draft || {}
        const prompt = payload.prompt || draft.prompt || ''

        // 1. 解析全部参考图为 data URL 数组（按 videoRefMode 派生 role 由 buildVideoPayload 负责）
        const imageUrls = []
        for (const ref of draft.referenceImages || []) {
          imageUrls.push(await resolveReferenceInput(fileStorage, ref))
        }

        // 2. 按 draft.providerId 解析中转站（含 default_provider_id → 第一个 enabled 回退链）
        const provider = await providersService.resolveForDraft(draft.providerId)

        // 3. 构建 Seedance 请求体（videoRefMode + imageUrls 决定参考图 role 与数量）
        videoPayload = buildVideoPayload({
          model: draft.model,
          prompt,
          ratio: draft.ratio,
          duration: draft.duration,
          resolution: draft.resolution,
          videoRefMode: draft.videoRefMode,
          imageUrls,
        })

        // 4. 创建异步任务（API 调用失败时还没写文件，无需清理）
        const task = await upstreamClient.createVideoTask(provider, videoPayload)
        createTaskResponse = task
        const taskId = task?.id
        if (!taskId) {
          const err = new Error('上游未返回任务 ID')
          err.status = 502
          err.expose = true
          throw err
        }

        // 5. 轮询直到终态（succeeded 才继续；失败/超时直接抛）
        const finalTask = await pollUntilTerminal(provider, taskId)
        finalTaskResponse = finalTask

        // 6. 下载视频到本地（video_url 预签名 24h 有效，必须落盘）
        const videoUrl = finalTask.content?.video_url
        if (!videoUrl) {
          const err = new Error('任务成功但未返回视频地址')
          err.status = 502
          err.expose = true
          throw err
        }
        const video = await downloadVideoToLocal(videoUrl, topicId)

        // 7. 事务内：保存消息 + 清参考图 + 重置草稿（三步原子化）
        const writtenPaths = [video.localPath]
        try {
          const message = await runTransaction(pool, async (conn) => {
            const saved = await topicRepository.saveVideoConversation(
              {
                topicId,
                prompt,
                // 用规整后的 ratio/duration/resolution 落库（与实际发给上游的值一致），
                // 避免刷新后从 meta 回读时与真实生成参数不一致
                draft: {
                  ...draft,
                  providerName: provider.name,
                  ratio: videoPayload.ratio,
                  duration: videoPayload.duration,
                  resolution: videoPayload.resolution,
                  // 视频参考模式透传落库，供消息 meta 与 retry 回填使用
                  videoRefMode: draft.videoRefMode || 'first_frame',
                },
                videos: [video],
                usage: finalTask.usage || null,
              },
              conn,
            )
            await draftRepository.clearReferenceImages(topicId, conn)
            await draftRepository.saveDraft(topicId, { ...draft, prompt: '' }, conn)
            return saved
          })

          const result = {
            videos: message.videos,
            providerName: provider.name,
            ratio: videoPayload.ratio,
            duration: videoPayload.duration,
            resolution: videoPayload.resolution,
            // 视频参考模式回传，供前端消息 meta 与 retry 回填使用
            videoRefMode: draft.videoRefMode || 'first_frame',
          }

          // 记录使用日志（成功）：4 阶段数据 + 耗时 + 生成结果文件列表
          if (usageLogger) {
            logEntry.status = 'success'
            logEntry.providerName = provider.name
            logEntry.model = videoPayload.model
            logEntry.clientRequest = sanitizeForLog({ topicId, payload })
            logEntry.upstreamRequest = sanitizeForLog(videoPayload)
            logEntry.upstreamResponse = sanitizeForLog({
              createTaskResponse,
              finalTaskResponse,
            })
            logEntry.clientResponse = sanitizeForLog(result)
            // 提取生成的视频 URL 列表，供日志列表页直接展示缩略图
            logEntry.resultFiles = (result.videos || [])
              .map((vid) => ({
                url: vid.url || vid.localPath || '',
                mimeType: vid.mimeType || 'video/mp4',
                kind: 'video',
              }))
              .filter((f) => f.url)
            logEntry.durationMs = Date.now() - logStartTime
            await usageLogger.log(logEntry)
          }

          return result
        } catch (err) {
          // DB 失败但文件已落盘 → best-effort 清理，避免孤儿文件
          await cleanupOrphanFiles(writtenPaths, storageRoot)
          throw err
        }
      } catch (err) {
        // 记录使用日志（失败）：已捕获的阶段数据 + 错误信息
        if (usageLogger) {
          logEntry.status = 'error'
          logEntry.providerName = logEntry.providerName || ''
          logEntry.errorMessage = err?.message || String(err)
          logEntry.clientRequest = sanitizeForLog({ topicId, payload })
          if (videoPayload) logEntry.upstreamRequest = sanitizeForLog(videoPayload)
          if (createTaskResponse || finalTaskResponse) {
            logEntry.upstreamResponse = sanitizeForLog({
              createTaskResponse,
              finalTaskResponse,
            })
          }
          logEntry.durationMs = Date.now() - logStartTime
          await usageLogger.log(logEntry)
        }
        throw err
      }
    },
  }
}
