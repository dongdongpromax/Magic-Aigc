<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, RefreshCw, Trash2, X, Copy, Check, AlertCircle, CheckCircle2, ImageIcon, VideoIcon } from 'lucide-vue-next'
import { listUsageLogs, getUsageLogDetail, deleteUsageLog, clearAllUsageLogs } from '@/services/usageLogApi'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const router = useRouter()

// 日志列表
const logs = ref([])
// 当前筛选类型
const filterType = ref('')
// 加载状态
const isLoading = ref(false)
// 错误信息
const errorMsg = ref('')

// 详情面板
const selectedLog = ref(null)
const isLoadingDetail = ref(false)
// 各阶段 JSON 折叠状态
const expandedSections = ref({
  clientRequest: true,
  upstreamRequest: true,
  upstreamResponse: true,
  clientResponse: true,
})
// 已复制标记
const copiedField = ref('')

// 清空确认弹窗
const clearConfirmShow = ref(false)

/**
 * 格式化时间戳为中文日期时间
 * @param {number} ts 毫秒时间戳
 * @returns {string}
 */
function formatTime(ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/**
 * 格式化耗时（毫秒 → 可读文案）
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/**
 * 截断过长的 prompt 用于列表展示
 * @param {string} prompt
 * @returns {string}
 */
function truncatePrompt(prompt) {
  if (!prompt) return '-'
  return prompt.length > 50 ? prompt.slice(0, 50) + '...' : prompt
}

/**
 * 格式化 prompt 长度（字符数 → 可读文案）
 * @param {string} prompt
 * @returns {string}
 */
function formatPromptLength(prompt) {
  if (!prompt) return '-'
  const len = prompt.length
  if (len > 4000) return `${len} 字符（超长）`
  if (len > 1000) return `${len} 字符`
  return `${len} 字符`
}

/**
 * 从日志中提取结果文件列表（优先用列表摘要的 resultFiles，回退到详情的 clientResponse）
 * @param {object} log 日志对象
 * @returns {Array<{ url: string; mimeType: string; kind: string }>}
 */
function extractResultFiles(log) {
  if (log.resultFiles?.length) return log.resultFiles
  // 详情模式：从 clientResponse 中提取
  const cr = log.clientResponse
  if (!cr) return []
  const files = []
  if (cr.images?.length) {
    for (const img of cr.images) {
      if (img.url || img.localPath) {
        files.push({ url: img.url || img.localPath, mimeType: img.mimeType || 'image/png', kind: 'image' })
      }
    }
  }
  if (cr.videos?.length) {
    for (const vid of cr.videos) {
      if (vid.url || vid.localPath) {
        files.push({ url: vid.url || vid.localPath, mimeType: vid.mimeType || 'video/mp4', kind: 'video' })
      }
    }
  }
  return files
}

/**
 * JSON 语法高亮：把 JSON 字符串转为带颜色的 HTML
 * @param {object|string} data
 * @returns {string} HTML 字符串
 */
function highlightJson(data) {
  if (!data) return '<span class="json-null">null</span>'
  const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  // 转义 HTML 特殊字符
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  // 语法高亮：key / string / number / boolean / null
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'json-number'
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key'
        } else {
          cls = 'json-string'
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean'
      } else if (/null/.test(match)) {
        cls = 'json-null'
      }
      return `<span class="${cls}">${match}</span>`
    },
  )
}

/**
 * 加载日志列表
 */
async function fetchLogs() {
  isLoading.value = true
  errorMsg.value = ''
  try {
    logs.value = await listUsageLogs({
      type: filterType.value || undefined,
      limit: 200,
    })
  } catch (err) {
    errorMsg.value = `加载失败：${err?.response?.data?.message || err?.message || ''}`
  } finally {
    isLoading.value = false
  }
}

/**
 * 点击日志行，加载详情
 * @param {object} log 日志摘要
 */
async function handleSelectLog(log) {
  selectedLog.value = log
  isLoadingDetail.value = true
  try {
    const detail = await getUsageLogDetail(log.id)
    selectedLog.value = detail
  } catch (err) {
    errorMsg.value = `加载详情失败：${err?.message || ''}`
  } finally {
    isLoadingDetail.value = false
  }
}

