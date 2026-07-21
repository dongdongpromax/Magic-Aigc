<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Image as ImageIcon, Send, Settings2, Sparkles } from 'lucide-vue-next'
import { NSelect } from 'naive-ui'
import { requestImages } from '@/services/imageSession'
import { uploadReferenceImages } from '@/services/uploadApi'
import { useChatStore } from '@/store/chat'
import { MAX_REFERENCE_IMAGES } from '@/utils/constants'

const chatStore = useChatStore()
const isLoading = ref(false)
const isSizePanelVisible = ref(false)
const uploadHint = ref(`最多上传 ${MAX_REFERENCE_IMAGES} 张参考图`)
// P1-7: 引用共享常量，避免魔法数字散落
const maxReferenceImages = MAX_REFERENCE_IMAGES

const models = [{ label: 'GPT Image 2', value: 'openai/gpt-image-2' }]

const counts = [1, 2, 3, 4]

/**
 * 改动4: 尺寸选项数据结构
 *
 * 每项包含 ratio（画面比例，用于可视化小方框）+ pixels（像素标注）+ group（分组），
 * 让选择器按分组展示并画出对应比例的预览方框，一眼看出画面形状。
 */
const sizeOptions = [
  { label: 'auto', value: 'auto', ratio: null, pixels: '自动适配', group: '自动' },
  { label: '1024×1024', value: '1024x1024', ratio: '1:1', pixels: '1024×1024', group: '方图' },
  { label: '1536×1536', value: '1536x1536', ratio: '1:1', pixels: '1536×1536', group: '方图' },
  { label: '1536×1152', value: '1536x1152', ratio: '4:3', pixels: '1536×1152', group: '横图' },
  { label: '1536×1024', value: '1536x1024', ratio: '3:2', pixels: '1536×1024', group: '横图' },
  { label: '1536×864', value: '1536x864', ratio: '16:9', pixels: '1536×864', group: '横图' },
  { label: '1792×768', value: '1792x768', ratio: '21:9', pixels: '1792×768', group: '超宽' },
  { label: '1536×768', value: '1536x768', ratio: '2:1', pixels: '1536×768', group: '超宽' },
  { label: '1152×1536', value: '1152x1536', ratio: '3:4', pixels: '1152×1536', group: '竖图' },
  { label: '1024×1536', value: '1024x1536', ratio: '2:3', pixels: '1024×1536', group: '竖图' },
  { label: '864×1536', value: '864x1536', ratio: '9:16', pixels: '864×1536', group: '竖图' },
  { label: '768×1792', value: '768x1792', ratio: '9:21', pixels: '768×1792', group: '竖图' },
  { label: '768×1536', value: '768x1536', ratio: '1:2', pixels: '768×1536', group: '竖图' },
]

/**
 * 改动4: 按 group 分组后的尺寸选项，供模板分组渲染
 */
const sizeGroups = computed(() => {
  const groups = new Map()
  for (const option of sizeOptions) {
    if (!groups.has(option.group)) groups.set(option.group, [])
    groups.get(option.group).push(option)
  }
  return [...groups.entries()].map(([name, options]) => ({ name, options }))
})

const countOptions = counts.map((count) => ({ label: `${count} 张`, value: count }))

const draft = computed(() => chatStore.currentDraft)
const canSend = computed(() => Boolean(draft.value.prompt.trim()) && !isLoading.value)
const selectedSizeLabel = computed(() => {
  const item = sizeOptions.find((opt) => opt.value === draft.value.size)
  if (!item) return draft.value.size
  return item.ratio ? `${item.ratio} · ${item.pixels}` : item.pixels
})

/**
 * 改动4: 把比例字符串（如 "4:3"）转为 CSS aspect-ratio 值（如 "4 / 3"），
 * 用于尺寸选项的可视化小方框。auto 用 1:1 占位。
 * @param {string|null} ratio
 * @returns {string}
 */
function ratioToCss(ratio) {
  if (!ratio) return '1 / 1'
  const [w, h] = ratio.split(':').map(Number)
  return `${w} / ${h}`
}

function selectSize(value) {
  draft.value.size = value
  isSizePanelVisible.value = false
}

/**
 * 上传参考图文件数组并写入当前草稿
 *
 * 抽出为独立函数，供「文件选择上传」和「粘贴图片上传」复用。
 * 含 16 张上限校验、超限截断、上传后调 chatStore.addReferenceImages 持久化。
 * @param {Array<File>} files 待上传的图片文件
 */
async function uploadReferenceFiles(files) {
  if (!files.length) return

  const currentCount = draft.value.referenceImages?.length || 0
  const remain = maxReferenceImages - currentCount

  if (remain <= 0) {
    uploadHint.value = `最多上传 ${maxReferenceImages} 张参考图`
    return
  }

  if (files.length > remain) {
    uploadHint.value = `最多上传 ${maxReferenceImages} 张参考图`
  } else {
    uploadHint.value = `已添加 ${currentCount + files.length} / ${maxReferenceImages} 张参考图`
  }

  const acceptedFiles = files.slice(0, remain)
  const topicId = chatStore.currentTopicId || (await chatStore.createTopic('新建创作'))
  const uploadedFiles = await uploadReferenceImages(topicId, acceptedFiles)
  const parsedFiles = uploadedFiles.map((item) => ({
    id: item.id,
    name: item.name,
    type: item.mimeType || item.type || 'image/png',
    url: item.filePath || item.url,
    filePath: item.filePath || item.url,
    dataUrl: '',
    sourceMessageId: item.sourceMessageId || null,
  }))

  chatStore.addReferenceImages(parsedFiles)
}

