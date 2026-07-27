<script setup>
import { computed, ref } from 'vue'
import { useComicCanvasStore, NODE_TYPES, MIN_ZOOM, MAX_ZOOM } from '@/store/comicCanvas'
import CanvasNode from './CanvasNode.vue'
import CanvasMenu from './CanvasMenu.vue'

/**
 * AI 视频创作无限画布
 *
 * - 视口 = 平移(viewport.x/y) + 缩放(viewport.zoom)，存于 store 便于持久化
 * - 滚轮：以指针为中心缩放（20% – 400%）
 * - 拖拽空白：平移画布；Shift + 拖拽空白：框选多选节点
 * - 双击空白 / 右键空白：打开「创建节点」菜单
 * - 右键节点 / 连线：上下文菜单（复制/置顶/置底/禁用/断开/删除）
 * - 从节点输出端口拖出连线，落到另一节点上建立 输入←输出 关系（防环）
 */
const store = useComicCanvasStore()
const containerRef = ref(null)

/** 浮动菜单状态：{ x, y, kind: 'create' | 'node' | 'edge', targetId, world } */
const menu = ref(null)
/** 连线拖拽状态：{ fromId, x, y }（x/y 为指针的世界坐标） */
const connecting = ref(null)
/** 框选状态：{ x, y, width, height }（世界坐标） */
const marquee = ref(null)

const worldStyle = computed(() => ({
  transform: `translate(${store.viewport.x}px, ${store.viewport.y}px) scale(${store.viewport.zoom})`,
}))

/** 点阵网格背景跟随视口移动/缩放，营造无限画布感 */
const gridStyle = computed(() => {
  const spacing = 26 * store.viewport.zoom
  return {
    backgroundImage:
      'radial-gradient(circle, rgba(255, 255, 255, 0.13) 1px, transparent 1.2px)',
    backgroundSize: `${spacing}px ${spacing}px`,
    backgroundPosition: `${store.viewport.x}px ${store.viewport.y}px`,
  }
})

/** 节点输出端口（右缘中点）世界坐标 */
function outPortPos(node) {
  return { x: node.x + node.width, y: node.y + node.height / 2 }
}

/** 节点输入端口（左缘中点）世界坐标 */
function inPortPos(node) {
  return { x: node.x, y: node.y + node.height / 2 }
}

