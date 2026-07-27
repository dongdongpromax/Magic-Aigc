<script setup>
import { computed } from 'vue'
import {
  Image as ImageIcon,
  MessageSquare,
  Type,
  Film,
  Clapperboard,
} from 'lucide-vue-next'
import { useComicCanvasStore, MIN_NODE_WIDTH, MIN_NODE_HEIGHT } from '@/store/comicCanvas'

/**
 * 画布通用节点（文本/图片/视频/分镜格）
 *
 * 位于画布世界坐标系内（外层容器已做 translate+scale），
 * 因此内部所有位移/缩放计算都要把屏幕像素差除以 zoom 换成世界坐标。
 *
 * 交互：
 * - 按住节点拖拽 → 移动；点击 → 选中（Shift 加选）
 * - 选中后四角出现手柄 → 拖拽缩放（对边固定）
 * - 左右两侧连接端口：从输出端口拖出连线（emit start-connect）
 * - 右键 → 打开节点上下文菜单（emit node-context）
 */
const props = defineProps({
  node: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  /** 分镜格播放序号（仅 panel 类型有意义，其余类型为 0） */
  index: { type: Number, default: 0 },
  zoom: { type: Number, default: 1 },
})

const emit = defineEmits(['start-connect', 'node-context'])

const store = useComicCanvasStore()

const TYPE_META = {
  text: { label: '文本', icon: Type },
  image: { label: '图片', icon: ImageIcon },
  video: { label: '视频', icon: Film },
  panel: { label: '分镜', icon: Clapperboard },
}

const typeMeta = computed(() => TYPE_META[props.node.type] || TYPE_META.panel)

/** 端口/手柄/选中框在屏幕上保持恒定视觉尺寸（世界坐标下除以 zoom） */
const handleSize = computed(() => 12 / props.zoom)
const outlineWidth = computed(() => 2 / props.zoom)

const nodeStyle = computed(() => ({
  left: `${props.node.x}px`,
  top: `${props.node.y}px`,
  width: `${props.node.width}px`,
  height: `${props.node.height}px`,
  zIndex: props.node.z,
  '--handle-size': `${handleSize.value}px`,
  '--outline-width': `${outlineWidth.value}px`,
}))

/** 无图占位提示：优先画面描述/文本，其次默认文案 */
const placeholderText = computed(() => {
  const text = (props.node.prompt || props.node.text || '').trim()
  if (!text) return '拖拽移动 · 右侧栏补充内容'
  return text.length > 48 ? `${text.slice(0, 48)}…` : text
})

const textPreview = computed(() => props.node.text.trim() || '双击右侧栏编辑文本内容')

