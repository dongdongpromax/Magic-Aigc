<script setup>
import { computed, ref, watch } from 'vue'
import { AlertCircle, Upload, X, Loader2, FileVideo, FileImage, FileAudio, FileText } from 'lucide-vue-next'
import {
  createPrompt,
  updatePrompt,
  uploadPromptAssets,
} from '@/services/promptApi'

/**
 * 提示词新增/编辑弹窗
 *
 * - 编辑模式：传入 prompt 对象，预填表单，保存调 updatePrompt
 * - 新增模式：prompt 为 null，保存调 createPrompt
 * - 素材上传：多文件（图片/视频/音频），上传后显示缩略图列表，可单删（仅从前端移除，不删后端文件）
 * - 标签：输入回车添加，点击 × 删除
 * - 保存即生效（遵循项目设置即保存的约定），成功后 emit saved 并关闭
 *
 * props.prompt 接口：{ id, title, content, type, tags, assets, notes }
 */

const props = defineProps({
  show: { type: Boolean, default: false },
  /** 编辑模式时传入已有提示词；新增模式传 null */
  prompt: { type: Object, default: null },
})
const emit = defineEmits(['update:show', 'saved'])

// 表单字段
const title = ref('')
const content = ref('')
const type = ref('image')
const tags = ref([])
const tagInput = ref('')
const assets = ref([])
const notes = ref('')

// 上传中 / 保存中状态
const isUploading = ref(false)
const isSaving = ref(false)
const errorMsg = ref('')

// 类型选项
const typeOptions = [
  { value: 'image', label: '图片', icon: FileImage },
  { value: 'video', label: '视频', icon: FileVideo },
  { value: 'audio', label: '音频', icon: FileAudio },
  { value: 'text', label: '文本', icon: FileText },
]

/** 是否编辑模式 */
const isEdit = computed(() => Boolean(props.prompt?.id))

/** 弹窗标题 */
const modalTitle = computed(() => (isEdit.value ? '编辑提示词' : '新增提示词'))

/**
 * 打开弹窗时按 prompt 预填表单（新增模式重置为默认值）
 * 用 watch show 而非 watch prompt：避免外部对象变更触发不必要重填
 */
watch(
  () => props.show,
  (show) => {
    if (!show) return
    errorMsg.value = ''
    if (props.prompt) {
      title.value = props.prompt.title || ''
      content.value = props.prompt.content || ''
      type.value = props.prompt.type || 'image'
      tags.value = [...(props.prompt.tags || [])]
      assets.value = (props.prompt.assets || []).map((a) => ({ ...a }))
      notes.value = props.prompt.notes || ''
    } else {
      title.value = ''
      content.value = ''
      type.value = 'image'
      tags.value = []
      assets.value = []
      notes.value = ''
    }
    tagInput.value = ''
  },
)

/** 关闭弹窗 */
function handleClose() {
  emit('update:show', false)
}

/**
 * 添加标签：回车或失焦时把当前输入加入标签数组（去重、去空）
 */
function addTag() {
  const value = tagInput.value.trim()
  if (!value) return
  if (tags.value.includes(value)) {
    tagInput.value = ''
    return
  }
  tags.value.push(value)
  tagInput.value = ''
}

/** 删除指定标签 */
function removeTag(index) {
  tags.value.splice(index, 1)
}

/** 标签输入回车拦截：添加标签而非换行 */
function handleTagKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault()
    addTag()
  } else if (event.key === 'Backspace' && !tagInput.value && tags.value.length) {
    // 空输入时退格删除最后一个标签
    tags.value.pop()
  }
}

/**
 * 选择文件后上传到后端，把返回的素材元数据追加到 assets
 * 上传中禁用保存按钮，失败时记录错误但保留已选文件不让用户丢失
 */
async function handleAssetUpload(event) {
  const files = Array.from(event.target?.files || [])
  event.target.value = ''
  if (!files.length) return

  isUploading.value = true
  errorMsg.value = ''
  try {
    const items = await uploadPromptAssets(files)
    assets.value.push(...items)
  } catch (err) {
    errorMsg.value = `素材上传失败：${err?.response?.data?.message || err?.message || ''}`
  } finally {
    isUploading.value = false
  }
}

/** 从素材列表移除指定项（仅前端移除，不删后端文件，保存时以最新 assets 为准） */
function removeAsset(index) {
  assets.value.splice(index, 1)
}

