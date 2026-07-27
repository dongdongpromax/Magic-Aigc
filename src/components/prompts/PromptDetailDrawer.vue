<script setup>
import { computed, ref, watch } from 'vue'
import {
  X,
  Copy,
  Check,
  Pencil,
  Sparkles,
  FileVideo,
  FileImage,
  FileAudio,
  FileText,
  Tag,
} from 'lucide-vue-next'

/**
 * 提示词详情抽屉
 *
 * - 完整展示提示词正文、效果素材（按 mimeType 路由 img/video/audio）、标签、备注
 * - 底部操作：复制提示词（navigator.clipboard + 1.5s 已复制反馈）、一键使用（emit use）
 * - 编辑入口：emit edit，由父组件打开 PromptEditModal
 *
 * props.prompt 接口：{ id, title, content, type, tags, assets, notes, createdAt, updatedAt }
 */

const props = defineProps({
  show: { type: Boolean, default: false },
  prompt: { type: Object, default: null },
})
const emit = defineEmits(['update:show', 'edit', 'use'])

const copied = ref(false)

/** 类型 → 中文标签映射 */
const typeLabels = {
  video: '视频',
  image: '图片',
  audio: '音频',
  text: '文本',
}

/** 类型 → 图标组件映射 */
const typeIcons = {
  video: FileVideo,
  image: FileImage,
  audio: FileAudio,
  text: FileText,
}

/** 当前提示词的类型徽标信息 */
const typeMeta = computed(() => ({
  label: typeLabels[props.prompt?.type] || '未知',
  icon: typeIcons[props.prompt?.type] || FileText,
}))

/** 提示词摘要（前 80 字，用于预览，详情抽屉里其实展示全文，此函数备用） */
function summary(text, len = 80) {
  if (!text) return ''
  return text.length > len ? text.slice(0, len) + '...' : text
}

/**
 * 格式化时间戳为中文日期时间
 * @param {number} ts 毫秒时间戳
 * @returns {string}
 */
function formatTime(ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 关闭抽屉 */
function handleClose() {
  emit('update:show', false)
}

/** 触发编辑 */
function handleEdit() {
  emit('edit', props.prompt)
}

/** 触发一键使用 */
function handleUse() {
  emit('use', props.prompt)
}

/**
 * 复制提示词正文到剪贴板
 * 复制后 1.5s 显示「已复制」反馈
 */
async function handleCopy() {
  if (!props.prompt?.content) return
  try {
    await navigator.clipboard.writeText(props.prompt.content)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 1500)
  } catch {
    // 剪贴板可能被浏览器拦截，静默失败
  }
}

// 抽屉关闭时重置复制态
watch(
  () => props.show,
  (show) => {
    if (!show) copied.value = false
  },
)
</script>

<template>
  <Teleport to="body">
    <div v-if="show && prompt" class="drawer-overlay" @click.self="handleClose">
      <div class="drawer">
        <!-- 头部 -->
        <div class="drawer-header">
          <div class="drawer-title">
            <span class="type-badge" :class="prompt.type">
              <component :is="typeMeta.icon" :size="12" />
              <span>{{ typeMeta.label }}</span>
            </span>
            <span class="drawer-name">{{ prompt.title }}</span>
          </div>
          <button class="drawer-close" type="button" @click="handleClose">
            <X :size="18" />
          </button>
        </div>

        <!-- 可滚动内容 -->
        <div class="drawer-content">
          <!-- 摘要信息 -->
          <div class="summary-row">
            <div class="summary-item">
              <span class="summary-label">创建时间</span>
              <span class="summary-value">{{ formatTime(prompt.createdAt) }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">更新时间</span>
              <span class="summary-value">{{ formatTime(prompt.updatedAt) }}</span>
            </div>
            <div class="summary-item" v-if="prompt.assets?.length">
              <span class="summary-label">素材</span>
              <span class="summary-value">{{ prompt.assets.length }} 个</span>
            </div>
          </div>

          <!-- 标签 -->
          <div v-if="prompt.tags?.length" class="section">
            <div class="section-title">
              <Tag :size="13" />
              <span>标签</span>
            </div>
            <div class="tag-list">
              <span v-for="tag in prompt.tags" :key="tag" class="tag-chip">{{ tag }}</span>
            </div>
          </div>

          <!-- 提示词正文 -->
          <div class="section">
            <div class="section-title">
              <span>提示词正文</span>
              <button class="copy-btn" type="button" @click="handleCopy">
                <component :is="copied ? Check : Copy" :size="13" />
                <span>{{ copied ? '已复制' : '复制' }}</span>
              </button>
            </div>
            <pre class="prompt-body">{{ prompt.content }}</pre>
          </div>

          <!-- 效果素材 -->
          <div v-if="prompt.assets?.length" class="section">
            <div class="section-title">
              <span>效果素材</span>
              <span class="section-count">{{ prompt.assets.length }} 个</span>
            </div>
            <div class="asset-grid">
              <div v-for="(asset, idx) in prompt.assets" :key="idx" class="asset-item">
                <img
                  v-if="asset.kind === 'image'"
                  :src="asset.url"
                  :alt="asset.name"
                  class="asset-media"
                />
                <video
                  v-else-if="asset.kind === 'video'"
                  :src="asset.url"
                  controls
                  preload="metadata"
                  class="asset-media"
                ></video>
                <audio
                  v-else-if="asset.kind === 'audio'"
                  :src="asset.url"
                  controls
                  class="asset-audio"
                ></audio>
                <div v-else class="asset-media asset-media--file">
                  <FileText :size="24" />
                  <span>{{ asset.name }}</span>
                </div>
                <span class="asset-name" :title="asset.name">{{ asset.name }}</span>
              </div>
            </div>
          </div>

          <!-- 备注 -->
          <div v-if="prompt.notes" class="section">
            <div class="section-title">
              <span>备注</span>
            </div>
            <pre class="notes-body">{{ prompt.notes }}</pre>
          </div>
        </div>

        <!-- 底部操作 -->
        <div class="drawer-footer">
          <button type="button" class="footer-btn footer-btn--copy" @click="handleCopy">
            <component :is="copied ? Check : Copy" :size="14" />
            <span>{{ copied ? '已复制' : '复制提示词' }}</span>
          </button>
          <div class="footer-right">
            <button type="button" class="footer-btn footer-btn--edit" @click="handleEdit">
              <Pencil :size="14" />
              <span>编辑</span>
            </button>
            <button type="button" class="footer-btn footer-btn--use" @click="handleUse">
              <Sparkles :size="14" />
              <span>一键使用</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
@import '@/styles/variables.scss';

.drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: flex-end;
}

