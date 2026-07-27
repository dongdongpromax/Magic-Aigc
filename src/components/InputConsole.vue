<script setup>
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { AlertTriangle, ImagePlus, Send, Settings2, SlidersHorizontal } from 'lucide-vue-next'
import { NSelect } from 'naive-ui'
import { uploadReferenceImages } from '@/services/uploadApi'
import { useChatStore } from '@/store/chat'
import { useProvidersStore } from '@/store/providers'
import { MAX_REFERENCE_IMAGES } from '@/utils/constants'
import {
  videoRatioOptions,
  videoDurationOptions,
  videoResolutionOptions,
  videoRefModeOptions,
  VIDEO_REF_LIMITS,
} from '@/config/videoOptions'
import ConfirmDialog from './ConfirmDialog.vue'

const chatStore = useChatStore()
const providersStore = useProvidersStore()
// 生成中状态读 store（替代本地 isLoading），与「重试」共用同一把锁防止并发生成
const isLoading = computed(() => chatStore.isGenerating)
// 统一参数面板显隐（收纳图像的尺寸/张数、视频的比例/时长/清晰度）
const isParamPanelVisible = ref(false)
// 参数面板容器 ref，用于 click-outside 检测
const paramPanelRef = ref(null)
// 提交二次确认弹窗显隐（Enter 提交前确认，防止误触）
const submitConfirmShow = ref(false)
// P1-7: 引用共享常量，避免魔法数字散落
const maxReferenceImages = MAX_REFERENCE_IMAGES

const counts = [1, 2, 3, 4]

/**
 * 尺寸选项数据结构
 *
 * 每项包含 ratio（画面比例，用于可视化小方框）+ pixels（像素标注）+ group（分组），
 * 让选择器按分组展示并画出对应比例的预览方框，一眼看出画面形状。
 */
