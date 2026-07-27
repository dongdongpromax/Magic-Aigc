import { defineStore } from 'pinia'

/**
 * AI 视频创作画布 store（节点式工作流）
 *
 * 管理画布上的「节点」（文本/图片/视频/分镜格）与「连线」（输入→输出关系）、
 * 视口（平移 + 缩放）、多选状态，并通过 localStorage 做本地持久化。
 *
 * 坐标约定：
 * - 节点的 x/y/width/height 均为「世界坐标」（画布逻辑坐标，与缩放无关）。
 * - viewport.x/y 为世界原点在屏幕上的平移量（px），zoom 为缩放倍率。
 * - 屏幕坐标 = 世界坐标 * zoom + viewport 偏移。
 *
 * 数据迁移：v1（纯分镜格 panels）在 loadFromStorage 时自动升级为 panel 类型节点。
 */

export const COMIC_CANVAS_STORAGE_KEY = 'comic-canvas-state-v2'
export const LEGACY_STORAGE_KEY = 'comic-canvas-state-v1'

/** 节点类型（PRD 4.1：文本/图片/视频/分镜格） */
export const NODE_TYPES = [
  { type: 'text', label: '文本' },
  { type: 'image', label: '图片' },
  { type: 'video', label: '视频' },
  { type: 'panel', label: '分镜格' },
]

/** 分镜格比例预设（添加时的默认世界尺寸） */
export const PANEL_RATIO_PRESETS = [
  { ratio: '16:9', width: 480, height: 270 },
  { ratio: '9:16', width: 270, height: 480 },
  { ratio: '1:1', width: 360, height: 360 },
  { ratio: '4:3', width: 440, height: 330 },
  { ratio: '3:4', width: 330, height: 440 },
]

/** 非分镜格节点的默认尺寸 */
const NODE_DEFAULT_SIZES = {
  text: { width: 280, height: 160 },
  image: { width: 320, height: 320 },
  video: { width: 480, height: 270 },
}

export const MIN_NODE_WIDTH = 80
export const MIN_NODE_HEIGHT = 60
/** PRD 4.1：缩放范围 20% – 400% */
export const MIN_ZOOM = 0.2
export const MAX_ZOOM = 4
/** PRD 4.1：单画布最大节点数（保证性能） */
export const MAX_NODE_COUNT = 200

let nodeSeq = 0
let edgeSeq = 0

function createNodeId() {
  nodeSeq += 1
  return `node-${Date.now()}-${nodeSeq}`
}

function createEdgeId() {
  edgeSeq += 1
  return `edge-${Date.now()}-${edgeSeq}`
}

function clampNumber(value, fallback, min) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(min, num)
}

/** 加载时把任意来源的数据规整为合法节点 */
function normalizeNode(raw) {
  if (!raw || typeof raw !== 'object') return null
  const type = NODE_TYPES.some((t) => t.type === raw.type) ? raw.type : 'panel'
  return {
    id: String(raw.id || createNodeId()),
    type,
    x: Number(raw.x) || 0,
    y: Number(raw.y) || 0,
    width: clampNumber(raw.width, MIN_NODE_WIDTH, MIN_NODE_WIDTH),
    height: clampNumber(raw.height, MIN_NODE_HEIGHT, MIN_NODE_HEIGHT),
    z: Number(raw.z) || 0,
    ratio: typeof raw.ratio === 'string' ? raw.ratio : '',
    prompt: typeof raw.prompt === 'string' ? raw.prompt : '',
    text: typeof raw.text === 'string' ? raw.text : '',
    dialogue: typeof raw.dialogue === 'string' ? raw.dialogue : '',
    image: typeof raw.image === 'string' ? raw.image : '',
    disabled: raw.disabled === true,
  }
}