/**
 * 关闭详情面板
 */
function handleCloseDetail() {
  selectedLog.value = null
}

/**
 * 切换阶段折叠
 * @param {string} section
 */
function toggleSection(section) {
  expandedSections.value[section] = !expandedSections.value[section]
}

/**
 * 复制 JSON 到剪贴板
 * @param {string} field 字段名
 * @param {object} data JSON 数据
 */
async function handleCopy(field, data) {
  if (!data) return
  try {
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    copiedField.value = field
    setTimeout(() => {
      copiedField.value = ''
    }, 2000)
  } catch {
    // 剪贴板可能被浏览器拦截，静默失败
  }
}

/**
 * 删除单条日志
 * @param {string} id
 */
async function handleDeleteLog(id) {
  try {
    await deleteUsageLog(id)
    logs.value = logs.value.filter((l) => l.id !== id)
    if (selectedLog.value?.id === id) {
      selectedLog.value = null
    }
  } catch (err) {
    errorMsg.value = `删除失败：${err?.message || ''}`
  }
}

/**
 * 确认清空所有日志
 */
async function handleConfirmClear() {
  clearConfirmShow.value = false
  try {
    await clearAllUsageLogs()
    logs.value = []
    selectedLog.value = null
  } catch (err) {
    errorMsg.value = `清空失败：${err?.message || ''}`
  }
}

/**
 * 返回聊天创作页
 */
function handleBack() {
  router.push('/chat')
}

/** 当前选中日志的结果文件列表（computed，响应详情加载完成） */
const selectedResultFiles = computed(() => {
  if (!selectedLog.value) return []
  return extractResultFiles(selectedLog.value)
})

onMounted(() => {
  fetchLogs()
})
</script>

