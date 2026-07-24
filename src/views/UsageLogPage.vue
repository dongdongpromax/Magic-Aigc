<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, RefreshCw, Trash2, X, Copy, Check, AlertCircle, CheckCircle2 } from 'lucide-vue-next'
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
  return prompt.length > 40 ? prompt.slice(0, 40) + '...' : prompt
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
            <th class="col-time">时间</th>
            <th class="col-type">类型</th>
            <th class="col-model">模型</th>
            <th class="col-provider">中转站</th>
            <th class="col-prompt">提示词</th>
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
            <td class="col-time">{{ formatTime(log.createdAt) }}</td>
            <td class="col-type">
              <span class="type-tag" :class="log.type">{{ log.type === 'image' ? '图像' : '视频' }}</span>
            </td>
            <td class="col-model">{{ log.model || '-' }}</td>
            <td class="col-provider">{{ log.providerName || '-' }}</td>
            <td class="col-prompt">{{ truncatePrompt(log.prompt) }}</td>
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
            <div class="summary-item" v-if="selectedLog.topicId">
              <span class="summary-label">主题</span>
              <span class="summary-value">{{ selectedLog.topicId }}</span>
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

.col-time {
  white-space: nowrap;
  color: $text-secondary;
  font-size: 12px;
}

.col-model,
.col-provider {
  color: $text-secondary;
}

.col-prompt {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: $text-secondary;
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

/* 详情抽屉 */
.detail-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: flex-end;
}

.detail-drawer {
  width: min(640px, calc(100vw - 48px));
  height: 100%;
  background: rgba(18, 20, 26, 0.98);
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: -16px 0 48px rgba(0, 0, 0, 0.4);
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

/* 摘要信息 */
.drawer-summary {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
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
  max-height: 400px;
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