/** 读取 localStorage；优先 v2，缺失时回退 v1 并视为分镜格节点迁移 */
function readStoredState() {
  try {
    const rawV2 = localStorage.getItem(COMIC_CANVAS_STORAGE_KEY)
    if (rawV2) {
      const parsed = JSON.parse(rawV2)
      if (parsed && Array.isArray(parsed.nodes)) {
        return { nodes: parsed.nodes, edges: Array.isArray(parsed.edges) ? parsed.edges : [], viewport: parsed.viewport }
      }
    }
    const rawV1 = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (rawV1) {
      const parsed = JSON.parse(rawV1)
      if (parsed && Array.isArray(parsed.panels)) {
        // v1 → v2：panels 全部是 panel 类型节点，无连线
        return {
          nodes: parsed.panels.map((p) => ({ ...p, type: 'panel' })),
          edges: [],
          viewport: parsed.viewport,
        }
      }
    }
    return null
  } catch {
    return null
  }
}

export const useComicCanvasStore = defineStore('comicCanvas', {
  state: () => ({
    /** @type {Array<object>} 画布节点（含 type 字段） */
    nodes: [],
    /** @type {Array<{id:string,from:string,to:string}>} 节点连线（from 输出 → to 输入） */
    edges: [],
    /** @type {Array<string>} 多选节点 ID */
    selectedIds: [],
    /** 单独选中的连线 ID（与节点多选互斥） */
    selectedEdgeId: '',
    viewport: { x: 60, y: 40, zoom: 1 },
    /** 单调递增的图层序号，新节点/置顶时取 ++nextZ */
    nextZ: 1,
  }),

  getters: {
    /** 按图层从下到上排序（渲染顺序） */
    sortedNodes(state) {
      return [...state.nodes].sort((a, b) => a.z - b.z)
    },
    /** 恰好选中一个节点时返回该节点，否则 null（驱动属性检查器） */
    selectedNode(state) {
      if (state.selectedIds.length !== 1) return null
      return state.nodes.find((n) => n.id === state.selectedIds[0]) || null
    },
    selectedEdge(state) {
      return state.edges.find((e) => e.id === state.selectedEdgeId) || null
    },
    /** 分镜格在播放顺序中的序号（按 z 排序，即创作顺序；仅 panel 类型参与编号） */
    panelIndexMap(state) {
      const map = {}
      ;[...state.nodes]
        .filter((n) => n.type === 'panel')
        .sort((a, b) => a.z - b.z)
        .forEach((n, idx) => {
          map[n.id] = idx + 1
        })
      return map
    },
    /** 输出连线的邻接表：nodeId → [toNodeId] */
    adjacency(state) {
      const map = {}
      state.edges.forEach((e) => {
        if (!map[e.from]) map[e.from] = []
        map[e.from].push(e.to)
      })
      return map
    },
  },

  actions: {
    /**
     * 添加节点
     * @param {string} type 节点类型（text/image/video/panel）
     * @param {{x:number,y:number}} [center] 世界坐标下的放置中心点
     * @param {{ratio?:string}} [options] panel 类型可指定比例预设
     * @returns {object|null} 新节点；超出节点上限时返回 null
     */
    addNode(type, center, options = {}) {
      if (this.nodes.length >= MAX_NODE_COUNT) return null

      let size = NODE_DEFAULT_SIZES[type]
      let ratio = ''
      if (type === 'panel') {
        const preset =
          PANEL_RATIO_PRESETS.find((item) => item.ratio === options.ratio) ||
          PANEL_RATIO_PRESETS[0]
        size = preset
        ratio = preset.ratio
      }
      if (!size) size = NODE_DEFAULT_SIZES.text

      // 级联偏移，避免连续添加的节点完全重叠
      const cascade = (this.nodes.length % 5) * 28
      const cx = center?.x ?? 0
      const cy = center?.y ?? 0

      const node = {
        id: createNodeId(),
        type,
        x: Math.round(cx - size.width / 2 + cascade),
        y: Math.round(cy - size.height / 2 + cascade),
        width: size.width,
        height: size.height,
        z: this.nextZ++,
        ratio,
        prompt: '',
        text: '',
        dialogue: '',
        image: '',
        disabled: false,
      }
      this.nodes.push(node)
      this.setSelection([node.id])
      return node
    },

    /** 兼容旧调用：添加分镜格 */
    addPanel(ratio, center) {
      return this.addNode('panel', center, { ratio })
    },

    /** 局部更新节点字段 */
    updateNode(id, patch) {
      const node = this.nodes.find((n) => n.id === id)
      if (!node) return
      Object.assign(node, patch)
    },

    updatePanel(id, patch) {
      this.updateNode(id, patch)
    },

    moveNode(id, x, y) {
      this.updateNode(id, { x: Math.round(x), y: Math.round(y) })
    },

    resizeNode(id, { x, y, width, height }) {
      this.updateNode(id, {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.max(MIN_NODE_WIDTH, Math.round(width)),
        height: Math.max(MIN_NODE_HEIGHT, Math.round(height)),
      })
    },

    /**
     * 选中节点
     * @param {string} id 节点 ID
     * @param {boolean} [additive] true 时切换加选（用于 Shift 点击）
     */
    selectNode(id, additive = false) {
      this.selectedEdgeId = ''
      if (!id) {
        this.selectedIds = []
        return
      }
      if (additive) {
        this.selectedIds = this.selectedIds.includes(id)
          ? this.selectedIds.filter((item) => item !== id)
          : [...this.selectedIds, id]
      } else {
        this.selectedIds = [id]
      }
    },

    setSelection(ids) {
      this.selectedEdgeId = ''
      this.selectedIds = [...new Set(ids)].filter((id) => this.nodes.some((n) => n.id === id))
    },

    clearSelection() {
      this.selectedIds = []
      this.selectedEdgeId = ''
    },

    selectEdge(id) {
      this.selectedIds = []
      this.selectedEdgeId = id || ''
    },

    /** 删除节点及其关联连线 */
    deleteNode(id) {
      const idx = this.nodes.findIndex((n) => n.id === id)
      if (idx === -1) return
      this.nodes.splice(idx, 1)
      this.edges = this.edges.filter((e) => e.from !== id && e.to !== id)
      this.selectedIds = this.selectedIds.filter((item) => item !== id)
      if (this.selectedEdgeId && !this.edges.some((e) => e.id === this.selectedEdgeId)) {
        this.selectedEdgeId = ''
      }
    },

    deletePanel(id) {
      this.deleteNode(id)
    },

    /** 删除所有选中节点（含关联连线） */
    deleteSelected() {
      const ids = new Set(this.selectedIds)
      if (!ids.size) return
      this.nodes = this.nodes.filter((n) => !ids.has(n.id))
      this.edges = this.edges.filter((e) => !ids.has(e.from) && !ids.has(e.to))
      this.selectedIds = []
      if (this.selectedEdgeId && !this.edges.some((e) => e.id === this.selectedEdgeId)) {
        this.selectedEdgeId = ''
      }
    },

    /** 复制节点（含内容，不含连线），偏移放置并选中新节点 */
    duplicateNode(id) {
      const source = this.nodes.find((n) => n.id === id)
      if (!source || this.nodes.length >= MAX_NODE_COUNT) return null
      const copy = {
        ...source,
        id: createNodeId(),
        x: source.x + 32,
        y: source.y + 32,
        z: this.nextZ++,
      }
      this.nodes.push(copy)
      this.setSelection([copy.id])
      return copy
    },

    duplicatePanel(id) {
      return this.duplicateNode(id)
    },

    bringToFront(id) {
      const node = this.nodes.find((n) => n.id === id)
      if (!node) return
      node.z = this.nextZ++
    },

    sendToBack(id) {
      const node = this.nodes.find((n) => n.id === id)
      if (!node || !this.nodes.length) return
      const minZ = Math.min(...this.nodes.map((n) => n.z))
      node.z = minZ - 1
    },

    /** 禁用/启用节点（禁用仅作标记，为后续工作流执行跳过该节点预留） */
    toggleDisable(id) {
      const node = this.nodes.find((n) => n.id === id)
      if (!node) return
      node.disabled = !node.disabled
    },

    /**
     * 建立连线（from 输出 → to 输入）
     * 校验：两端节点存在、非自连、非重复、不成环。
     * @returns {object|null} 新连线；校验失败返回 null
     */
    addEdge(from, to) {
      if (!from || !to || from === to) return null
      if (!this.nodes.some((n) => n.id === from) || !this.nodes.some((n) => n.id === to)) {
        return null
      }
      if (this.edges.some((e) => e.from === from && e.to === to)) return null
      // 防环：若 to 已能沿连线到达 from，则 from→to 会成环
      if (this.isReachable(to, from)) return null

      const edge = { id: createEdgeId(), from, to }
      this.edges.push(edge)
      return edge
    },

    /** 判断沿有向连线从 startId 能否到达 targetId（DFS） */
    isReachable(startId, targetId) {
      const visited = new Set()
      const stack = [startId]
      while (stack.length) {
        const current = stack.pop()
        if (current === targetId) return true
        if (visited.has(current)) continue
        visited.add(current)
        ;(this.adjacency[current] || []).forEach((next) => stack.push(next))
      }
      return false
    },

    removeEdge(id) {
      this.edges = this.edges.filter((e) => e.id !== id)
      if (this.selectedEdgeId === id) this.selectedEdgeId = ''
    },

    /** 断开某节点的全部连线（右键菜单「断开连线」） */
    removeEdgesOf(nodeId) {
      this.edges = this.edges.filter((e) => e.from !== nodeId && e.to !== nodeId)
    },

    clearCanvas() {
      this.nodes = []
      this.edges = []
      this.selectedIds = []
      this.selectedEdgeId = ''
    },

    setViewport(patch) {
      const next = { ...this.viewport, ...patch }
      next.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next.zoom))
      this.viewport = next
    },

    resetViewport() {
      this.viewport = { x: 60, y: 40, zoom: 1 }
    },

    /** 让所有节点适配到可视区域（由页面传入容器尺寸） */
    fitViewportToContent(containerWidth, containerHeight) {
      if (!this.nodes.length || !containerWidth || !containerHeight) {
        this.resetViewport()
        return
      }
      const minX = Math.min(...this.nodes.map((n) => n.x))
      const minY = Math.min(...this.nodes.map((n) => n.y))
      const maxX = Math.max(...this.nodes.map((n) => n.x + n.width))
      const maxY = Math.max(...this.nodes.map((n) => n.y + n.height))
      const contentW = Math.max(maxX - minX, 1)
      const contentH = Math.max(maxY - minY, 1)
      const padding = 80

      const zoom = Math.min(
        MAX_ZOOM,
        Math.max(
          MIN_ZOOM,
          Math.min(
            (containerWidth - padding * 2) / contentW,
            (containerHeight - padding * 2) / contentH,
          ),
        ),
      )
      this.viewport = {
        zoom,
        x: Math.round((containerWidth - contentW * zoom) / 2 - minX * zoom),
        y: Math.round((containerHeight - contentH * zoom) / 2 - minY * zoom),
      }
    },

    /** 从 localStorage 恢复画布状态（页面挂载时调用一次；兼容 v1 数据迁移） */
    loadFromStorage() {
      const stored = readStoredState()
      if (!stored) return
      this.nodes = stored.nodes.map(normalizeNode).filter(Boolean)
      const nodeIds = new Set(this.nodes.map((n) => n.id))
      this.edges = stored.edges
        .filter((e) => e && nodeIds.has(String(e.from)) && nodeIds.has(String(e.to)))
        .map((e) => ({ id: String(e.id || createEdgeId()), from: String(e.from), to: String(e.to) }))
      this.nextZ = Math.max(0, ...this.nodes.map((n) => n.z)) + 1
      if (stored.viewport && Number.isFinite(stored.viewport.zoom)) {
        this.setViewport(stored.viewport)
      }
      this.clearSelection()
    },

    /** 持久化到 localStorage（超出配额时静默失败，不影响编辑） */
    saveToStorage() {
      try {
        localStorage.setItem(
          COMIC_CANVAS_STORAGE_KEY,
          JSON.stringify({ nodes: this.nodes, edges: this.edges, viewport: this.viewport }),
        )
      } catch {
        // 图片体积过大导致超配额时忽略，保持当前会话可继续编辑
      }
    },
  },
})
