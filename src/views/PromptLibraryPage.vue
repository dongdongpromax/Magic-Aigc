<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NSelect } from 'naive-ui'
import {
  ArrowLeft,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Copy,
  Pencil,
  Eye,
  Sparkles,
  FileVideo,
  FileImage,
  FileAudio,
  FileText,
  AlertCircle,
  Check,
} from 'lucide-vue-next'
import { listPrompts, deletePrompt } from '@/services/promptApi'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import PromptEditModal from '@/components/prompts/PromptEditModal.vue'
import PromptDetailDrawer from '@/components/prompts/PromptDetailDrawer.vue'

const router = useRouter()

// 列表数据
const prompts = ref([])
// 加载状态
const isLoading = ref(false)
const errorMsg = ref('')

// 筛选项
const filterType = ref('')
const filterTag = ref(null)
const keyword = ref('')

// 编辑弹窗
const editModalShow = ref(false)
const editingPrompt = ref(null)

// 详情抽屉
const detailDrawerShow = ref(false)
const detailPrompt = ref(null)

// 删除确认
const deleteConfirmShow = ref(false)
const deletingPrompt = ref(null)

// 复制反馈：记录已复制卡片 id
const copiedId = ref('')

// 类型 tab 选项
const typeTabs = [
  { value: '', label: '全部' },
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' },
  { value: 'text', label: '文本' },
]

// 类型 → 图标 / 标签 / 徽标颜色
const typeMeta = {
  image: { icon: FileImage, label: '图片' },
  video: { icon: FileVideo, label: '视频' },
  audio: { icon: FileAudio, label: '音频' },
  text: { icon: FileText, label: '文本' },
}

/**
 * 从所有提示词收集去重标签，生成下拉选项
 * 每项 value/label 同为标签字符串，便于回显
 */
const tagOptions = computed(() => {
  const set = new Set()
  for (const p of prompts.value) {
    for (const t of p.tags || []) set.add(t)
  }
  return [...set].sort().map((t) => ({ label: t, value: t }))
})

/**
 * 加载提示词列表
 * 把当前筛选项透传给后端，加载失败显示错误条
 */
async function fetchPrompts() {
  isLoading.value = true
  errorMsg.value = ''
  try {
    prompts.value = await listPrompts({
      type: filterType.value || undefined,
      tag: filterTag.value || undefined,
      keyword: keyword.value.trim() || undefined,
    })
  } catch (err) {
    errorMsg.value = `加载失败：${err?.response?.data?.message || err?.message || ''}`
  } finally {
    isLoading.value = false
  }
}

/**
 * 切换类型 tab：更新筛选并重新加载
 * @param {string} value 类型值（空字符串表示全部）
 */
function handleTypeChange(value) {
  filterType.value = value
  fetchPrompts()
}

/** 标签下拉变化时重新加载 */
function handleTagChange(value) {
  filterTag.value = value || null
  fetchPrompts()
}

/** 关键词搜索：输入即触发（带 trim） */
function handleKeywordInput() {
  fetchPrompts()
}

/** 新增提示词：打开弹窗，editingPrompt 置空表示新增模式 */
function handleCreate() {
  editingPrompt.value = null
  editModalShow.value = true
}

/**
 * 点击卡片预览：打开详情抽屉
 * @param {object} prompt 提示词对象
 */
function handlePreview(prompt) {
  detailPrompt.value = prompt
  detailDrawerShow.value = true
}

/**
 * 从详情抽屉触发编辑：关闭抽屉，打开编辑弹窗
 * @param {object} prompt 待编辑提示词
 */
function handleEditFromDrawer(prompt) {
  detailDrawerShow.value = false
  editingPrompt.value = prompt
  editModalShow.value = true
}

/**
 * 卡片上的编辑按钮：直接打开编辑弹窗
 * @param {object} prompt 待编辑提示词
 */
