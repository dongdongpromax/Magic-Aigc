<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowLeft,
  Plus,
  ZoomIn,
  ZoomOut,
  Maximize,
  RotateCcw,
  Trash2,
  Copy,
  ArrowUpToLine,
  ArrowDownToLine,
  ImagePlus,
  X,
  Clapperboard,
  Type,
  Image as ImageIcon,
  Film,
} from 'lucide-vue-next'
import ComicCanvas from '@/components/canvas/ComicCanvas.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import {
  useComicCanvasStore,
  PANEL_RATIO_PRESETS,
  MAX_NODE_COUNT,
  MIN_ZOOM,
  MAX_ZOOM,
} from '@/store/comicCanvas'

/**
 * AI 视频创作画布页
 *
 * 独立全屏的节点式画布：顶部工具栏（添加节点/分镜/缩放/清场/保存状态）、
 * 中间无限画布、右侧属性检查器（按节点类型切换字段；多选/连线选中时切换为批量操作）。
 * 画布状态防抖 + 每 30 秒自动持久化到 localStorage。
 */
const router = useRouter()
const store = useComicCanvasStore()
const canvasRef = ref(null)
const fileInputRef = ref(null)
const clearConfirmShow = ref(false)
/** 节点数达上限的瞬时提示 */
const limitTipShow = ref(false)
/** 最近一次自动保存时间 */
const lastSavedAt = ref(null)

const selectedNode = computed(() => store.selectedNode)
const selectedEdge = computed(() => store.selectedEdge)
const multiSelectCount = computed(() => store.selectedIds.length)
const selectedIndex = computed(() =>
  selectedNode.value ? store.panelIndexMap[selectedNode.value.id] || 0 : 0,
)
const zoomPercent = computed(() => Math.round(store.viewport.zoom * 100))

const NODE_TYPE_LABELS = { text: '文本', image: '图片', video: '视频', panel: '分镜' }
const selectedTypeLabel = computed(() =>
  selectedNode.value ? NODE_TYPE_LABELS[selectedNode.value.type] || '节点' : '',
)