<template>
  <div class="usage-log-page">
    <!-- 顶部操作栏 -->
    <div class="page-header">
      <button class="back-btn" type="button" @click="handleBack">
        <ArrowLeft :size="16" />
        <span>返回创作</span>
      </button>
      <h1 class="page-title">使用日志</h1>
      <div class="header-actions">
        <button
          class="header-btn"
          type="button"
          :disabled="isLoading"
          @click="fetchLogs"
        >
          <RefreshCw :size="14" :class="{ spinning: isLoading }" />
          <span>刷新</span>
        </button>
        <button
          class="header-btn header-btn--danger"
          type="button"
          :disabled="!logs.length"
          @click="clearConfirmShow = true"
        >
          <Trash2 :size="14" />
          <span>清空</span>
        </button>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <div class="filter-group">
        <button
          v-for="opt in [{ value: '', label: '全部' }, { value: 'image', label: '图像' }, { value: 'video', label: '视频' }]"
          :key="opt.value"
          type="button"
          class="filter-btn"
          :class="{ active: filterType === opt.value }"
          @click="filterType = opt.value; fetchLogs()"
        >
          {{ opt.label }}
        </button>
      </div>
      <span class="log-count">共 {{ logs.length }} 条</span>
    </div>

    <!-- 错误提示 -->
    <div v-if="errorMsg" class="error-banner">
      <AlertCircle :size="14" />
      <span>{{ errorMsg }}</span>
    </div>

    <!-- 日志表格 -->
    <div class="table-container">
      <table class="log-table" v-if="logs.length">
        <thead>
          <tr>
            <th class="col-preview">预览</th>
            <th class="col-time">时间</th>
            <th class="col-type">类型</th>
            <th class="col-model">模型</th>
            <th class="col-prompt">提示词</th>
            <th class="col-prompt-len">字数</th>
            <th class="col-status">状态</th>
            <th class="col-duration">耗时</th>
            <th class="col-actions">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="log in logs"
            :key="log.id"
            class="log-row"
            :class="{ selected: selectedLog?.id === log.id }"
            @click="handleSelectLog(log)"
          >
            <td class="col-preview">
              <div v-if="log.resultFiles?.length" class="row-preview">
                <img
                  v-if="log.resultFiles[0].kind === 'image'"
                  :src="log.resultFiles[0].url"
                  class="preview-thumb"
                  alt="生成结果"
                />
                <div v-else class="preview-thumb preview-thumb--video">
                  <VideoIcon :size="14" />
                </div>
                <span v-if="log.resultFiles.length > 1" class="preview-count">×{{ log.resultFiles.length }}</span>
              </div>
              <span v-else class="preview-empty">-</span>
            </td>
            <td class="col-time">{{ formatTime(log.createdAt) }}</td>
            <td class="col-type">
              <span class="type-tag" :class="log.type">{{ log.type === 'image' ? '图像' : '视频' }}</span>
            </td>
            <td class="col-model">{{ log.model || '-' }}</td>
            <td class="col-prompt">{{ truncatePrompt(log.prompt) }}</td>
            <td class="col-prompt-len" :class="{ 'len-warn': log.prompt?.length > 4000 }">
              {{ formatPromptLength(log.prompt) }}
            </td>
            <td class="col-status">
              <span class="status-tag" :class="log.status">
                <component :is="log.status === 'success' ? CheckCircle2 : AlertCircle" :size="12" />
                {{ log.status === 'success' ? '成功' : '失败' }}
              </span>
            </td>
            <td class="col-duration">{{ formatDuration(log.durationMs) }}</td>
            <td class="col-actions" @click.stop>
              <button class="row-delete-btn" type="button" title="删除" @click="handleDeleteLog(log.id)">
                <Trash2 :size="13" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 空状态 -->
      <div v-else-if="!isLoading" class="empty-state">
        <AlertCircle :size="32" />
        <p>暂无使用日志</p>
        <span>进行图像或视频生成后，这里会显示完整的请求与响应记录</span>
      </div>

      <!-- 加载中 -->
      <div v-else class="loading-state">
        <RefreshCw :size="24" class="spinning" />
        <p>加载中...</p>
      </div>
    </div>

    <!-- 详情抽屉 -->
    <Teleport to="body">
      <div v-if="selectedLog" class="detail-overlay" @click.self="handleCloseDetail">
        <div class="detail-drawer">
          <!-- 抽屉头部 -->
          <div class="drawer-header">
            <div class="drawer-title">
              <span class="type-tag" :class="selectedLog.type">
                {{ selectedLog.type === 'image' ? '图像' : '视频' }}
              </span>
              <span class="status-tag" :class="selectedLog.status">
                <component :is="selectedLog.status === 'success' ? CheckCircle2 : AlertCircle" :size="12" />
                {{ selectedLog.status === 'success' ? '成功' : '失败' }}
              </span>
              <span class="drawer-time">{{ formatTime(selectedLog.createdAt) }}</span>
            </div>
            <button class="drawer-close" type="button" @click="handleCloseDetail">
              <X :size="18" />
            </button>
          </div>

          <!-- 可滚动内容区：摘要/提示词/预览/错误/JSON 全部包裹在此，
               头部固定吸顶，内容超出视口时滚动，避免被 overflow:hidden 裁剪看不到图片与 JSON -->
          <div class="drawer-content">
            <!-- 摘要信息 -->
            <div class="drawer-summary">
            <div class="summary-item">
              <span class="summary-label">模型</span>
              <span class="summary-value">{{ selectedLog.model || '-' }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">中转站</span>
              <span class="summary-value">{{ selectedLog.providerName || '-' }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">耗时</span>
              <span class="summary-value">{{ formatDuration(selectedLog.durationMs) }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">字数</span>
              <span class="summary-value" :class="{ 'len-warn': selectedLog.prompt?.length > 4000 }">
                {{ formatPromptLength(selectedLog.prompt) }}
              </span>
            </div>
            <div class="summary-item" v-if="selectedLog.topicId">
              <span class="summary-label">主题</span>
              <span class="summary-value summary-value--mono">{{ selectedLog.topicId }}</span>
            </div>
            <div class="summary-item" v-if="selectedResultFiles.length">
              <span class="summary-label">结果</span>
              <span class="summary-value">{{ selectedResultFiles.length }} 个文件</span>
            </div>
          </div>

          <!-- 完整 prompt 展示 -->
          <div v-if="selectedLog.prompt" class="prompt-section">
            <div class="prompt-header">
              <span class="prompt-label">完整提示词</span>
              <button class="copy-btn" type="button" title="复制提示词" @click="handleCopy('prompt', selectedLog.prompt)">
                <component :is="copiedField === 'prompt' ? Check : Copy" :size="13" />
              </button>
            </div>
            <pre class="prompt-body">{{ selectedLog.prompt }}</pre>
          </div>

          <!-- 生成结果预览（图片/视频） -->
          <div v-if="!isLoadingDetail && selectedResultFiles.length" class="result-preview-section">
            <div class="preview-section-title">
              <component :is="selectedResultFiles[0].kind === 'image' ? ImageIcon : VideoIcon" :size="14" />
              <span>生成结果预览</span>
              <span class="preview-count-label">{{ selectedResultFiles.length }} 个</span>
            </div>
            <div class="preview-grid">
              <template v-for="(file, idx) in selectedResultFiles" :key="idx">
                <div v-if="file.kind === 'image'" class="preview-item">
                  <img :src="file.url" :alt="`生成结果 ${idx + 1}`" loading="lazy" />
                </div>
                <div v-else class="preview-item preview-item--video">
                  <video :src="file.url" controls preload="metadata"></video>
                </div>
              </template>
            </div>
          </div>

          <!-- 错误信息 -->
          <div v-if="selectedLog.errorMessage" class="error-detail">
            <AlertCircle :size="14" />
            <span>{{ selectedLog.errorMessage }}</span>
          </div>

          <!-- 加载中 -->
          <div v-if="isLoadingDetail" class="drawer-loading">
            <RefreshCw :size="20" class="spinning" />
            <span>加载详情...</span>
          </div>

          <!-- 4 阶段数据 -->
          <template v-if="!isLoadingDetail && selectedLog.clientRequest">
            <div
              v-for="section in [
                { key: 'clientRequest', title: '前端请求', desc: '前端发给后端的完整参数', data: selectedLog.clientRequest },
                { key: 'upstreamRequest', title: '上游请求', desc: '后端发给 AI 中转站的实际请求体', data: selectedLog.upstreamRequest },
                { key: 'upstreamResponse', title: '上游响应', desc: 'AI 中转站返回的原始响应', data: selectedLog.upstreamResponse },
                { key: 'clientResponse', title: '前端响应', desc: '后端返回给前端的最终结果', data: selectedLog.clientResponse },
              ]"
              :key="section.key"
              class="json-section"
            >
              <div class="section-header" @click="toggleSection(section.key)">
                <div class="section-title">
                  <span class="section-arrow" :class="{ expanded: expandedSections[section.key] }">▶</span>
                  <span class="section-name">{{ section.title }}</span>
                  <span class="section-desc">{{ section.desc }}</span>
                </div>
                <button
                  v-if="section.data"
                  class="copy-btn"
                  type="button"
                  title="复制 JSON"
                  @click.stop="handleCopy(section.key, section.data)"
                >
                  <component :is="copiedField === section.key ? Check : Copy" :size="13" />
                </button>
              </div>
              <div v-if="expandedSections[section.key]" class="section-body">
                <pre v-if="section.data" class="json-viewer" v-html="highlightJson(section.data)"></pre>
                <div v-else class="json-empty">无数据</div>
              </div>
            </div>
          </template>
          </div><!-- /drawer-content -->
        </div>
      </div>
    </Teleport>

    <!-- 清空确认弹窗 -->
    <ConfirmDialog
      v-model:show="clearConfirmShow"
      title="确定清空所有日志？"
      content="将删除全部使用日志记录，且不可恢复。"
      confirm-text="清空"
      danger
      @confirm="handleConfirmClear"
    />
  </div>
</template>

<style lang="scss" scoped>
@import '@/styles/variables.scss';

.usage-log-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  z-index: 1;
  overflow: hidden;
}

/* 顶部操作栏 */
.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px clamp(20px, 4vw, 48px) 0;
  flex-shrink: 0;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.04);
  color: $text-secondary;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    color: $text-primary;
  }
}