const sizeOptions = [
  { label: '自动', value: 'auto', ratio: null, pixels: '自动适配', group: '自动' },
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
 * 按 group 分组后的尺寸选项，供模板分组渲染
 */
const sizeGroups = computed(() => {
  const groups = new Map()
  for (const option of sizeOptions) {
    if (!groups.has(option.group)) groups.set(option.group, [])
    groups.get(option.group).push(option)
  }
  return [...groups.entries()].map(([name, options]) => ({ name, options }))
})

const draft = computed(() => chatStore.currentDraft)

/**
 * 模型分组下拉选项：组 = 启用中的中转站，选项 = 该家已启用模型
 * option value 为复合键 `${providerId}::${modelId}`；
 * option label 带「· 中转站名」后缀用于触发器回显（spec 5.3），下拉里由 renderLabel 只显示模型名
 */
const modelGroups = computed(() =>
  providersStore.enabledProviders
    .filter((provider) => provider.enabledModels?.length)
    .map((provider) => ({
      type: 'group',
      label: provider.name,
      key: provider.id,
      color: provider.color || '',
      children: provider.enabledModels.map((model) => ({
        label: `${model.displayName || model.modelId} · ${provider.name}`,
        value: `${provider.id}::${model.modelId}`,
        modelLabel: model.displayName || model.modelId,
      })),
    })),
)

/**
 * 复合选中值 <-> draft.providerId + draft.model 双向拆合
 * 用 indexOf 而非 split：providerId 是 slug 不含 '::'，modelId 理论上可能含冒号
 */
const selectedModelKey = computed({
  get: () =>
    draft.value.providerId && draft.value.model
      ? `${draft.value.providerId}::${draft.value.model}`
      : null,
  set: (key) => {
    if (!key) return
    const separatorIndex = key.indexOf('::')
    draft.value.providerId = key.slice(0, separatorIndex)
    draft.value.model = key.slice(separatorIndex + 2)
  },
})

/**
 * 当前选中模型的信息对象（含 isVideo 标记）
 * 从 enabledProviders → enabledModels 中按 providerId + modelId 查找
 */
const selectedModelInfo = computed(() => {
  const pid = draft.value.providerId
  const mid = draft.value.model
  if (!pid || !mid) return null
  const provider = providersStore.enabledProviders.find((p) => p.id === pid)
  if (!provider?.enabledModels) return null
  return provider.enabledModels.find((m) => m.modelId === mid) || null
})

/** 当前选中模型是否为视频生成模型 */
const isVideoModel = computed(() => Boolean(selectedModelInfo.value?.isVideo))

/**
 * 当前参考图上限：视频按 videoRefMode 取上限，图像固定 16 张
 */
const refLimit = computed(() =>
  isVideoModel.value ? VIDEO_REF_LIMITS[draft.value.videoRefMode] || 1 : maxReferenceImages,
)

/**
 * 参数摘要文案：在参数按钮上直接展示当前参数值，无需展开即可看到设置
 * - 图像：比例 · 张数（如 "1:1 · 2张"）
 * - 视频：比例 · 时长 · 清晰度（如 "16:9 · 5秒 · 720p"）
 */
const paramSummary = computed(() => {
  if (isVideoModel.value) {
    return `${draft.value.ratio} · ${draft.value.duration}秒 · ${draft.value.resolution}`
  }
  const item = sizeOptions.find((opt) => opt.value === draft.value.size)
  const sizeText = item ? (item.ratio || '自动') : draft.value.size
  return `${sizeText} · ${draft.value.n}张`
})

/**
 * 参考图上传提示文案
 * 视频模型按参考模式给出对应上限提示；图像模型固定 16 张
 */
const uploadHint = computed(() => {
  const count = draft.value.referenceImages?.length || 0
  const limit = refLimit.value
  if (isVideoModel.value) {
    if (count > limit) return `当前模式仅支持 ${limit} 张，将使用前 ${limit} 张`
    return count ? `已添加 ${count} / ${limit} 张参考图` : `当前模式支持 ${limit} 张参考图`
  }
  return count
    ? `已添加 ${count} / ${maxReferenceImages} 张参考图`
    : `最多上传 ${maxReferenceImages} 张参考图`
})

/**
 * 下拉项渲染：组标题前加中转站色块圆点，模型项只显示模型名
 * 下拉菜单 teleport 到 body，scoped 样式不生效——圆点样式全部内联
 */
function renderModelLabel(option) {
  if (option.type === 'group') {
    return [
      h('span', {
        style: {
          display: 'inline-block',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          marginRight: '6px',
          background: option.color || 'rgba(255, 255, 255, 0.35)',
        },
      }),
      option.label,
    ]
  }
  return option.modelLabel
}
const canSend = computed(() => Boolean(draft.value.prompt.trim()) && !isLoading.value)

/**
 * 图像模型 prompt 长度警告阈值（两档）
 *
 * 依据 OpenAI 官方 API 文档：GPT Image 系列（gpt-image-1 / gpt-image-2）的 prompt
 * 硬限制为 32,000 字符（dall-e-3 为 4,000，dall-e-2 为 1,000）。此处区分两档：
 *
 * - SOFT_LIMIT（15,000）：软提醒阈值。gpt-image-2 基于 thinking pipeline，能处理长
 *   prompt，但超过此长度时生成质量可能下降（注意力分散、末尾指令易被淹没）。
 *   仅提示用户，不阻断发送。
 * - HARD_LIMIT（30,000）：硬限制警告阈值。接近 API 32,000 上限，继续追加可能被上游
 *   直接拒绝（400 错误），强警告提示用户精简。
 *
 * 注意：早期版本误把 DALL-E 3 的 4,000 硬限制当作 GPT Image 系列的上限，导致正常
 * 的长 prompt（如 8,000-10,000 字符）被误报。已按官方文档修正。
 */
const IMAGE_PROMPT_SOFT_LIMIT = 15000
const IMAGE_PROMPT_HARD_LIMIT = 30000

/** 当前 prompt 字符数 */
const promptLength = computed(() => draft.value.prompt.length)

/**
 * prompt 超长警告等级（仅图像模型检查）
 *
 * - null：未超长，不显示警告
 * - 'soft'：超过 SOFT_LIMIT，提示可能影响生成质量（不阻断发送）
 * - 'hard'：超过 HARD_LIMIT，接近 API 32,000 硬限制，可能被上游拒绝
 *
 * 视频模型不检查（prompt 结构不同，且视频模型 prompt 通常更短）。
 * @returns {null | 'soft' | 'hard'}
 */
const promptWarnLevel = computed(() => {
  if (isVideoModel.value) return null
  if (promptLength.value > IMAGE_PROMPT_HARD_LIMIT) return 'hard'
  if (promptLength.value > IMAGE_PROMPT_SOFT_LIMIT) return 'soft'
  return null
})

/**
 * 把比例字符串（如 "4:3"）转为 CSS aspect-ratio 值（如 "4 / 3"），
 * 用于尺寸选项的可视化小方框。auto 用 1:1 占位。
 * @param {string|null} ratio
 * @returns {string}
 */
function ratioToCss(ratio) {
  if (!ratio) return '1 / 1'
  const [w, h] = ratio.split(':').map(Number)
  return `${w} / ${h}`
}

/** 选中尺寸后只更新值，不关闭面板（用户可能还要调张数） */
function selectSize(value) {
  draft.value.size = value
}

/** 切换参数面板显隐 */
function toggleParamPanel() {
  isParamPanelVisible.value = !isParamPanelVisible.value
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
  // 上限按当前参考模式取（视频）或固定 16 张（图像）
  const limit = refLimit.value
  const remain = limit - currentCount

  if (remain <= 0) return

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
}

/**
 * 视频卡槽角色标签（按模式 + 下标派生，与后端 deriveRole 对齐）
 * @param {number} index 卡槽下标
 * @returns {string} 角色文案
 */
function refSlotLabel(index) {
  if (draft.value.videoRefMode === 'first_last') return index === 0 ? '首帧' : '尾帧'
  if (draft.value.videoRefMode === 'reference') return '参考图'
  return '首帧'
}

/**
 * 按指定卡槽下标上传参考图
 *
 * 复用 uploadReferenceFiles 上传到后端并追加到草稿末尾，
 * 随后把刚追加的尾部图挪到目标槽位（仅当目标槽为空），保证首尾帧顺序。
 * @param {Event} event 文件输入 change 事件
 * @param {number} slotIndex 目标卡槽下标
 */
async function handleSlotUpload(event, slotIndex) {
  const files = Array.from(event.target?.files || [])
  if (!files.length) return

  const beforeCount = draft.value.referenceImages?.length || 0
  await uploadReferenceFiles(files)

  // uploadReferenceFiles 把新图追加到末尾；若目标槽为空，把尾图挪到目标槽保证顺序
  const imgs = draft.value.referenceImages
  if (slotIndex < refLimit.value && !imgs[slotIndex] && imgs.length > beforeCount) {
    const moved = imgs.splice(imgs.length - 1, 1)[0]
    imgs.splice(slotIndex, 0, moved)
  }
  event.target.value = ''
}

/**
 * 切换参考模式时裁剪超出上限的参考图，避免模式与图片数量错配
 */
watch(
  () => draft.value.videoRefMode,
  (mode, prev) => {
    if (!isVideoModel.value || !prev || mode === prev) return
    const limit = VIDEO_REF_LIMITS[mode] || 1
    if (draft.value.referenceImages.length > limit) {
      draft.value.referenceImages = draft.value.referenceImages.slice(0, limit)
    }
  },
)

/** Escape 关闭参数面板 */
function handleWindowKeydown(event) {
  if (event.key === 'Escape' && isParamPanelVisible.value) {
    isParamPanelVisible.value = false
  }
}

/** 点击参数面板外部时关闭 */
function onDocumentClick(event) {
  if (!isParamPanelVisible.value) return
  if (paramPanelRef.value && !paramPanelRef.value.contains(event.target)) {
    isParamPanelVisible.value = false
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeydown)
  document.addEventListener('click', onDocumentClick)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
  document.removeEventListener('click', onDocumentClick)
})