/** 三次贝塞尔连线路径（水平方向拉出控制点，模拟节点编辑器曲线） */
function edgePath(from, to) {
  const dx = Math.max(48, Math.abs(to.x - from.x) / 2)
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`
}

const edgeList = computed(() =>
  store.edges
    .map((edge) => {
      const fromNode = store.nodes.find((n) => n.id === edge.from)
      const toNode = store.nodes.find((n) => n.id === edge.to)
      if (!fromNode || !toNode) return null
      return {
        id: edge.id,
        d: edgePath(outPortPos(fromNode), inPortPos(toNode)),
        selected: edge.id === store.selectedEdgeId,
      }
    })
    .filter(Boolean),
)

/** 正在拖拽的临时连线路径 */
const connectingPath = computed(() => {
  if (!connecting.value) return ''
  const fromNode = store.nodes.find((n) => n.id === connecting.value.fromId)
  if (!fromNode) return ''
  return edgePath(outPortPos(fromNode), { x: connecting.value.x, y: connecting.value.y })
})

/** 菜单项：创建节点 */
const createMenuItems = NODE_TYPES.map((t) => ({ key: t.type, label: `${t.label}节点` }))

const nodeMenuItems = computed(() => {
  if (menu.value?.kind !== 'node') return []
  const node = store.nodes.find((n) => n.id === menu.value.targetId)
  if (!node) return []
  return [
    { key: 'duplicate', label: '复制节点' },
    { key: 'front', label: '置顶' },
    { key: 'back', label: '置底' },
    { key: 'toggle-disable', label: node.disabled ? '启用节点' : '禁用节点' },
    { key: 'disconnect', label: '断开连线' },
    { key: 'delete', label: '删除节点', danger: true },
  ]
})

const edgeMenuItems = [{ key: 'delete-edge', label: '删除连线', danger: true }]

const activeMenuItems = computed(() => {
  if (!menu.value) return []
  if (menu.value.kind === 'create') return createMenuItems
  if (menu.value.kind === 'node') return nodeMenuItems.value
  return edgeMenuItems
})

/** 屏幕坐标（client）→ 世界坐标 */
function clientToWorld(clientX, clientY) {
  const rect = containerRef.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  const { x, y, zoom } = store.viewport
  return {
    x: (clientX - rect.left - x) / zoom,
    y: (clientY - rect.top - y) / zoom,
  }
}

/** 是否点在空白处（非节点/端口/连线上） */
function isBlankTarget(event) {
  return !event.target.closest?.('[data-node-id]') && !event.target.closest?.('.edge-hit')
}

/** 滚轮缩放：保持指针下的世界坐标点不动 */
function handleWheel(event) {
  const container = containerRef.value
  if (!container) return
  const rect = container.getBoundingClientRect()
  const screenX = event.clientX - rect.left
  const screenY = event.clientY - rect.top
  const { x, y, zoom } = store.viewport

  const worldX = (screenX - x) / zoom
  const worldY = (screenY - y) / zoom
  const factor = Math.exp(-event.deltaY * 0.0018)
  const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor))

  store.setViewport({
    zoom: nextZoom,
    x: screenX - worldX * nextZoom,
    y: screenY - worldY * nextZoom,
  })
}

/**
 * 空白处 pointerdown：
 * - Shift 按住 → 框选
 * - 否则 → 平移画布；松手时位移很小视为点击空白 → 清空选中
 */
function handleBackgroundDown(event) {
  if (event.button !== 0 || !isBlankTarget(event)) return
  closeMenu()

  if (event.shiftKey) {
    startMarquee(event)
    return
  }
  startPan(event)
}

function startPan(event) {
  const startX = event.clientX
  const startY = event.clientY
  const originX = store.viewport.x
  const originY = store.viewport.y
  let moved = false

  const onMove = (e) => {
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true
    store.setViewport({ x: originX + dx, y: originY + dy })
  }
  const onUp = () => {
    if (!moved) store.clearSelection()
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

/** Shift + 拖拽：框选与矩形相交的节点 */
function startMarquee(event) {
  const start = clientToWorld(event.clientX, event.clientY)

  const onMove = (e) => {
    const cur = clientToWorld(e.clientX, e.clientY)
    marquee.value = {
      x: Math.min(start.x, cur.x),
      y: Math.min(start.y, cur.y),
      width: Math.abs(cur.x - start.x),
      height: Math.abs(cur.y - start.y),
    }
  }
  const onUp = (e) => {
    const cur = clientToWorld(e.clientX, e.clientY)
    const rect = {
      x1: Math.min(start.x, cur.x),
      y1: Math.min(start.y, cur.y),
      x2: Math.max(start.x, cur.x),
      y2: Math.max(start.y, cur.y),
    }
    const hit = store.nodes
      .filter(
        (n) =>
          n.x < rect.x2 && n.x + n.width > rect.x1 && n.y < rect.y2 && n.y + n.height > rect.y1,
      )
      .map((n) => n.id)
    store.setSelection(hit)
    marquee.value = null
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

/** 双击空白 → 打开创建节点菜单（记录世界坐标锚点用于落点） */
function handleDblclick(event) {
  if (!isBlankTarget(event)) return
  store.clearSelection()
  menu.value = {
    kind: 'create',
    x: event.clientX,
    y: event.clientY,
    world: clientToWorld(event.clientX, event.clientY),
    targetId: '',
  }
}

/** 右键：按目标类型打开对应上下文菜单 */
function handleContextMenu(event) {
  const edgeEl = event.target.closest?.('.edge-hit')
  if (edgeEl) {
    store.selectEdge(edgeEl.dataset.edgeId)
    menu.value = { kind: 'edge', x: event.clientX, y: event.clientY, targetId: edgeEl.dataset.edgeId }
    return
  }
  if (!isBlankTarget(event)) return // 节点右键由 CanvasNode 的 node-context 事件处理
  menu.value = {
    kind: 'create',
    x: event.clientX,
    y: event.clientY,
    world: clientToWorld(event.clientX, event.clientY),
    targetId: '',
  }
}

/** 节点右键（CanvasNode 抛出）：选中并打开节点菜单 */
function handleNodeContext(nodeId, event) {
  if (!store.selectedIds.includes(nodeId)) store.selectNode(nodeId)
  menu.value = { kind: 'node', x: event.clientX, y: event.clientY, targetId: nodeId }
}

/** 菜单动作分发 */
function handleMenuSelect(key) {
  const current = menu.value
  if (!current) return

  if (current.kind === 'create') {
    store.addNode(key, current.world)
    return
  }
  if (current.kind === 'edge') {
    if (key === 'delete-edge') store.removeEdge(current.targetId)
    return
  }
  // node 菜单
  const id = current.targetId
  switch (key) {
    case 'duplicate':
      store.duplicateNode(id)
      break
    case 'front':
      store.bringToFront(id)
      break
    case 'back':
      store.sendToBack(id)
      break
    case 'toggle-disable':
      store.toggleDisable(id)
      break
    case 'disconnect':
      store.removeEdgesOf(id)
      break
    case 'delete':
      store.deleteNode(id)
      break
  }
}

function closeMenu() {
  menu.value = null
}

/** 从输出端口开始拖拽连线 */
function handleStartConnect(fromId) {
  const onMove = (e) => {
    const world = clientToWorld(e.clientX, e.clientY)
    connecting.value = { fromId, x: world.x, y: world.y }
  }
  const onUp = (e) => {
    // 用 elementFromPoint 做落点命中（连线 SVG 层 pointer-events 为 none，可穿透到节点）
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const nodeEl = el?.closest?.('[data-node-id]')
    if (nodeEl) {
      store.addEdge(fromId, nodeEl.dataset.nodeId)
    }
    connecting.value = null
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

/** 点击连线选中（配合 Delete 键删除） */
function handleEdgeClick(edgeId) {
  store.selectEdge(edgeId)
}

/** 可视区域中心的世界坐标（供工具栏「添加节点」落点） */
function getVisibleCenter() {
  const container = containerRef.value
  if (!container) return { x: 0, y: 0 }
  const rect = container.getBoundingClientRect()
  const { x, y, zoom } = store.viewport
  return {
    x: (rect.width / 2 - x) / zoom,
    y: (rect.height / 2 - y) / zoom,
  }
}

/** 容器尺寸（供「适应内容」计算） */
function getContainerSize() {
  const container = containerRef.value
  if (!container) return { width: 0, height: 0 }
  const rect = container.getBoundingClientRect()
  return { width: rect.width, height: rect.height }
}

defineExpose({ getVisibleCenter, getContainerSize })
</script>

<template>
  <div
    ref="containerRef"
    class="comic-canvas"
    data-testid="comic-canvas"
    @wheel.prevent="handleWheel"
    @pointerdown="handleBackgroundDown"
    @dblclick="handleDblclick"
    @contextmenu.prevent="handleContextMenu"
  >
    <div class="canvas-grid" :style="gridStyle"></div>

    <div class="canvas-world" :style="worldStyle">
      <!-- 连线层：跟随世界变换；点击命中用透明加宽路径 -->
      <svg class="edges-layer">
        <g v-for="edge in edgeList" :key="edge.id">
          <path
            class="edge-hit"
            :data-edge-id="edge.id"
            :d="edge.d"
            @click.stop="handleEdgeClick(edge.id)"
          />
          <path class="edge-line" :class="{ selected: edge.selected }" :d="edge.d" />
        </g>
        <path v-if="connectingPath" class="edge-line connecting" :d="connectingPath" />
      </svg>

      <CanvasNode
        v-for="node in store.sortedNodes"
        :key="node.id"
        :node="node"
        :selected="store.selectedIds.includes(node.id)"
        :index="store.panelIndexMap[node.id] || 0"
        :zoom="store.viewport.zoom"
        @start-connect="handleStartConnect"
        @node-context="handleNodeContext"
      />

      <!-- Shift 框选矩形 -->
      <div
        v-if="marquee"
        class="marquee-rect"
        :style="{
          left: `${marquee.x}px`,
          top: `${marquee.y}px`,
          width: `${marquee.width}px`,
          height: `${marquee.height}px`,
        }"
      ></div>
    </div>

    <div v-if="!store.nodes.length" class="canvas-empty-hint">
      <p class="hint-title">AI 视频创作画布</p>
      <p class="hint-line">双击空白创建节点（文本 / 图片 / 视频 / 分镜格）</p>
      <p class="hint-line">拖拽空白平移 · 滚轮缩放 · Shift+拖拽框选 · 节点右侧端口拖出连线</p>
    </div>

    <CanvasMenu
      v-if="menu"
      :x="menu.x"
      :y="menu.y"
      :items="activeMenuItems"
      @select="handleMenuSelect"
      @close="closeMenu"
    />
  </div>
</template>

<style lang="scss" scoped>
@import '@/styles/variables.scss';

.comic-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: $bg-base;
  cursor: grab;
  touch-action: none;

  &:active {
    cursor: grabbing;
  }
}

.canvas-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.canvas-world {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  transform-origin: 0 0;
}

/* 连线层与节点同处世界坐标系；SVG 自身不拦截事件，仅命中路径可点 */
.edges-layer {
  position: absolute;
  left: 0;
  top: 0;
  width: 1px;
  height: 1px;
  overflow: visible;
  pointer-events: none;
}

.edge-hit {
  fill: none;
  stroke: transparent;
  stroke-width: 14;
  pointer-events: stroke;
  cursor: pointer;
}

.edge-line {
  fill: none;
  stroke: rgba(119, 168, 255, 0.75);
  stroke-width: 2;
  pointer-events: none;

  &.selected {
    stroke: #9cc0ff;
    stroke-width: 3;
    filter: drop-shadow(0 0 6px rgba(119, 168, 255, 0.6));
  }

  &.connecting {
    stroke-dasharray: 6 5;
    stroke: rgba(157, 124, 255, 0.85);
  }
}

.marquee-rect {
  position: absolute;
  border: 1px solid $accent-color;
  background: rgba(119, 168, 255, 0.1);
  pointer-events: none;
  z-index: 9999;
}

.canvas-empty-hint {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  pointer-events: none;
}

.hint-title {
  font-size: 20px;
  font-weight: 600;
  color: $text-primary;
  letter-spacing: 2px;
  margin-bottom: 6px;
}

.hint-line {
  font-size: 13px;
  color: $text-secondary;
}
</style>