const savedLabel = computed(() => {
  if (!lastSavedAt.value) return ''
  const d = lastSavedAt.value
  const pad = (n) => String(n).padStart(2, '0')
  return `已自动保存 ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
})

const goBack = () => {
  router.push('/chat')
}

/** 添加节点；达到上限时给出瞬时提示 */
const handleAddNode = (type, ratio) => {
  const center = canvasRef.value?.getVisibleCenter() || { x: 0, y: 0 }
  const node = store.addNode(type, center, ratio ? { ratio } : {})
  if (!node) {
    limitTipShow.value = true
    setTimeout(() => {
      limitTipShow.value = false
    }, 2600)
  }
}

const handleZoom = (direction) => {
  const factor = direction > 0 ? 1.2 : 1 / 1.2
  const container = canvasRef.value?.getContainerSize() || { width: 0, height: 0 }
  const { x, y, zoom } = store.viewport
  const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor))
  // 以画布中心为锚点缩放
  const worldX = (container.width / 2 - x) / zoom
  const worldY = (container.height / 2 - y) / zoom
  store.setViewport({
    zoom: nextZoom,
    x: container.width / 2 - worldX * nextZoom,
    y: container.height / 2 - worldY * nextZoom,
  })
}

const handleFit = () => {
  const { width, height } = canvasRef.value?.getContainerSize() || { width: 0, height: 0 }
  store.fitViewportToContent(width, height)
}

const handleConfirmClear = () => {
  store.clearCanvas()
}

/** 选中节点字段更新（textarea 输入直接同步 store） */
const patchSelected = (field, event) => {
  if (!selectedNode.value) return
  store.updateNode(selectedNode.value.id, { [field]: event.target.value })
}

const triggerImagePick = () => {
  fileInputRef.value?.click()
}

/** 本地图片 → 压缩（最长边 1600，JPEG 0.85）→ dataURL 填入节点 */
const handleImageChange = async (event) => {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || !selectedNode.value) return
  try {
    const dataUrl = await downscaleImage(file)
    store.updateNode(selectedNode.value.id, { image: dataUrl })
  } catch {
    // 图片解码失败时忽略，不阻塞画布
  }
}

const removeImage = () => {
  if (!selectedNode.value) return
  store.updateNode(selectedNode.value.id, { image: '' })
}

/**
 * 压缩图片为 dataURL（用于 localStorage 持久化，避免体积超限）
 * @param {File} file
 * @returns {Promise<string>}
 */
function downscaleImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read failed'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('decode failed'))
      img.onload = () => {
        const MAX_EDGE = 1600
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

/** 多选批量操作 */
const handleDuplicateSelected = () => {
  // 逐个复制（duplicateNode 会选中副本，最后选中最后一个副本）
  ;[...store.selectedIds].forEach((id) => store.duplicateNode(id))
}

const handleDeleteSelected = () => {
  store.deleteSelected()
}

/**
 * 键盘快捷键：
 * - Esc 取消选中
 * - Delete/Backspace 删除选中（连线优先于节点）
 * - Ctrl/Cmd+A 全选节点
 * （输入框聚焦时不触发删除/全选）
 */
const handleKeydown = (event) => {
  const tag = document.activeElement?.tagName
  const isTyping = tag === 'INPUT' || tag === 'TEXTAREA'

  if (event.key === 'Escape') {
    store.clearSelection()
    return
  }
  if (isTyping) return

  if ((event.key === 'Delete' || event.key === 'Backspace')) {
    if (store.selectedEdgeId) {
      event.preventDefault()
      store.removeEdge(store.selectedEdgeId)
    } else if (store.selectedIds.length) {
      event.preventDefault()
      store.deleteSelected()
    }
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
    event.preventDefault()
    store.setSelection(store.nodes.map((n) => n.id))
  }
}

// 状态持久化：任意变更后防抖写入；另每 30 秒定时自动保存（PRD 4.1）
let saveTimer = null
let unsubscribe = null
let autoSaveInterval = null

const persistNow = () => {
  store.saveToStorage()
  lastSavedAt.value = new Date()
}

onMounted(() => {
  store.loadFromStorage()
  unsubscribe = store.$subscribe(() => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(persistNow, 300)
  })
  autoSaveInterval = setInterval(persistNow, 30000)
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  clearInterval(autoSaveInterval)
  unsubscribe?.()
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="canvas-page">
    <header class="canvas-toolbar">
      <button class="tool-btn back-btn" type="button" @click="goBack">
        <ArrowLeft :size="16" />
        <span>返回</span>
      </button>

      <div class="toolbar-brand">
        <Clapperboard :size="16" />
        <span>AI 视频创作画布</span>
      </div>

      <div class="toolbar-divider"></div>

      <div class="tool-group">
        <span class="group-label">添加节点</span>
        <button class="tool-btn ratio-btn" type="button" @click="handleAddNode('text')">
          <Type :size="14" />
          <span>文本</span>
        </button>
        <button class="tool-btn ratio-btn" type="button" @click="handleAddNode('image')">
          <ImageIcon :size="14" />
          <span>图片</span>
        </button>
        <button class="tool-btn ratio-btn" type="button" @click="handleAddNode('video')">
          <Film :size="14" />
          <span>视频</span>
        </button>
      </div>

      <div class="toolbar-divider"></div>

      <div class="tool-group">
        <span class="group-label">分镜格</span>
        <button
          v-for="preset in PANEL_RATIO_PRESETS"
          :key="preset.ratio"
          class="tool-btn ratio-btn"
          type="button"
          @click="handleAddNode('panel', preset.ratio)"
        >
          <Plus :size="14" />
          <span>{{ preset.ratio }}</span>
        </button>
      </div>

      <div class="toolbar-divider"></div>

      <div class="tool-group">
        <button class="tool-btn icon-btn" type="button" title="缩小" @click="handleZoom(-1)">
          <ZoomOut :size="16" />
        </button>
        <span class="zoom-value">{{ zoomPercent }}%</span>
        <button class="tool-btn icon-btn" type="button" title="放大" @click="handleZoom(1)">
          <ZoomIn :size="16" />
        </button>
        <button class="tool-btn icon-btn" type="button" title="适应内容" @click="handleFit">
          <Maximize :size="16" />
        </button>
        <button class="tool-btn icon-btn" type="button" title="重置视图" @click="store.resetViewport()">
          <RotateCcw :size="16" />
        </button>
      </div>

      <div class="toolbar-spacer"></div>

      <span v-if="savedLabel" class="saved-indicator">{{ savedLabel }}</span>

      <button class="tool-btn danger-btn" type="button" @click="clearConfirmShow = true">
        <Trash2 :size="15" />
        <span>清空画布</span>
      </button>
    </header>

    <div class="canvas-body">
      <ComicCanvas ref="canvasRef" />

      <!-- 节点数量达上限提示 -->
      <div v-if="limitTipShow" class="limit-tip">节点数量已达上限（{{ MAX_NODE_COUNT }} 个）</div>

      <!-- 单选节点：类型化属性检查器 -->
      <aside v-if="selectedNode" class="panel-inspector">
        <div class="inspector-header">
          <span class="inspector-title">
            {{ selectedTypeLabel }}{{ selectedNode.type === 'panel' && selectedIndex ? ` ${selectedIndex}` : '' }}
          </span>
          <span v-if="selectedNode.ratio" class="inspector-ratio">{{ selectedNode.ratio }}</span>
        </div>

        <!-- 文本节点：正文 -->
        <div v-if="selectedNode.type === 'text'" class="inspector-section">
          <label class="field-label" for="node-text">文本内容</label>
          <textarea
            id="node-text"
            class="field-textarea"
            rows="8"
            placeholder="剧本片段 / 提示词 / 备注…"
            :value="selectedNode.text"
            @input="patchSelected('text', $event)"
          ></textarea>
        </div>

        <template v-else>
          <div class="inspector-section">
            <label class="field-label" for="node-prompt">画面描述</label>
            <textarea
              id="node-prompt"
              class="field-textarea"
              rows="4"
              placeholder="这一格画什么？（人物 / 场景 / 镜头…）"
              :value="selectedNode.prompt"
              @input="patchSelected('prompt', $event)"
            ></textarea>
          </div>

          <!-- 分镜格：台词 -->
          <div v-if="selectedNode.type === 'panel'" class="inspector-section">
            <label class="field-label" for="node-dialogue">台词 / 旁白</label>
            <textarea
              id="node-dialogue"
              class="field-textarea"
              rows="3"
              placeholder="这一格的台词或旁白"
              :value="selectedNode.dialogue"
              @input="patchSelected('dialogue', $event)"
            ></textarea>
          </div>

          <!-- 视频节点：生成能力说明 -->
          <p v-if="selectedNode.type === 'video'" class="field-note">
            视频生成能力将在接入后端工作流后开放，当前可用画面描述记录运动意图。
          </p>

          <!-- 图片 / 分镜格：配图 -->
          <div v-if="selectedNode.type !== 'video'" class="inspector-section">
            <label class="field-label">配图</label>
            <div v-if="selectedNode.image" class="image-preview">
              <img :src="selectedNode.image" alt="节点配图" />
              <button class="image-remove" type="button" title="移除图片" @click="removeImage">
                <X :size="13" />
              </button>
            </div>
            <button class="tool-btn upload-btn" type="button" @click="triggerImagePick">
              <ImagePlus :size="15" />
              <span>{{ selectedNode.image ? '更换图片' : '上传本地图片' }}</span>
            </button>
            <input
              ref="fileInputRef"
              type="file"
              accept="image/*"
              class="hidden-input"
              @change="handleImageChange"
            />
          </div>
        </template>

        <div class="inspector-section">
          <label class="field-label">图层</label>
          <div class="btn-row">
            <button class="tool-btn half-btn" type="button" @click="store.bringToFront(selectedNode.id)">
              <ArrowUpToLine :size="14" />
              <span>置顶</span>
            </button>
            <button class="tool-btn half-btn" type="button" @click="store.sendToBack(selectedNode.id)">
              <ArrowDownToLine :size="14" />
              <span>置底</span>
            </button>
          </div>
        </div>

        <div class="inspector-section">
          <label class="field-label">操作</label>
          <div class="btn-row">
            <button class="tool-btn half-btn" type="button" @click="store.duplicateNode(selectedNode.id)">
              <Copy :size="14" />
              <span>复制</span>
            </button>
            <button
              class="tool-btn half-btn danger-btn"
              type="button"
              @click="store.deleteNode(selectedNode.id)"
            >
              <Trash2 :size="14" />
              <span>删除</span>
            </button>
          </div>
        </div>
      </aside>

      <!-- 多选：批量操作 -->
      <aside v-else-if="multiSelectCount > 1" class="panel-inspector">
        <div class="inspector-header">
          <span class="inspector-title">已选中 {{ multiSelectCount }} 个节点</span>
        </div>
        <p class="field-note">Shift+点击可加选/减选；Shift+拖拽空白可框选。</p>
        <div class="inspector-section">
          <div class="btn-row">
            <button class="tool-btn half-btn" type="button" @click="handleDuplicateSelected">
              <Copy :size="14" />
              <span>复制</span>
            </button>
            <button class="tool-btn half-btn danger-btn" type="button" @click="handleDeleteSelected">
              <Trash2 :size="14" />
              <span>删除</span>
            </button>
          </div>
        </div>
      </aside>

      <!-- 连线选中：删除入口 -->
      <aside v-else-if="selectedEdge" class="panel-inspector">
        <div class="inspector-header">
          <span class="inspector-title">节点连线</span>
        </div>
        <p class="field-note">输出 → 输入 的工作流关系，按 Delete 键或点击下方按钮删除。</p>
        <div class="inspector-section">
          <button
            class="tool-btn danger-btn"
            type="button"
            @click="store.removeEdge(selectedEdge.id)"
          >
            <Trash2 :size="14" />
            <span>删除连线</span>
          </button>
        </div>
      </aside>
    </div>

    <ConfirmDialog
      v-model:show="clearConfirmShow"
      title="清空画布？"
      content="将删除画布上的所有节点与连线，且不可恢复。"
      confirm-text="清空"
      danger
      @confirm="handleConfirmClear"
    />
  </div>
</template>

<style lang="scss" scoped>
@import '@/styles/variables.scss';

.canvas-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: $bg-base;
  color: $text-primary;
}

.canvas-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: rgba(11, 14, 19, 0.92);
  border-bottom: 1px solid $border-color;
  backdrop-filter: blur(16px);
  z-index: 20;
  overflow-x: auto;
}

.toolbar-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  color: $text-primary;
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: $border-color;
  flex-shrink: 0;
}

.toolbar-spacer {
  flex: 1;
}

.tool-group {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.group-label {
  font-size: 12px;
  color: $text-muted;
  margin-right: 2px;
}

.tool-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 10px;
  border: 1px solid $border-color;
  background: rgba(255, 255, 255, 0.04);
  color: $text-primary;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.18s ease;
  white-space: nowrap;

  &:hover {
    background: rgba(119, 168, 255, 0.12);
    border-color: rgba(119, 168, 255, 0.3);
  }
}

.back-btn {
  color: $text-secondary;

  &:hover {
    color: $text-primary;
  }
}

.ratio-btn {
  padding: 6px 10px;
  font-size: 12px;
  color: $text-secondary;

  &:hover {
    color: $text-primary;
  }
}

.icon-btn {
  padding: 7px;
}

.zoom-value {
  min-width: 48px;
  text-align: center;
  font-size: 12px;
  color: $text-secondary;
  font-variant-numeric: tabular-nums;
}

.saved-indicator {
  font-size: 12px;
  color: $text-muted;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.danger-btn:hover {
  background: rgba(255, 107, 107, 0.12);
  border-color: rgba(255, 107, 107, 0.4);
  color: #ff8585;
}

.canvas-body {
  flex: 1;
  display: flex;
  min-height: 0;
  position: relative;
}

.limit-tip {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  padding: 9px 18px;
  border-radius: 10px;
  background: rgba(255, 176, 92, 0.14);
  border: 1px solid rgba(255, 176, 92, 0.45);
  color: #ffc98a;
  font-size: 13px;
  z-index: 30;
  pointer-events: none;
}

.panel-inspector {
  flex-shrink: 0;
  width: 280px;
  padding: 16px;
  overflow-y: auto;
  background: rgba(15, 18, 24, 0.94);
  border-left: 1px solid $border-color;
  backdrop-filter: blur(16px);
  display: flex;
  flex-direction: column;
  gap: 16px;
  z-index: 10;
}

.inspector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.inspector-title {
  font-size: 15px;
  font-weight: 600;
}

.inspector-ratio {
  font-size: 11px;
  color: $text-secondary;
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid $border-color;
  background: rgba(255, 255, 255, 0.04);
}

.inspector-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  font-size: 12px;
  color: $text-muted;
  font-weight: 500;
}

.field-note {
  font-size: 12px;
  line-height: 1.6;
  color: $text-secondary;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(119, 168, 255, 0.07);
  border: 1px solid rgba(119, 168, 255, 0.16);
}

.field-textarea {
  width: 100%;
  resize: vertical;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid $border-color;
  border-radius: 10px;
  padding: 9px 10px;
  color: $text-primary;
  font-size: 13px;
  line-height: 1.6;
  outline: none;
  font-family: inherit;

  &::placeholder {
    color: $text-muted;
  }

  &:focus {
    border-color: rgba(119, 168, 255, 0.45);
    box-shadow: 0 0 0 3px rgba(119, 168, 255, 0.12);
  }
}

.image-preview {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid $border-color;

  img {
    width: 100%;
    display: block;
    max-height: 180px;
    object-fit: cover;
  }
}

.image-remove {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  border: none;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &:hover {
    background: rgba(255, 107, 107, 0.75);
  }
}

.upload-btn {
  width: 100%;
}

.hidden-input {
  display: none;
}

.btn-row {
  display: flex;
  gap: 8px;
}

.half-btn {
  flex: 1;
}

@media (max-width: 860px) {
  .panel-inspector {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    box-shadow: -12px 0 32px rgba(0, 0, 0, 0.5);
  }
}
</style>