/**
 * 聊天框回车行为
 *
 * - Shift+Enter：放行默认换行（此前 @keydown.enter.prevent 把换行也吞了，导致无法回车）
 * - Enter：阻止默认换行，弹出二次确认弹窗，确认后才提交（防止误触发送浪费一次生成）
 *
 * 发送按钮点击仍是直接提交（点击属显式操作，无需确认）。
 * @param {KeyboardEvent} event
 */
function handlePromptKeydown(event) {
  if (event.key !== 'Enter') return
  // Shift+Enter：插入换行，不拦截
  if (event.shiftKey) return
  // 确认弹窗已打开时不再重复触发（焦点已移至弹窗确认按钮）
  if (submitConfirmShow.value) return
  event.preventDefault()
  event.stopPropagation()
  // 无可发内容时不弹窗
  if (!canSend.value) return
  submitConfirmShow.value = true
}

/** 提交确认弹窗「确定」后执行发送 */
function handleConfirmSubmit() {
  submitConfirmShow.value = false
  handleSend()
}

/**
 * 发送生成请求
 *
 * 生成流程编排（addUserPrompt → requestImages/requestVideo → complete/fail）
 * 已抽取到 chatStore.runGeneration，此处只负责校验 + 捕获快照 + 调用。
 *
 * 快照在 await 之前捕获，避免 await 期间切换主题导致 draft.value 指向新主题
 * （参数/参考图错位）、甚至 isVideoModel 翻转走错生成分支。
 */