function handleEdit(prompt) {
  editingPrompt.value = prompt
  editModalShow.value = true
}

/**
 * 编辑弹窗保存成功后：用返回值更新列表对应项（新增则 unshift 到头部）
 * @param {object} saved 保存后的提示词详情
 */
function handleSaved(saved) {
  const idx = prompts.value.findIndex((p) => p.id === saved.id)
  if (idx >= 0) {
    prompts.value[idx] = saved
  } else {
    prompts.value.unshift(saved)
  }
}

/**
 * 点击删除：弹出确认弹窗
 * @param {object} prompt 待删除提示词
 */
function handleDelete(prompt) {
  deletingPrompt.value = prompt
  deleteConfirmShow.value = true
}

/** 确认删除：调后端删除，从列表移除 */
async function handleConfirmDelete() {
  const prompt = deletingPrompt.value
  deleteConfirmShow.value = false
  if (!prompt) return
  try {
    await deletePrompt(prompt.id)
    prompts.value = prompts.value.filter((p) => p.id !== prompt.id)
    if (detailPrompt.value?.id === prompt.id) {
      detailDrawerShow.value = false
    }
  } catch (err) {
    errorMsg.value = `删除失败：${err?.response?.data?.message || err?.message || ''}`
  } finally {
    deletingPrompt.value = null
  }
}

/**
 * 复制提示词正文到剪贴板
 * @param {object} prompt 提示词对象
 */
async function handleCopy(prompt) {
  if (!prompt.content) return
  try {
    await navigator.clipboard.writeText(prompt.content)
    copiedId.value = prompt.id
    setTimeout(() => {
      copiedId.value = ''
    }, 1500)
  } catch {
    // 剪贴板可能被浏览器拦截，静默失败
  }
}

/**
 * 一键使用：跳转到聊天页并携带 promptId
 * ChatArea onMounted 检测 query.promptId 后填充 draft.prompt 并按类型选模型
 * @param {object} prompt 提示词对象
 */
function handleUse(prompt) {
  router.push({ path: '/chat', query: { promptId: prompt.id } })
}

/** 返回门户首页 */
function handleBack() {
  router.push('/')
}

/**
 * 取提示词首个素材作为卡片缩略图
 * @param {object} prompt
 * @returns {object|null} 首个素材对象
 */
function cardThumb(prompt) {
  return prompt.assets?.[0] || null
}

/**
 * 提示词摘要（前 80 字 + 省略号）
 * @param {string} content
 * @returns {string}
 */
function summary(content) {
  if (!content) return ''
  return content.length > 80 ? content.slice(0, 80) + '...' : content
}

onMounted(() => {
  fetchPrompts()
})
</script>