.page-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: $text-primary;
  flex: 1;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.header-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.04);
  color: $text-secondary;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.08);
    color: $text-primary;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &--danger:hover:not(:disabled) {
    border-color: rgba(255, 107, 107, 0.4);
    background: rgba(255, 107, 107, 0.1);
    color: #ff6b6b;
  }
}

/* 筛选栏 */
.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px clamp(20px, 4vw, 48px) 0;
  flex-shrink: 0;
}

.filter-group {
  display: flex;
  gap: 3px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  padding: 3px;
}

.filter-btn {
  padding: 5px 14px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: $text-secondary;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    color: $text-primary;
  }

  &.active {
    background: rgba(255, 255, 255, 0.1);
    color: $text-primary;
    font-weight: 500;
  }
}

.log-count {
  font-size: 12px;
  color: $text-muted;
}

/* 错误提示 */
.error-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 12px clamp(20px, 4vw, 48px) 0;
  padding: 8px 12px;
  border-radius: 3px;
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid rgba(255, 107, 107, 0.2);
  color: rgba(255, 167, 167, 0.9);
  font-size: 13px;
}

/* 表格 */
.table-container {
  flex: 1;
  overflow: auto;
  padding: 12px clamp(20px, 4vw, 48px) 20px;
}

.log-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.log-table thead {
  position: sticky;
  top: 0;
  z-index: 1;
}