async function handleSend() {
  if (!draft.value.prompt.trim() || isLoading.value) return

  // 首尾帧模式需首帧与尾帧各一张，未填满两槽时阻止发送
  if (isVideoModel.value && draft.value.videoRefMode === 'first_last') {
    if (draft.value.referenceImages.length < 2) {
      chatStore.lastError = '首尾帧模式需要首帧与尾帧各一张'
      return
    }
  }

  if (!chatStore.hasConfig) {
    chatStore.openSettings()
    return
  }

  const prompt = draft.value.prompt.trim()
  // 在任何 await 之前捕获 draft 快照，交给 runGeneration 编排生成流程
  const draftSnapshot = { ...draft.value, referenceImages: [...(draft.value.referenceImages || [])] }
  await chatStore.runGeneration(prompt, draftSnapshot)
}
</script>

<template>
  <div class="input-console">
    <div
      v-if="isVideoModel || draft.referenceImages.length"
      class="reference-strip"
      :class="{ 'reference-strip--slots': isVideoModel }"
      data-role="reference-strip"
    >
      <template v-if="isVideoModel">
        <!-- 固定槽位模式：首帧(1槽) / 首尾帧(2槽)，角色明确需固定槽位对位 -->
        <template v-if="draft.videoRefMode !== 'reference'">
          <div
            v-for="slotIndex in refLimit"
            :key="slotIndex"
            class="ref-slot"
            :class="{ filled: draft.referenceImages[slotIndex - 1] }"
            data-role="ref-slot"
          >
            <template v-if="draft.referenceImages[slotIndex - 1]">
              <img :src="draft.referenceImages[slotIndex - 1].url" class="reference-thumb" />
              <span class="ref-slot-tag">{{ refSlotLabel(slotIndex - 1) }}</span>
              <button
                class="reference-remove ref-slot-remove"
                type="button"
                data-action="remove-reference"
                @click="removeReferenceImage(draft.referenceImages[slotIndex - 1].id)"
              >
                移除
              </button>
            </template>
            <template v-else>
              <label class="ref-slot-upload" :title="uploadHint">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  class="reference-input"
                  @change="(e) => handleSlotUpload(e, slotIndex - 1)"
                />
                <span class="ref-slot-tag">{{ refSlotLabel(slotIndex - 1) }}</span>
                <span class="ref-slot-empty">+ 上传</span>
              </label>
            </template>
          </div>
        </template>
        <!-- 多图参考：渐进式，只渲染已上传图 + 1 个添加入口，避免空状态铺满 9 槽 -->
        <template v-else>
          <div
            v-for="image in draft.referenceImages"
            :key="image.id"
            class="ref-slot filled"
            data-role="ref-slot"
          >
            <img :src="image.url" class="reference-thumb" />
            <span class="ref-slot-tag">参考图</span>
            <button
              class="reference-remove ref-slot-remove"
              type="button"
              data-action="remove-reference"
              @click="removeReferenceImage(image.id)"
            >
              移除
            </button>
          </div>
          <label
            v-if="draft.referenceImages.length < refLimit"
            class="ref-slot ref-slot-add"
            data-role="ref-slot"
            :title="uploadHint"
          >
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              class="reference-input"
              @change="handleReferenceUpload"
            />
            <span class="ref-slot-empty">+ 添加</span>
          </label>
        </template>
      </template>
      <template v-else>
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
      </template>
    </div>

    <div class="input-area">
      <div class="left-actions">
        <button class="add-btn" type="button" @click="chatStore.openSettings">
          <Settings2 :size="18" />
        </button>
      </div>
      <textarea
        v-model="draft.prompt"
        :placeholder="isVideoModel ? '描述你想要的视频画面，或上传参考图让画面动起来' : '描述你想要生成的内容，或基于上一张图继续细化（可直接粘贴图片作为参考图）'"
        rows="5"
        @keydown="handlePromptKeydown"
        @paste="handlePaste"
      ></textarea>
    </div>

    <!-- prompt 超长警告（两档）：软提醒(>15k)琥珀色 / 硬限制(>30k)红色 -->
    <div
      v-if="promptWarnLevel"
      class="prompt-warn"
      :class="{ 'prompt-warn--hard': promptWarnLevel === 'hard' }"
      data-role="prompt-warn"
      :data-level="promptWarnLevel"
    >
      <AlertTriangle :size="13" />
      <span v-if="promptWarnLevel === 'soft'">
        提示词较长（{{ promptLength }} 字符），超长 prompt 可能影响生成质量，建议精简至 {{ IMAGE_PROMPT_SOFT_LIMIT }} 字符以内
      </span>
      <span v-else>
        提示词过长（{{ promptLength }} 字符），已接近 API 上限（{{ IMAGE_PROMPT_HARD_LIMIT }} 字符），可能被上游拒绝，请精简
      </span>
    </div>

    <div class="toolbar">
      <div class="left-tools">
        <!-- 模型选择器 -->
        <div class="tool-chip model-chip">
          <n-select
            v-if="modelGroups.length"
            v-model:value="selectedModelKey"
            :options="modelGroups"
            :render-label="renderModelLabel"
            class="tool-picker model-select"
            size="small"
            placeholder="选择模型"
            data-role="model-select"
          />
          <button
            v-else
            type="button"
            class="empty-model-btn"
            data-action="open-settings-empty"
            @click="chatStore.openSettings"
          >
            去设置添加模型
          </button>
        </div>

        <!-- 参数按钮 + 弹出面板：未选模型时不显示，避免无意义的参数配置 -->
        <div v-if="selectedModelInfo" ref="paramPanelRef" class="param-trigger">
          <button
            type="button"
            class="tool-chip param-chip"
            :class="{ 'is-open': isParamPanelVisible }"
            data-action="open-params"
            @click="toggleParamPanel"
          >
            <SlidersHorizontal :size="14" />
            <span class="param-summary">{{ paramSummary }}</span>
          </button>

          <div
            v-if="isParamPanelVisible"
            class="param-panel"
            data-panel="params"
            data-placement="top"
          >
            <!-- 图像模式：尺寸网格 + 张数分段 -->
            <template v-if="!isVideoModel">
              <div class="seg-section" data-panel="size-grid">
                <div class="seg-title">尺寸</div>
                <div class="size-grid-section">
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
                        <span class="ratio-label">{{ item.ratio || '自动' }}</span>
                        <small>{{ item.pixels }}</small>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="seg-section">
                <div class="seg-title">张数</div>
                <div class="seg-group">
                  <button
                    v-for="count in counts"
                    :key="count"
                    type="button"
                    class="seg-btn"
                    :class="{ active: draft.n === count }"
                    @click="draft.n = count"
                  >
                    {{ count }} 张
                  </button>
                </div>
              </div>
            </template>

            <!-- 视频模式：参考模式 + 比例 + 时长 + 清晰度 -->
            <template v-else>
              <div class="seg-section">
                <div class="seg-title">参考模式</div>
                <div class="seg-group">
                  <button
                    v-for="opt in videoRefModeOptions"
                    :key="opt.value"
                    type="button"
                    class="seg-btn"
                    :class="{ active: draft.videoRefMode === opt.value }"
                    @click="draft.videoRefMode = opt.value"
                  >
                    {{ opt.label }}
                  </button>
                </div>
              </div>
              <div class="seg-section">
                <div class="seg-title">比例</div>
                <div class="seg-group seg-group--wrap">
                  <button
                    v-for="opt in videoRatioOptions"
                    :key="opt.value"
                    type="button"
                    class="seg-btn"
                    :class="{ active: draft.ratio === opt.value }"
                    @click="draft.ratio = opt.value"
                  >
                    {{ opt.label }}
                  </button>
                </div>
              </div>
              <div class="seg-section">
                <div class="seg-title">时长</div>
                <n-select
                  v-model:value="draft.duration"
                  :options="videoDurationOptions"
                  class="param-select"
                  size="small"
                />
              </div>
              <div class="seg-section">
                <div class="seg-title">清晰度</div>
                <div class="seg-group">
                  <button
                    v-for="opt in videoResolutionOptions"
                    :key="opt.value"
                    type="button"
                    class="seg-btn"
                    :class="{ active: draft.resolution === opt.value }"
                    @click="draft.resolution = opt.value"
                  >
                    {{ opt.label }}
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>

        <label
          v-if="selectedModelInfo"
          class="tool-btn upload-trigger"
          :class="{ disabled: draft.referenceImages.length >= refLimit }"
          :title="uploadHint"
        >
          <input
            data-action="add-reference"
            class="reference-input"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            @change="handleReferenceUpload"
          />
          <ImagePlus :size="15" />
          <span class="upload-label">参考图</span>
          <span v-if="draft.referenceImages.length" class="upload-badge">
            {{ draft.referenceImages.length }}/{{ refLimit }}
          </span>
        </label>
      </div>

      <!-- 当前输入框字符数：常驻显示，让用户随时感知 prompt 长度 -->
      <span class="char-counter" data-role="char-counter">{{ promptLength }} 字</span>

      <button
        class="send-btn"
        :class="{ active: canSend }"
        @click="handleSend"
        :disabled="!canSend"
      >
        <Send :size="16" />
      </button>
    </div>

    <!-- Enter 提交二次确认 -->
    <ConfirmDialog
      v-model:show="submitConfirmShow"
      title="是否确定提交？"
      content="将提交当前内容进行生成。"
      confirm-text="确定提交"
      @confirm="handleConfirmSubmit"
    />
  </div>