/** 素材 kind → 图标组件映射 */
function assetIcon(kind) {
  if (kind === 'video') return FileVideo
  if (kind === 'audio') return FileAudio
  if (kind === 'image') return FileImage
  return FileText
}

/**
 * 保存提示词：校验 → 调 create/update → emit saved → 关闭
 * 校验失败 / 保存失败时不关闭弹窗，让用户修正
 */
async function handleSave() {
  if (isSaving.value || isUploading.value) return

  if (!title.value.trim()) {
    errorMsg.value = '请填写标题'
    return
  }
  if (!content.value.trim()) {
    errorMsg.value = '请填写提示词正文'
    return
  }

  const payload = {
    title: title.value.trim(),
    content: content.value.trim(),
    type: type.value,
    tags: [...tags.value],
    assets: assets.value.map(({ url, mimeType, kind, name }) => ({ url, mimeType, kind, name })),
    notes: notes.value.trim() || undefined,
  }

  isSaving.value = true
  errorMsg.value = ''
  try {
    const result = isEdit.value
      ? await updatePrompt(props.prompt.id, payload)
      : await createPrompt(payload)
    emit('saved', result)
    emit('update:show', false)
  } catch (err) {
    errorMsg.value = `保存失败：${err?.response?.data?.message || err?.message || ''}`
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="modal-overlay" @click.self="handleClose">
      <div class="modal-card" role="dialog" aria-modal="true">
        <!-- 头部 -->
        <div class="modal-header">
          <h3 class="modal-title">{{ modalTitle }}</h3>
          <button class="modal-close" type="button" @click="handleClose">
            <X :size="18" />
          </button>
        </div>

        <!-- 可滚动内容区 -->
        <div class="modal-body">
          <!-- 标题 -->
          <div class="field">
            <label class="field-label">标题<em>*</em></label>
            <input
              v-model="title"
              type="text"
              class="field-input"
              placeholder="给这条提示词起个名字"
              maxlength="200"
            />
          </div>

          <!-- 类型 -->
          <div class="field">
            <label class="field-label">类型<em>*</em></label>
            <div class="type-group">
              <button
                v-for="opt in typeOptions"
                :key="opt.value"
                type="button"
                class="type-btn"
                :class="{ active: type === opt.value }"
                @click="type = opt.value"
              >
                <component :is="opt.icon" :size="14" />
                <span>{{ opt.label }}</span>
              </button>
            </div>
          </div>

          <!-- 标签 -->
          <div class="field">
            <label class="field-label">标签</label>
            <div class="tag-box">
              <span v-for="(tag, idx) in tags" :key="tag" class="tag-chip">
                {{ tag }}
                <button type="button" class="tag-remove" @click="removeTag(idx)">×</button>
              </span>
              <input
                v-model="tagInput"
                type="text"
                class="tag-input"
                placeholder="输入标签后回车添加"
                @keydown="handleTagKeydown"
                @blur="addTag"
              />
            </div>
          </div>

          <!-- 提示词正文 -->
          <div class="field">
            <label class="field-label">提示词正文<em>*</em></label>
            <textarea
              v-model="content"
              class="field-textarea"
              rows="6"
              placeholder="粘贴或编写完整的提示词内容"
            ></textarea>
          </div>

          <!-- 效果素材 -->
          <div class="field">
            <label class="field-label">
              效果素材
              <span class="field-hint">支持图片 / 视频 / 音频，可选</span>
            </label>
            <div class="asset-area">
              <div v-if="assets.length" class="asset-grid">
                <div v-for="(asset, idx) in assets" :key="idx" class="asset-item">
                  <img
                    v-if="asset.kind === 'image'"
                    :src="asset.url"
                    :alt="asset.name"
                    class="asset-thumb"
                  />
                  <div v-else class="asset-thumb asset-thumb--media">
                    <component :is="assetIcon(asset.kind)" :size="20" />
                    <span class="asset-ext">{{ asset.name?.split('.').pop() || asset.kind }}</span>
                  </div>
                  <span class="asset-name" :title="asset.name">{{ asset.name }}</span>
                  <button type="button" class="asset-remove" @click="removeAsset(idx)">
                    <X :size="12" />
                  </button>
                </div>
              </div>
              <label class="asset-upload" :class="{ disabled: isUploading }">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg"
                  multiple
                  :disabled="isUploading"
                  @change="handleAssetUpload"
                />
                <Loader2 v-if="isUploading" :size="14" class="spinning" />
                <Upload v-else :size="14" />
                <span>{{ isUploading ? '上传中...' : '添加素材' }}</span>
              </label>
            </div>
          </div>

          <!-- 备注 -->
          <div class="field">
            <label class="field-label">备注</label>
            <textarea
              v-model="notes"
              class="field-textarea field-textarea--short"
              rows="2"
              placeholder="记录使用场景、参数建议等（可选）"
            ></textarea>
          </div>

          <!-- 错误提示 -->
          <div v-if="errorMsg" class="error-banner">
            <AlertCircle :size="14" />
            <span>{{ errorMsg }}</span>
          </div>
        </div>

        <!-- 底部操作 -->
        <div class="modal-footer">
          <button type="button" class="footer-btn footer-btn--cancel" @click="handleClose">取消</button>
          <button
            type="button"
            class="footer-btn footer-btn--ok"
            :disabled="isSaving || isUploading"
            @click="handleSave"
          >
            <Loader2 v-if="isSaving" :size="14" class="spinning" />
            <span>{{ isSaving ? '保存中...' : '保存' }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
@import '@/styles/variables.scss';

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1500;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-card {
  width: min(640px, calc(100vw - 48px));
  max-height: calc(100vh - 64px);
  background: rgba(20, 22, 28, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.modal-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: $text-primary;
}

.modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
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

.modal-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  font-weight: 500;
  color: $text-secondary;

  em {
    color: #ff6b6b;
    font-style: normal;
    margin-left: 2px;
  }

  .field-hint {
    margin-left: 6px;
    font-weight: 400;
    color: $text-muted;
  }
}

.field-input,
.field-textarea {
  width: 100%;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  color: $text-primary;
  font-size: 13px;
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

.field-textarea {
  resize: vertical;
  min-height: 80px;
  line-height: 1.6;

  &--short {
    min-height: 48px;
  }
}

/* 类型分段 */
.type-group {
  display: flex;
  gap: 3px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  padding: 3px;
}

.type-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 8px;
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

/* 标签输入 */
.tag-box {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  min-height: 34px;
  align-items: center;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: rgba(119, 168, 255, 0.12);
  border: 1px solid rgba(119, 168, 255, 0.25);
  border-radius: 3px;
  color: rgba(147, 197, 253, 0.95);
  font-size: 11px;
  line-height: 1.4;
}

.tag-remove {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  padding: 0;
  opacity: 0.7;

  &:hover {
    opacity: 1;
  }
}

.tag-input {
  flex: 1;
  min-width: 120px;
  border: none;
  background: transparent;
  color: $text-primary;
  font-size: 12px;
  font-family: inherit;
  outline: none;
  padding: 2px 0;

  &::placeholder {
    color: $text-muted;
  }
}

/* 素材区 */
.asset-area {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
}

.asset-item {
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.02);
}

.asset-thumb {
  display: block;
  width: 100%;
  height: 72px;
  object-fit: cover;
  background: rgba(0, 0, 0, 0.3);

  &--media {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 10px;
  }
}

.asset-ext {
  text-transform: uppercase;
  font-size: 10px;
}

.asset-name {
  display: block;
  padding: 4px 6px;
  font-size: 11px;
  color: $text-secondary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.asset-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.7);
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: rgba(255, 107, 107, 0.85);
    color: #fff;
  }
}

.asset-upload {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px dashed rgba(255, 255, 255, 0.18);
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.02);
  color: $text-secondary;
  font-size: 12px;
  cursor: pointer;
  align-self: flex-start;
  position: relative;
  transition: all 0.15s;

  input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  &:hover:not(.disabled) {
    border-color: rgba(255, 255, 255, 0.3);
    color: $text-primary;
  }

  &.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

/* 错误提示 */
.error-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 3px;
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid rgba(255, 107, 107, 0.2);
  color: rgba(255, 167, 167, 0.9);
  font-size: 12px;
}

/* 底部操作 */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.footer-btn {
  padding: 7px 16px;
  border-radius: 3px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: $text-secondary;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 6px;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    color: $text-primary;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.footer-btn--ok {
  background: rgba(59, 130, 246, 0.16);
  border-color: rgba(59, 130, 246, 0.4);
  color: rgba(147, 197, 253, 0.95);

  &:hover:not(:disabled) {
    background: rgba(59, 130, 246, 0.26);
    color: #fff;
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
</style>