.log-table th {
  text-align: left;
  padding: 10px 12px;
  color: $text-muted;
  font-weight: 500;
  font-size: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(15, 17, 22, 0.95);
  backdrop-filter: blur(8px);
  white-space: nowrap;
}

.log-row {
  cursor: pointer;
  transition: background 0.12s;

  &:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  &.selected {
    background: rgba(59, 130, 246, 0.08);
  }

  td {
    padding: 10px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    color: $text-primary;
    vertical-align: middle;
  }
}

/* 预览缩略图列 */
.col-preview {
  width: 48px;
  text-align: center;
}

.row-preview {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.preview-thumb {
  width: 36px;
  height: 36px;
  border-radius: 3px;
  object-fit: cover;
  border: 1px solid rgba(255, 255, 255, 0.08);

  &--video {
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 107, 53, 0.15);
    color: rgba(255, 183, 148, 0.9);
  }
}

.preview-count {
  position: absolute;
  bottom: -2px;
  right: -4px;
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.8);
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.2;
}

.preview-empty {
  color: $text-muted;
  font-size: 12px;
}

.col-time {
  white-space: nowrap;
  color: $text-secondary;
  font-size: 12px;
}

.col-model {
  color: $text-secondary;
}

.col-prompt {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: $text-secondary;
}

.col-prompt-len {
  white-space: nowrap;
  color: $text-secondary;
  font-size: 12px;

  &.len-warn {
    color: #f59e0b;
    font-weight: 500;
  }
}

.col-duration {
  white-space: nowrap;
  color: $text-secondary;
  font-size: 12px;
}

.col-actions {
  width: 40px;
  text-align: center;
}

/* 类型标签 */
.type-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;

  &.image {
    background: rgba(59, 130, 246, 0.15);
    color: rgba(147, 197, 253, 0.9);
  }

  &.video {
    background: rgba(255, 107, 53, 0.15);
    color: rgba(255, 183, 148, 0.9);
  }
}

/* 状态标签 */
.status-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  white-space: nowrap;

  &.success {
    color: rgba(134, 239, 172, 0.9);
  }

  &.error {
    color: rgba(255, 167, 167, 0.9);
  }
}

.row-delete-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  background: transparent;
  color: $text-muted;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    color: #ff6b6b;
    border-color: rgba(255, 107, 107, 0.3);
    background: rgba(255, 107, 107, 0.1);
  }
}

/* 空状态 / 加载中 */
.empty-state,
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 80px 20px;
  color: $text-muted;

  p {
    margin: 0;
    font-size: 14px;
    color: $text-secondary;
  }

  span {
    font-size: 12px;
  }
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 详情抽屉 — 加宽到 860px */
.detail-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: flex-end;
}