</template>

<style lang="scss" scoped>
@import '@/styles/variables.scss';

.input-console {
  background: rgba(20, 20, 20, 0.7);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
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
    border-radius: 5px;
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
    // 允许纵向自由拖拽放大输入框高度
    resize: vertical;
    outline: none;
    padding: 5px 0;
    // 默认高度调高，给长 prompt 更多书写空间
    min-height: 120px;
    max-height: 50vh;
    font-family: inherit;

    &::placeholder {
      color: $text-muted;
    }
  }
}

/* prompt 超长警告条：业务风格，无渐变，3px 圆角。
   软提醒(>15k)琥珀色 / 硬限制(>30k)红色，两档区分严重程度。 */
.prompt-warn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 3px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.25);
  color: #f59e0b;
  font-size: 12px;
  line-height: 1.5;

  svg {
    flex-shrink: 0;
  }

  /* 硬限制档：红色强警告，接近 API 32,000 上限可能被拒 */
  &--hard {
    background: rgba(239, 68, 68, 0.12);
    border-color: rgba(239, 68, 68, 0.3);
    color: #ef4444;
  }
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

/* 输入框字符数：常驻显示在工具栏右侧（发送按钮左侧），克制小字、不抢视觉 */
.char-counter {
  margin-left: auto;
  align-self: center;
  font-size: 11px;
  color: $text-muted;
  white-space: nowrap;
  padding: 0 4px;
  font-variant-numeric: tabular-nums;
}

