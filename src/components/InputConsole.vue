<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Expand, Image as ImageIcon, Minimize, Send, Settings2, Sparkles } from 'lucide-vue-next'
import { NSelect } from 'naive-ui'
import { requestImages } from '@/services/imageSession'
import { useChatStore } from '@/store/chat'

const chatStore = useChatStore()
const isLoading = ref(false)
const isExpanded = ref(false)
const isSizePanelVisible = ref(false)
const uploadHint = ref('最多上传 16 张参考图')
const maxReferenceImages = 16

const models = [{ label: 'GPT Image 2', value: 'openai/gpt-image-2' }]

const counts = [1, 2, 3, 4]
const sizeOptions = [
  { label: 'auto', value: 'auto', hint: '自动适配画面比例' },
  { label: '1:1 · 1024×1024', value: '1024x1024', hint: '标准方图' },
  { label: '1:1 · 1536×1536', value: '1536x1536', hint: '高清方图' },
  { label: '4:3 · 1536×1152', value: '1536x1152', hint: '横向构图' },
  { label: '3:4 · 1152×1536', value: '1152x1536', hint: '竖向构图' },
  { label: '3:2 · 1536×1024', value: '1536x1024', hint: '电影横幅' },
  { label: '2:3 · 1024×1536', value: '1024x1536', hint: '海报竖幅' },
  { label: '16:9 · 1536×864', value: '1536x864', hint: '宽屏画面' },
  { label: '9:16 · 864×1536', value: '864x1536', hint: '封面竖屏' },
  { label: '21:9 · 1792×768', value: '1792x768', hint: '超宽场景' },
  { label: '9:21 · 768×1792', value: '768x1792', hint: '超高构图' },
  { label: '2:1 · 1536×768', value: '1536x768', hint: '横幅长景' },
  { label: '1:2 · 768×1536', value: '768x1536', hint: '长竖画幅' },
]
const countOptions = counts.map((count) => ({ label: `${count} 张`, value: count }))

const draft = computed(() => chatStore.currentDraft)
const canSend = computed(() => Boolean(draft.value.prompt.trim()) && !isLoading.value)
const selectedSizeLabel = computed(
  () => sizeOptions.find((item) => item.value === draft.value.size)?.label || draft.value.size,
)

function toggleExpanded() {
  isExpanded.value = !isExpanded.value
}

function selectSize(value) {
  draft.value.size = value
  isSizePanelVisible.value = false
}