<template>
  <div class="prompt-page">
    <!-- 顶部操作栏 -->
    <div class="page-header">
      <button class="back-btn" type="button" @click="handleBack">
        <ArrowLeft :size="16" />
        <span>返回首页</span>
      </button>
      <h1 class="page-title">提示词库</h1>
      <div class="header-actions">
        <button class="header-btn" type="button" :disabled="isLoading" @click="fetchPrompts">
          <RefreshCw :size="14" :class="{ spinning: isLoading }" />
          <span>刷新</span>
        </button>
        <button class="header-btn header-btn--primary" type="button" @click="handleCreate">
          <Plus :size="14" />
          <span>新增提示词</span>
        </button>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <div class="type-tabs">
        <button
          v-for="tab in typeTabs"
          :key="tab.value"
          type="button"
          class="type-tab"
          :class="{ active: filterType === tab.value }"
          @click="handleTypeChange(tab.value)"
        >
          {{ tab.label }}
        </button>
      </div>
      <div class="filter-controls">
        <n-select
          :value="filterTag"
          :options="tagOptions"
          placeholder="按标签筛选"
          clearable
          size="small"
          class="tag-select"
          @update:value="handleTagChange"
        />
        <div class="search-box">
          <Search :size="14" class="search-icon" />
          <input
            v-model="keyword"
            type="text"
            class="search-input"
            placeholder="搜索标题或正文"
            @input="handleKeywordInput"
          />
        </div>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="errorMsg" class="error-banner">
      <AlertCircle :size="14" />
      <span>{{ errorMsg }}</span>
    </div>

    <!-- 卡片网格 -->
    <div class="card-container">
      <div v-if="prompts.length" class="card-grid">
        <div v-for="prompt in prompts" :key="prompt.id" class="prompt-card">
          <!-- 缩略图区 -->
          <div class="card-cover" @click="handlePreview(prompt)">
            <img
              v-if="cardThumb(prompt)?.kind === 'image'"
              :src="cardThumb(prompt).url"
              :alt="prompt.title"
              class="cover-img"
              loading="lazy"
            />
            <div v-else-if="cardThumb(prompt)" class="cover-media">
              <component :is="typeMeta[cardThumb(prompt).kind]?.icon || FileText" :size="28" />
              <span class="cover-ext">{{ cardThumb(prompt).name?.split('.').pop() || '' }}</span>
            </div>
            <div v-else class="cover-empty">
              <component :is="typeMeta[prompt.type]?.icon || FileText" :size="28" />
            </div>
            <!-- 类型徽标 -->
            <span class="card-type" :class="prompt.type">
              <component :is="typeMeta[prompt.type]?.icon || FileText" :size="11" />
              <span>{{ typeMeta[prompt.type]?.label || '未知' }}</span>
            </span>
          </div>

          <!-- 内容区 -->
          <div class="card-body">
            <h3 class="card-title" :title="prompt.title" @click="handlePreview(prompt)">
              {{ prompt.title }}
            </h3>
            <p class="card-summary">{{ summary(prompt.content) }}</p>
            <div v-if="prompt.tags?.length" class="card-tags">
              <span v-for="tag in prompt.tags.slice(0, 4)" :key="tag" class="card-tag">{{ tag }}</span>
              <span v-if="prompt.tags.length > 4" class="card-tag card-tag--more">+{{ prompt.tags.length - 4 }}</span>
            </div>
          </div>

          <!-- 卡片操作 -->
          <div class="card-actions">
            <button class="action-btn" type="button" title="预览" @click="handlePreview(prompt)">
              <Eye :size="14" />
            </button>
            <button class="action-btn" type="button" title="复制提示词" @click="handleCopy(prompt)">
              <component :is="copiedId === prompt.id ? Check : Copy" :size="14" />
            </button>
            <button class="action-btn" type="button" title="编辑" @click="handleEdit(prompt)">
              <Pencil :size="14" />
            </button>
            <button class="action-btn action-btn--danger" type="button" title="删除" @click="handleDelete(prompt)">
              <Trash2 :size="14" />
            </button>
            <button class="action-btn action-btn--use" type="button" title="一键使用" @click="handleUse(prompt)">
              <Sparkles :size="14" />
              <span>使用</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else-if="!isLoading" class="empty-state">
        <AlertCircle :size="32" />
        <p>暂无提示词</p>
        <span>点击「新增提示词」创建你的第一条提示词</span>
      </div>

      <!-- 加载中 -->
      <div v-else class="loading-state">
        <RefreshCw :size="24" class="spinning" />
        <p>加载中...</p>
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <PromptEditModal
      v-model:show="editModalShow"
      :prompt="editingPrompt"
      @saved="handleSaved"
    />

    <!-- 详情抽屉 -->
    <PromptDetailDrawer
      v-model:show="detailDrawerShow"
      :prompt="detailPrompt"
      @edit="handleEditFromDrawer"
      @use="handleUse"
    />

    <!-- 删除确认 -->
    <ConfirmDialog
      v-model:show="deleteConfirmShow"
      title="确定删除该提示词？"
      :content="deletingPrompt ? `将删除「${deletingPrompt.title}」及其效果素材，且不可恢复。` : ''"
      confirm-text="删除"
      danger
      @confirm="handleConfirmDelete"
    />
  </div>