.left-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  min-width: 0;
}

.tool-btn {
  background: transparent;
  border: none;
  color: $text-secondary;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
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

/* 视频模式卡槽条：横向排列，超出可滚动，避免多图参考 9 槽撑爆输入框 */
.reference-strip--slots {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* 视频参考图卡槽：96x96 方块，空槽虚线引导、满槽实线 */
.ref-slot {
  position: relative;
  width: 96px;
  height: 96px;
  border-radius: 4px;
  border: 1px dashed rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.03);
  overflow: hidden;
  flex-shrink: 0;

  &.filled {
    border-style: solid;
    border-color: rgba(255, 255, 255, 0.1);
  }

  .reference-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 0;
  }
}

/* 卡槽角色标签：左上角半透明小标，标明首帧/尾帧/参考图 */
.ref-slot-tag {
  position: absolute;
  top: 4px;
  left: 4px;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.55);
  color: rgba(255, 255, 255, 0.85);
  font-size: 11px;
  line-height: 1.4;
  pointer-events: none;
}

/* 空槽上传触发：整块可点，居中显示「+ 上传」 */
.ref-slot-upload {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  gap: 4px;
}

.ref-slot-empty {
  font-size: 12px;
}

/* 多图参考渐进式添加入口：复用空槽虚线外观 + 居中 + 悬停反馈 */
.ref-slot-add {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  transition: all 0.2s;

  &:hover {
    border-color: rgba(255, 255, 255, 0.28);
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.75);
  }
}

/* 满槽移除按钮：右下角小按钮，复用 reference-remove 基样 */
.ref-slot-remove {
  position: absolute;
  right: 4px;
  bottom: 4px;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 11px;
}