.drawer {
  width: min(860px, calc(100vw - 48px));
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
  min-width: 0;
}

.drawer-name {
  font-size: 15px;
  font-weight: 600;
  color: $text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  flex-shrink: 0;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    color: $text-primary;
  }
}

.type-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 500;
  flex-shrink: 0;

  &.image {
    background: rgba(59, 130, 246, 0.15);
    color: rgba(147, 197, 253, 0.9);
  }
  &.video {
    background: rgba(255, 107, 53, 0.15);
    color: rgba(255, 183, 148, 0.9);
  }
  &.audio {
    background: rgba(168, 85, 247, 0.15);
    color: rgba(216, 180, 254, 0.9);
  }
  &.text {
    background: rgba(255, 255, 255, 0.08);
    color: $text-secondary;
  }
}

.drawer-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0;
}

/* 摘要信息 */
.summary-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px 16px;
  padding: 14px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.summary-item {
  display: flex;
  gap: 8px;
  font-size: 12px;
}

.summary-label {
  color: $text-muted;
  flex-shrink: 0;
}

.summary-value {
  color: $text-secondary;
}

/* 区块通用 */
.section {
  padding: 14px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
}

.section-count {
  font-size: 11px;
  font-weight: 400;
  color: $text-muted;
}

/* 标签列表 */
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-chip {
  padding: 3px 10px;
  background: rgba(119, 168, 255, 0.1);
  border: 1px solid rgba(119, 168, 255, 0.22);
  border-radius: 3px;
  color: rgba(147, 197, 253, 0.9);
  font-size: 11px;
}

/* 提示词正文 */
.prompt-body {
  margin: 0;
  padding: 12px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  font-family: 'SF Mono', 'Fira Code', 'Menlo', monospace;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.85);
  max-height: 320px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.copy-btn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  background: transparent;
  color: $text-muted;
  font-size: 11px;
  font-weight: 400;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    color: $text-primary;
    border-color: rgba(255, 255, 255, 0.16);
  }
}

/* 素材网格 */
.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
}

.asset-item {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.2);
}

.asset-media {
  display: block;
  width: 100%;
  max-height: 200px;
  object-fit: contain;
  background: rgba(0, 0, 0, 0.3);

  &--file {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 24px;
    color: $text-muted;
    font-size: 11px;
  }
}

.asset-audio {
  width: 100%;
  height: 40px;
}

.asset-name {
  padding: 6px 8px;
  font-size: 11px;
  color: $text-secondary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}

/* 备注 */
.notes-body {
  margin: 0;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  font-size: 12px;
  line-height: 1.6;
  color: $text-secondary;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 底部操作 */
.drawer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.footer-right {
  display: flex;
  gap: 8px;
}

.footer-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 3px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: $text-secondary;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: $text-primary;
  }
}

.footer-btn--edit {
  &:hover {
    border-color: rgba(119, 168, 255, 0.3);
    color: rgba(147, 197, 253, 0.95);
  }
}

.footer-btn--use {
  background: rgba(59, 130, 246, 0.16);
  border-color: rgba(59, 130, 246, 0.4);
  color: rgba(147, 197, 253, 0.95);

  &:hover {
    background: rgba(59, 130, 246, 0.26);
    color: #fff;
  }
}
</style>