.detail-drawer {
  width: min(860px, calc(100vw - 48px));
  height: 100%;
  background: rgba(18, 20, 26, 0.98);
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: -16px 0 48px rgba(0, 0, 0, 0.4);
}

/* 抽屉内容区可滚动：头部固定吸顶，内容区 flex:1 + min-height:0 + overflow-y:auto 整体滚动。
   旧实现 .detail-drawer > &... 是无效选择器（& 在顶层为空），导致内容超出视口被
   overflow:hidden 裁剪，图片预览与 JSON 段落看不到。现改为独立 .drawer-content 容器。 */
.drawer-content {
  flex: 1;
  min-height: 0; /* flex 子项允许收缩，overflow 才能生效（默认 min-height:auto 会撑开） */
  overflow-y: auto;
  overflow-x: hidden;
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.drawer-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.drawer-time {
  font-size: 12px;
  color: $text-muted;
}

.drawer-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: $text-secondary;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    color: $text-primary;
  }
}

/* 摘要信息 — 3列网格 */
.drawer-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px 16px;
  padding: 14px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.summary-item {
  display: flex;
  gap: 8px;
  font-size: 13px;
}

.summary-label {
  color: $text-muted;
  flex-shrink: 0;
}

.summary-value {
  color: $text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &--mono {
    font-family: 'SF Mono', 'Fira Code', 'Menlo', monospace;
    font-size: 11px;
  }

  &.len-warn {
    color: #f59e0b;
    font-weight: 500;
  }
}

/* 完整提示词区 */
.prompt-section {
  padding: 14px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.prompt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.prompt-label {
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
}

.prompt-body {
  margin: 0;
  padding: 12px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  font-family: 'SF Mono', 'Fira Code', 'Menlo', monospace;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.8);
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 生成结果预览区 */
.result-preview-section {
  padding: 14px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.preview-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
}

.preview-count-label {
  font-size: 11px;
  font-weight: 400;
  color: $text-muted;
}

.preview-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preview-item {
  border-radius: 3px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);

  img {
    display: block;
    max-width: 200px;
    max-height: 200px;
    object-fit: contain;
    background: rgba(0, 0, 0, 0.3);
  }

  video {
    display: block;
    max-width: 280px;
    max-height: 200px;
  }

  &--video {
    padding: 0;
  }
}

/* 错误详情 */
.error-detail {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 12px 20px;
  background: rgba(255, 107, 107, 0.08);
  border-bottom: 1px solid rgba(255, 107, 107, 0.15);
  color: rgba(255, 167, 167, 0.9);
  font-size: 13px;
  line-height: 1.6;
  flex-shrink: 0;
}

.drawer-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 40px 20px;
  justify-content: center;
  color: $text-muted;
  font-size: 13px;
}

/* JSON 区块 */
.json-section {
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  cursor: pointer;
  transition: background 0.12s;

  &:hover {
    background: rgba(255, 255, 255, 0.02);
  }
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.section-arrow {
  font-size: 10px;
  color: $text-muted;
  transition: transform 0.15s;
  flex-shrink: 0;

  &.expanded {
    transform: rotate(90deg);
  }
}

.section-name {
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
  flex-shrink: 0;
}

.section-desc {
  font-size: 11px;
  color: $text-muted;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  background: transparent;
  color: $text-muted;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;

  &:hover {
    color: $text-primary;
    border-color: rgba(255, 255, 255, 0.14);
  }
}

.section-body {
  padding: 0 20px 14px;
}

.json-viewer {
  margin: 0;
  padding: 12px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  font-family: 'SF Mono', 'Fira Code', 'Menlo', monospace;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.8);
  overflow-x: auto;
  max-height: 500px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.json-empty {
  padding: 8px 0;
  font-size: 12px;
  color: $text-muted;
}

/* JSON 语法高亮颜色 */
:deep(.json-key) {
  color: #7dd3fc;
}

:deep(.json-string) {
  color: #86efac;
}

:deep(.json-number) {
  color: #fcd34d;
}

:deep(.json-boolean) {
  color: #f0abfc;
}

:deep(.json-null) {
  color: $text-muted;
}
</style>