.reference-card {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.reference-thumb {
  width: 56px;
  height: 56px;
  border-radius: 4px;
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
  border-radius: 5px;
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
  border-radius: 5px;
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

.tool-picker {
  min-width: 132px;
}

.model-select {
  min-width: 150px;
  max-width: 260px;
}

/* 工具栏各元素允许收缩，防止 nowrap 下互相挤压 */
.model-chip,
.param-trigger,
.upload-trigger {
  min-width: 0;
}

.empty-model-btn {
  border: none;
  background: transparent;
  color: rgba(119, 168, 255, 0.9);
  font-size: 13px;
  cursor: pointer;
  padding: 0 2px;
  white-space: nowrap;

  &:hover {
    text-decoration: underline;
  }
}

/* 参数触发按钮：收纳所有模型参数，点击展开面板 */
.param-trigger {
  position: relative;
}

.param-chip {
  cursor: pointer;
  transition: all 0.2s;

  &:hover,
  &.is-open {
    border-color: rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.08);
  }
}

.param-summary {
  white-space: nowrap;
  color: $text-primary;
  font-size: 12.5px;
}

/* 参数弹出面板：从按钮上方弹出，分区层次清晰，干练深色 */
.param-panel {
  position: absolute;
  left: 0;
  bottom: calc(100% + 10px);
  width: min(520px, calc(100vw - 48px));
  max-height: 60vh;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  border-radius: 8px;
  background: rgba(10, 12, 18, 0.97);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow:
    0 20px 56px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  z-index: 20;
}

/* 分区：小标题 + 控件，区间用细分隔线建立层次 */
.seg-section {
  display: flex;
  flex-direction: column;
  gap: 8px;

  & + .seg-section {
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
}

.seg-title {
  font-size: 11px;
  color: $text-muted;
  letter-spacing: 0.04em;
  padding-left: 1px;
}

/* 分段控件组：等宽按钮平铺，凹槽底色包裹 */
.seg-group {
  display: flex;
  gap: 3px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 5px;
  padding: 3px;
}

.seg-group--wrap {
  flex-wrap: wrap;
}

/* 分段按钮：克制选中态，底色高亮无渐变 */
.seg-btn {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: $text-secondary;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;

  &:hover {
    color: $text-primary;
  }

  &.active {
    background: rgba(255, 255, 255, 0.1);
    color: $text-primary;
    font-weight: 500;
  }
}

/* 尺寸网格区域（图像模式参数面板内） */
.size-grid-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.size-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.size-group-title {
  font-size: 11px;
  color: $text-muted;
  padding-left: 1px;
}

.size-group-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.size-grid-option {
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
  color: $text-primary;
  border-radius: 5px;
  padding: 8px 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
  cursor: pointer;
  transition: all 0.15s;

  small {
    color: $text-secondary;
    font-size: 10px;
  }

  &:hover {
    border-color: rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.05);
  }

  &.active {
    border-color: rgba(119, 168, 255, 0.5);
    background: rgba(119, 168, 255, 0.12);
  }
}

/* 比例预览小方框：宽度固定 26px，高度由 aspect-ratio 按比例缩放 */
.ratio-preview {
  width: 26px;
  max-height: 26px;
  border-radius: 2px;
  background: rgba(119, 168, 255, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.2);
  flex-shrink: 0;
}

.ratio-label {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

/* 下拉选择器（时长）：满宽，深色适配 */
.param-select {
  width: 100%;
  min-width: 0;
}

.tool-picker:deep(.n-base-selection),
.param-select:deep(.n-base-selection) {
  background: transparent;
  border: none;
  box-shadow: none;
}

.tool-picker:deep(.n-base-selection-label),
.tool-picker:deep(.n-base-selection-input),
.tool-picker:deep(.n-base-selection-placeholder),
.param-select:deep(.n-base-selection-label) {
  color: $text-primary;
}

.tool-picker:deep(.n-base-selection .n-base-selection-arrow),
.param-select:deep(.n-base-selection .n-base-selection-arrow) {
  color: rgba(255, 255, 255, 0.58);
}

.upload-trigger {
  position: relative;
  padding-right: 10px;
  flex-shrink: 0;

  &.disabled {
    opacity: 0.75;
  }
}

.upload-label {
  white-space: nowrap;
}

/* 数量角标：紧凑显示当前/上限，替代原长串 hint 文本，给工具栏留白 */
.upload-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 18px;
  padding: 0 6px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.08);
  color: $text-secondary;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
}

.reference-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
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
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;

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
  .left-tools {
    flex-wrap: wrap;
  }

  .param-panel {
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