</template>

<style lang="scss" scoped>
@import '@/styles/variables.scss';

.prompt-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  z-index: 1;
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

  &--primary {
    background: rgba(59, 130, 246, 0.16);
    border-color: rgba(59, 130, 246, 0.4);
    color: rgba(147, 197, 253, 0.95);

    &:hover:not(:disabled) {
      background: rgba(59, 130, 246, 0.26);
      color: #fff;
    }
  }
}

/* 筛选栏 */
.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px clamp(20px, 4vw, 48px) 0;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.type-tabs {
  display: flex;
  gap: 3px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  padding: 3px;
}

.type-tab {
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

.filter-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tag-select {
  min-width: 160px;
  max-width: 220px;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 10px;
  color: $text-muted;
  pointer-events: none;
}

.search-input {
  width: 200px;
  padding: 6px 10px 6px 30px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  color: $text-primary;
  font-size: 12px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;

  &:focus {
    border-color: rgba(119, 168, 255, 0.5);
  }

  &::placeholder {
    color: $text-muted;
  }
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

/* 卡片容器 */
.card-container {
  flex: 1;
  overflow: auto;
  padding: 12px clamp(20px, 4vw, 48px) 20px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}

.prompt-card {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  background: rgba(18, 22, 28, 0.6);
  overflow: hidden;
  transition: border-color 0.2s;

  &:hover {
    border-color: rgba(119, 168, 255, 0.25);
  }
}

/* 缩略图区 */
.card-cover {
  position: relative;
  width: 100%;
  height: 140px;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-media {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 10px;

  .cover-ext {
    text-transform: uppercase;
  }
}

.cover-empty {
  color: rgba(255, 255, 255, 0.2);
}

.card-type {
  position: absolute;
  top: 8px;
  left: 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);

  &.image {
    color: rgba(147, 197, 253, 0.95);
  }
  &.video {
    color: rgba(255, 183, 148, 0.95);
  }
  &.audio {
    color: rgba(216, 180, 254, 0.95);
  }
  &.text {
    color: rgba(255, 255, 255, 0.7);
  }
}

/* 内容区 */
.card-body {
  flex: 1;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
}

.card-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: $text-primary;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &:hover {
    color: rgba(147, 197, 253, 0.95);
  }
}

.card-summary {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: $text-secondary;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}

.card-tag {
  padding: 1px 6px;
  background: rgba(119, 168, 255, 0.1);
  border: 1px solid rgba(119, 168, 255, 0.2);
  border-radius: 3px;
  color: rgba(147, 197, 253, 0.85);
  font-size: 10px;
  line-height: 1.4;

  &--more {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.1);
    color: $text-muted;
  }
}

/* 卡片操作 */
.card-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  color: $text-muted;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
    color: $text-primary;
  }

  &--danger:hover {
    color: #ff6b6b;
    background: rgba(255, 107, 107, 0.1);
  }

  &--use {
    margin-left: auto;
    padding: 5px 10px;
    background: rgba(59, 130, 246, 0.14);
    border-color: rgba(59, 130, 246, 0.3);
    color: rgba(147, 197, 253, 0.9);

    &:hover {
      background: rgba(59, 130, 246, 0.24);
      color: #fff;
    }
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

/* naive-ui 下拉深色适配 */
.tag-select:deep(.n-base-selection) {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  box-shadow: none;
}

.tag-select:deep(.n-base-selection-label),
.tag-select:deep(.n-base-selection-placeholder) {
  color: $text-primary;
  font-size: 12px;
}

.tag-select:deep(.n-base-selection .n-base-selection-arrow) {
  color: rgba(255, 255, 255, 0.4);
}
</style>