/** 点击选中（支持 Shift 加选），随后进入拖拽移动 */
function startMove(event) {
  if (event.button !== 0) return
  store.selectNode(props.node.id, event.shiftKey)

  const startX = event.clientX
  const startY = event.clientY
  const originX = props.node.x
  const originY = props.node.y

  const onMove = (e) => {
    const dx = (e.clientX - startX) / props.zoom
    const dy = (e.clientY - startY) / props.zoom
    store.updateNode(props.node.id, { x: originX + dx, y: originY + dy })
  }
  const onUp = (e) => {
    const dx = (e.clientX - startX) / props.zoom
    const dy = (e.clientY - startY) / props.zoom
    store.moveNode(props.node.id, originX + dx, originY + dy)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

/**
 * 角手柄缩放
 * @param {PointerEvent} event
 * @param {'nw'|'ne'|'sw'|'se'} corner 手柄方位，拖拽时对角保持固定
 */
function startResize(event, corner) {
  if (event.button !== 0) return
  event.stopPropagation()
  store.selectNode(props.node.id)

  const startX = event.clientX
  const startY = event.clientY
  const start = { ...props.node }

  const computeRect = (e) => {
    const dx = (e.clientX - startX) / props.zoom
    const dy = (e.clientY - startY) / props.zoom
    let { x, y, width, height } = start

    if (corner.includes('e')) width = Math.max(MIN_NODE_WIDTH, start.width + dx)
    if (corner.includes('s')) height = Math.max(MIN_NODE_HEIGHT, start.height + dy)
    if (corner.includes('w')) {
      width = Math.max(MIN_NODE_WIDTH, start.width - dx)
      x = start.x + (start.width - width)
    }
    if (corner.includes('n')) {
      height = Math.max(MIN_NODE_HEIGHT, start.height - dy)
      y = start.y + (start.height - height)
    }
    return { x, y, width, height }
  }

  const onMove = (e) => store.updateNode(props.node.id, computeRect(e))
  const onUp = (e) => {
    store.resizeNode(props.node.id, computeRect(e))
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

/** 从输出端口开始连线（阻止冒泡，避免触发节点拖拽/画布平移） */
function handlePortDown(event) {
  if (event.button !== 0) return
  event.stopPropagation()
  emit('start-connect', props.node.id)
}

function handleContextMenu(event) {
  event.stopPropagation()
  emit('node-context', props.node.id, event)
}
</script>

<template>
  <div
    class="canvas-node"
    :class="[`type-${node.type}`, { selected, disabled: node.disabled }]"
    :style="nodeStyle"
    :data-node-id="node.id"
    data-testid="canvas-node"
    @pointerdown="startMove"
    @contextmenu.prevent="handleContextMenu"
  >
    <div class="node-header">
      <component :is="typeMeta.icon" :size="12" class="node-type-icon" />
      <span class="node-type-label">{{ typeMeta.label }}</span>
      <span v-if="node.type === 'panel' && index" class="node-index">#{{ index }}</span>
      <span v-else-if="node.ratio" class="node-index">{{ node.ratio }}</span>
    </div>

    <div class="node-body">
      <!-- 文本节点：正文预览 -->
      <div v-if="node.type === 'text'" class="text-preview">{{ textPreview }}</div>

      <!-- 图片 / 分镜格 / 视频节点：画面或占位 -->
      <template v-else>
        <img
          v-if="node.image"
          :src="node.image"
          alt="节点画面"
          class="node-image"
          draggable="false"
        />
        <div v-else class="node-placeholder">
          <component :is="typeMeta.icon" :size="26" class="placeholder-icon" />
          <span class="placeholder-text">{{ placeholderText }}</span>
        </div>
      </template>
    </div>

    <span v-if="node.dialogue" class="node-dialogue-flag" :title="node.dialogue">
      <MessageSquare :size="12" />
    </span>
    <span v-if="node.disabled" class="node-disabled-flag">已禁用</span>

    <!-- 输入/输出连接端口（世界坐标，尺寸随 zoom 反比缩放保持视觉恒定） -->
    <span class="connect-port port-in" data-port="in" title="输入"></span>
    <span
      class="connect-port port-out"
      data-port="out"
      title="拖出连线"
      @pointerdown="handlePortDown"
    ></span>

    <template v-if="selected">
      <span
        v-for="corner in ['nw', 'ne', 'sw', 'se']"
        :key="corner"
        class="resize-handle"
        :class="`handle-${corner}`"
        @pointerdown="startResize($event, corner)"
      ></span>
    </template>
  </div>
</template>

<style lang="scss" scoped>
@import '@/styles/variables.scss';

.canvas-node {
  position: absolute;
  display: flex;
  flex-direction: column;
  background: $bg-surface;
  border: 1px solid $border-light;
  border-radius: 8px;
  cursor: move;
  user-select: none;
  touch-action: none;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);

  &.selected {
    border-color: $accent-color;
    box-shadow:
      0 0 0 var(--outline-width, 2px) rgba(119, 168, 255, 0.55),
      0 8px 28px rgba(0, 0, 0, 0.45);
  }

  &.disabled {
    opacity: 0.45;
  }
}

/* 类型色条：header 顶部分型色 */
.type-text .node-header {
  border-bottom-color: rgba(119, 168, 255, 0.35);
}

.type-image .node-header {
  border-bottom-color: rgba(35, 255, 188, 0.35);
}

.type-video .node-header {
  border-bottom-color: rgba(255, 176, 92, 0.4);
}

.type-panel .node-header {
  border-bottom-color: rgba(157, 124, 255, 0.4);
}

.node-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid $border-color;
  color: $text-secondary;
}

.node-type-icon {
  flex-shrink: 0;
}

.node-type-label {
  font-size: 12px;
  font-weight: 500;
}

.node-index {
  margin-left: auto;
  font-size: 11px;
  color: $text-muted;
  font-variant-numeric: tabular-nums;
}

.node-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border-radius: 0 0 7px 7px;
}

.text-preview {
  height: 100%;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.6;
  color: $text-primary;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: hidden;
  pointer-events: none;
}

.node-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}

.node-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px;
  background: repeating-linear-gradient(
    -45deg,
    rgba(255, 255, 255, 0.025) 0 10px,
    transparent 10px 20px
  );
  color: $text-secondary;
  pointer-events: none;
}

.placeholder-icon {
  opacity: 0.6;
  flex-shrink: 0;
}

.placeholder-text {
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
  word-break: break-all;
  overflow: hidden;
}

.node-dialogue-flag {
  position: absolute;
  right: -8px;
  bottom: -8px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(157, 124, 255, 0.9);
  color: #fff;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
}

.node-disabled-flag {
  position: absolute;
  top: -10px;
  right: -8px;
  padding: 3px 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid $border-light;
  color: $text-secondary;
  font-size: 11px;
}

/* 连接端口 */
.connect-port {
  position: absolute;
  top: 50%;
  width: var(--handle-size, 12px);
  height: var(--handle-size, 12px);
  margin-top: calc(var(--handle-size, 12px) / -2);
  border-radius: 50%;
  background: $bg-base;
  border: 2px solid $accent-color;
  opacity: 0;
  transition: opacity 0.15s ease;
  z-index: 20;
}

.canvas-node:hover .connect-port,
.canvas-node.selected .connect-port {
  opacity: 1;
}

.port-in {
  left: calc(var(--handle-size, 12px) / -2);
}

.port-out {
  right: calc(var(--handle-size, 12px) / -2);
  cursor: crosshair;

  &:hover {
    background: $accent-color;
  }
}

/* 缩放手柄 */
.resize-handle {
  position: absolute;
  width: var(--handle-size, 12px);
  height: var(--handle-size, 12px);
  background: #fff;
  border: 1px solid $accent-color;
  border-radius: 3px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  z-index: 10;
}

.handle-nw {
  left: calc(var(--handle-size, 12px) / -2);
  top: calc(var(--handle-size, 12px) / -2);
  cursor: nwse-resize;
}

.handle-ne {
  right: calc(var(--handle-size, 12px) / -2);
  top: calc(var(--handle-size, 12px) / -2);
  cursor: nesw-resize;
}

.handle-sw {
  left: calc(var(--handle-size, 12px) / -2);
  bottom: calc(var(--handle-size, 12px) / -2);
  cursor: nesw-resize;
}

.handle-se {
  right: calc(var(--handle-size, 12px) / -2);
  bottom: calc(var(--handle-size, 12px) / -2);
  cursor: nwse-resize;
}
</style>