function createReferenceId() {
  return (
    globalThis.crypto?.randomUUID?.() || `ref-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('参考图读取失败'))
    reader.readAsDataURL(file)
  })
}

async function handleReferenceUpload(event) {
  const files = Array.from(event.target?.files || [])

  if (!files.length) return

  const currentCount = draft.value.referenceImages?.length || 0
  const remain = maxReferenceImages - currentCount

  if (remain <= 0) {
    uploadHint.value = `最多上传 ${maxReferenceImages} 张参考图`
    event.target.value = ''
    return
  }

  if (files.length > remain) {
    uploadHint.value = `最多上传 ${maxReferenceImages} 张参考图`
  } else {
    uploadHint.value = `已添加 ${currentCount + files.length} / ${maxReferenceImages} 张参考图`
  }

  const acceptedFiles = files.slice(0, remain)
  const parsedFiles = await Promise.all(
    acceptedFiles.map(async (file) => ({
      id: createReferenceId(),
      name: file.name,
      type: file.type,
      url: URL.createObjectURL(file),
      dataUrl: await fileToDataUrl(file),
      sourceMessageId: null,
    })),
  )

  chatStore.addReferenceImages(parsedFiles)
  event.target.value = ''
}

function removeReferenceImage(id) {
  chatStore.removeReferenceImage(id)
  uploadHint.value = `最多上传 ${maxReferenceImages} 张参考图`
}

function handleWindowKeydown(event) {
  if (event.key === 'Escape' && isExpanded.value) {
    isExpanded.value = false
  }

  if (event.key === 'Escape' && isSizePanelVisible.value) {
    isSizePanelVisible.value = false
  }
}

watch(isExpanded, (value) => {
  document.body.style.overflow = value ? 'hidden' : ''
})

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
  document.body.style.overflow = ''
})

async function handleSend() {
  if (!draft.value.prompt.trim() || isLoading.value) return

  if (!chatStore.hasConfig) {
    chatStore.openSettings()
    return
  }

  const prompt = draft.value.prompt.trim()
  isLoading.value = true
  chatStore.addUserPrompt(prompt)

  try {
    const result = await requestImages(chatStore.runtimeConfig, { ...draft.value }, prompt)
    await chatStore.completeImageGeneration(result, prompt)
  } catch (error) {
    chatStore.failImageGeneration(error)
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="input-console" :class="{ 'is-expanded': isExpanded }">
    <div v-if="draft.referenceImages.length" class="reference-strip">
      <div
        v-for="image in draft.referenceImages"
        :key="image.id"
        data-role="reference-card"
        class="reference-card"
      >
        <img :src="image.url" :alt="image.name" class="reference-thumb" />
        <div class="reference-meta">
          <strong>{{ image.name }}</strong>
          <span>图生图参考</span>
        </div>
        <button
          class="reference-remove"
          type="button"
          data-action="remove-reference"
          @click="removeReferenceImage(image.id)"
        >
          移除
        </button>
      </div>
    </div>

    <div class="input-area">
      <div class="left-actions">
        <button class="add-btn" type="button" @click="chatStore.openSettings">
          <Settings2 :size="18" />
        </button>
        <button
          class="add-btn"
          type="button"
          data-action="toggle-fullscreen"
          @click="toggleExpanded"
        >
          <Expand v-if="!isExpanded" :size="18" />
          <Minimize v-else :size="18" />
        </button>
      </div>
      <textarea
        v-model="draft.prompt"
        placeholder="描述你想要生成的内容，或基于上一张图继续细化"
        rows="3"
        @keydown.enter.prevent="handleSend"
      ></textarea>
    </div>

    <div class="toolbar">
      <div class="left-tools">
        <div class="tool-chip model-chip">
          <ImageIcon :size="15" />
          <n-select
            v-model:value="draft.model"
            :options="models"
            class="tool-picker model-select"
            size="small"
          />
        </div>

        <div class="tool-chip size-trigger" :class="{ 'is-open': isSizePanelVisible }">
          <span class="tool-label">尺寸</span>
          <button
            type="button"
            class="size-trigger-btn"
            data-action="open-size-grid"
            @click="isSizePanelVisible = !isSizePanelVisible"
          >
            <span>{{ selectedSizeLabel }}</span>
          </button>

          <div
            v-if="isSizePanelVisible"
            data-panel="size-grid"
            data-placement="top"
            class="size-grid-panel"
          >
            <button
              v-for="item in sizeOptions"
              :key="item.value"
              type="button"
              class="size-grid-option"
              :class="{ active: draft.size === item.value }"
              @click="selectSize(item.value)"
            >
              <span>{{ item.label }}</span>
              <small>{{ item.hint }}</small>
            </button>
          </div>
        </div>

        <div class="tool-chip segmented-chip">
          <span class="tool-label">张数</span>
          <n-select
            v-model:value="draft.n"
            :options="countOptions"
            class="tool-counts"
            size="small"
          />
        </div>

        <label
          class="tool-btn upload-trigger"
          :class="{ disabled: draft.referenceImages.length >= maxReferenceImages }"
        >
          <input
            data-action="add-reference"
            class="reference-input"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            @change="handleReferenceUpload"
          />
          <span>参考图</span>
          <span class="upload-hint">{{ uploadHint }}</span>
        </label>
      </div>

      <div class="right-tools">
        <button class="tool-btn helper" type="button" @click="chatStore.openSettings">
          <Sparkles :size="16" />
          <span>{{ chatStore.hasConfig ? '已连接' : '去配置' }}</span>
        </button>
        <button
          class="send-btn"
          :class="{ active: canSend }"
          @click="handleSend"
          :disabled="!canSend"
        >
          <Send :size="16" />
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@import '@/styles/variables.scss';

.input-console {
  background: rgba(20, 20, 20, 0.7);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow:
    0 16px 40px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  transition: all 0.3s ease;

  &:focus-within {
    border-color: rgba(255, 255, 255, 0.15);
    box-shadow:
      0 16px 40px rgba(0, 0, 0, 0.5),
      0 0 0 1px rgba(255, 255, 255, 0.05) inset,
      0 0 20px rgba(59, 130, 246, 0.1);
  }

  &.is-expanded {
    position: fixed;
    inset: 24px;
    z-index: 1150;
    padding: 20px;
    border-radius: 24px;
    background: rgba(10, 12, 18, 0.96);
    box-shadow:
      0 32px 120px rgba(0, 0, 0, 0.55),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
  }
}

.input-area {
  display: flex;
  gap: 12px;
  align-items: flex-start;

  .left-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
  }

  .add-btn {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    background-color: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.05);
    color: $text-secondary;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.2s;

    &:hover {
      background-color: rgba(255, 255, 255, 0.1);
      color: $text-primary;
    }
  }

  textarea {
    flex: 1;
    background: transparent;
    border: none;
    color: $text-primary;
    font-size: 15px;
    line-height: 1.6;
    resize: none;
    outline: none;
    padding: 5px 0;
    min-height: 72px;
    max-height: 220px;
    font-family: inherit;

    .is-expanded & {
      min-height: calc(100vh - 240px);
      max-height: none;
      font-size: 16px;
    }

    &::placeholder {
      color: $text-muted;
    }
  }
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.left-tools,
.right-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.tool-btn {
  background: transparent;
  border: none;
  color: $text-secondary;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;

  &:hover {
    background-color: rgba(255, 255, 255, 0.05);
    color: $text-primary;
  }
}

.reference-strip {
  display: grid;
  gap: 10px;
}

.reference-card {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.reference-thumb {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  object-fit: cover;
}

.reference-meta {
  min-width: 0;
  display: grid;
  gap: 4px;

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    font-size: 13px;
    color: $text-primary;
  }

  span {
    font-size: 12px;
    color: $text-secondary;
  }
}

.reference-remove {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: $text-secondary;
  border-radius: 999px;
  padding: 6px 12px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    color: $text-primary;
    border-color: rgba(255, 255, 255, 0.14);
  }
}

.tool-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  padding: 6px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: $text-primary;
  font-size: 13px;
}

.tool-label {
  white-space: nowrap;
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.78);
}

.tool-picker,
.tool-counts {
  min-width: 132px;
}

.model-select {
  min-width: 188px;
}

.size-trigger {
  position: relative;
  overflow: visible;
}

.size-trigger-btn {
  border: none;
  background: transparent;
  color: $text-primary;
  min-width: 172px;
  text-align: left;
  cursor: pointer;
  padding: 0;
}

.size-grid-panel {
  position: absolute;
  left: 0;
  bottom: calc(100% + 10px);
  width: min(560px, calc(100vw - 48px));
  padding: 12px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  border-radius: 16px;
  background: rgba(10, 12, 18, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow:
    0 24px 72px rgba(0, 0, 0, 0.48),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  z-index: 20;
}

.size-grid-option {
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
  color: $text-primary;
  border-radius: 14px;
  padding: 12px;
  display: grid;
  gap: 4px;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s;

  small {
    color: $text-secondary;
  }

  &:hover,
  &.active {
    border-color: rgba(89, 158, 255, 0.42);
    background: rgba(53, 96, 191, 0.18);
    box-shadow: 0 0 0 1px rgba(89, 158, 255, 0.14) inset;
  }
}

.tool-picker:deep(.n-base-selection),
.tool-counts:deep(.n-base-selection) {
  background: transparent;
  border: none;
  box-shadow: none;
}

.tool-picker:deep(.n-base-selection-label),
.tool-picker:deep(.n-base-selection-input),
.tool-picker:deep(.n-base-selection-placeholder),
.tool-counts:deep(.n-base-selection-label) {
  color: $text-primary;
}

.segmented-chip {
  padding-right: 6px;
}

.upload-trigger {
  position: relative;
  padding-right: 12px;

  &.disabled {
    opacity: 0.75;
  }
}

.reference-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.upload-hint {
  color: $text-muted;
}

.tool-picker:deep(.n-base-selection .n-base-selection-arrow),
.tool-counts:deep(.n-base-selection .n-base-selection-arrow) {
  color: rgba(255, 255, 255, 0.58);
}

.helper {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}

.send-btn {
  background: transparent;
  border: none;
  color: $text-secondary;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;

  &.active {
    color: $text-primary;
    background-color: rgba(255, 255, 255, 0.1);

    &:hover {
      background-color: $accent-color;
      box-shadow: 0 0 12px $accent-glow;
    }
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
}

@media (max-width: 960px) {
  .input-console.is-expanded {
    inset: 12px;
  }

  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .right-tools {
    justify-content: space-between;
  }

  .size-grid-panel {
    width: min(100vw - 48px, 420px);
    grid-template-columns: 1fr;
  }

  .reference-card {
    grid-template-columns: 48px minmax(0, 1fr);
  }

  .reference-remove {
    grid-column: 1 / -1;
    justify-self: flex-start;
  }
}
</style>