async function handleReferenceUpload(event) {
  const files = Array.from(event.target?.files || [])
  await uploadReferenceFiles(files)
  event.target.value = ''
}

/**
 * 粘贴图片到聊天框：从剪贴板提取 image/* 文件，复用上传逻辑添加为参考图
 *
 * 若剪贴板含图片则阻止默认粘贴（避免把图片当垃圾文本插入 textarea），
 * 没有图片则放行默认行为（正常粘贴文本）。
 * @param {ClipboardEvent} event
 */
async function handlePaste(event) {
  const items = event.clipboardData?.items || []
  const imageFiles = []

  for (const item of items) {
    if (item.type?.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) {
        // 剪贴板图片默认文件名是 "image.png"，用时间戳区分避免重名
        const ext = file.name?.split('.').pop() || 'png'
        const named = new File([file], `paste-${Date.now()}.${ext}`, { type: file.type })
        imageFiles.push(named)
      }
    }
  }

  if (imageFiles.length) {
    event.preventDefault()
    await uploadReferenceFiles(imageFiles)
  }
}

async function removeReferenceImage(id) {
  await chatStore.removeReferenceImage(id)
  uploadHint.value = `最多上传 ${maxReferenceImages} 张参考图`
}

function handleWindowKeydown(event) {
  if (event.key === 'Escape' && isSizePanelVisible.value) {
    isSizePanelVisible.value = false
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
})

/**
 * 发送生成请求
 *
 * 改动5: 捕获发起时的 originTopicId，传给 completeImageGeneration/failImageGeneration，
 * 保证生成中切换主题后结果仍正确归位发起主题，不污染其他主题草稿。
 */
async function handleSend() {
  if (!draft.value.prompt.trim() || isLoading.value) return

  if (!chatStore.hasConfig) {
    chatStore.openSettings()
    return
  }

  const prompt = draft.value.prompt.trim()
  isLoading.value = true
  let originTopicId = ''

  try {
    originTopicId = await chatStore.addUserPrompt(prompt)
    const result = await requestImages(originTopicId, {
      prompt,
      draft: { ...draft.value },
    })
    await chatStore.completeImageGeneration(result, prompt, originTopicId)
  } catch (error) {
    chatStore.failImageGeneration(error, originTopicId)
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="input-console">
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
      </div>
      <textarea
        v-model="draft.prompt"
        placeholder="描述你想要生成的内容，或基于上一张图继续细化（可直接粘贴图片作为参考图）"
        rows="3"
        @keydown.enter.prevent="handleSend"
        @paste="handlePaste"
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
            <div v-for="group in sizeGroups" :key="group.name" class="size-group">
              <div class="size-group-title">{{ group.name }}</div>
              <div class="size-group-grid">
                <button
                  v-for="item in group.options"
                  :key="item.value"
                  type="button"
                  class="size-grid-option"
                  :class="{ active: draft.size === item.value }"
                  @click="selectSize(item.value)"
                >
                  <span class="ratio-preview" :style="{ aspectRatio: ratioToCss(item.ratio) }"></span>
                  <span class="ratio-label">{{ item.ratio || 'auto' }}</span>
                  <small>{{ item.pixels }}</small>
                </button>
              </div>
            </div>
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

/* 改动4: 比例可视化网格面板，按分组展示 */
.size-grid-panel {
  position: absolute;
  left: 0;
  bottom: calc(100% + 10px);
  width: min(560px, calc(100vw - 48px));
  max-height: 60vh;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  border-radius: 16px;
  background: rgba(10, 12, 18, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow:
    0 24px 72px rgba(0, 0, 0, 0.48),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  z-index: 20;
}

.size-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.size-group-title {
  font-size: 11px;
  color: $text-muted;
  letter-spacing: 0.05em;
  padding-left: 2px;
}

.size-group-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.size-grid-option {
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
  color: $text-primary;
  border-radius: 12px;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;

  small {
    color: $text-secondary;
    font-size: 11px;
  }

  &:hover,
  &.active {
    border-color: rgba(89, 158, 255, 0.42);
    background: rgba(53, 96, 191, 0.18);
    box-shadow: 0 0 0 1px rgba(89, 158, 255, 0.14) inset;
  }
}

/* 比例预览小方框：宽度固定 36px，高度由 aspect-ratio 按比例缩放 */
.ratio-preview {
  width: 36px;
  max-height: 36px;
  border-radius: 4px;
  background: linear-gradient(135deg, rgba(119, 168, 255, 0.35), rgba(157, 124, 255, 0.25));
  border: 1px solid rgba(255, 255, 255, 0.18);
  flex-shrink: 0;
}

.ratio-label {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
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
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .right-tools {
    justify-content: space-between;
  }

  .size-grid-panel {
    width: min(100vw - 48px, 420px);
  }

  .size-group-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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
