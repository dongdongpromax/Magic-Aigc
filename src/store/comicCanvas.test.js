import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  useComicCanvasStore,
  COMIC_CANVAS_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  MIN_NODE_WIDTH,
  MIN_ZOOM,
  MAX_ZOOM,
  MAX_NODE_COUNT,
} from './comicCanvas'

describe('comicCanvas store（节点式画布）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  describe('节点创建', () => {
    it('addPanel 按预设比例创建分镜格并自动选中', () => {
      const store = useComicCanvasStore()

      const panel = store.addPanel('16:9', { x: 500, y: 400 })

      expect(panel.type).toBe('panel')
      expect(panel.ratio).toBe('16:9')
      expect(panel.width).toBe(480)
      expect(panel.height).toBe(270)
      // 以中心点放置
      expect(panel.x).toBe(500 - 240)
      expect(panel.y).toBe(400 - 135)
      expect(store.selectedIds).toEqual([panel.id])
      expect(store.nodes).toHaveLength(1)
    })

    it('addNode 支持文本/图片/视频类型并使用默认尺寸', () => {
      const store = useComicCanvasStore()

      const text = store.addNode('text', { x: 0, y: 0 })
      const image = store.addNode('image', { x: 0, y: 0 })
      const video = store.addNode('video', { x: 0, y: 0 })

      expect(text.type).toBe('text')
      expect(image.type).toBe('image')
      expect(video.type).toBe('video')
      expect(store.nodes).toHaveLength(3)
    })

    it(`节点数达到 ${MAX_NODE_COUNT} 上限后 addNode 返回 null`, () => {
      const store = useComicCanvasStore()
      for (let i = 0; i < MAX_NODE_COUNT; i += 1) {
        store.addNode('text')
      }

      expect(store.nodes).toHaveLength(MAX_NODE_COUNT)
      expect(store.addNode('text')).toBeNull()
    })
  })

  describe('节点编辑', () => {
    it('moveNode / resizeNode 更新几何并遵守最小尺寸', () => {
      const store = useComicCanvasStore()
      const node = store.addNode('image')

      store.moveNode(node.id, 120.6, 80.2)
      expect(store.nodes[0].x).toBe(121)
      expect(store.nodes[0].y).toBe(80)

      store.resizeNode(node.id, { x: 0, y: 0, width: 10, height: 20 })
      expect(store.nodes[0].width).toBe(MIN_NODE_WIDTH)
    })

    it('duplicateNode 复制内容并置于顶层选中（不含连线）', () => {
      const store = useComicCanvasStore()
      const a = store.addPanel('4:3')
      const b = store.addNode('text')
      store.updateNode(a.id, { prompt: '雨夜天台', dialogue: '你来了' })
      store.addEdge(b.id, a.id)

      const copy = store.duplicateNode(a.id)

      expect(copy.id).not.toBe(a.id)
      expect(copy.prompt).toBe('雨夜天台')
      expect(copy.dialogue).toBe('你来了')
      expect(copy.z).toBeGreaterThan(a.z)
      expect(store.selectedIds).toEqual([copy.id])
      // 连线不随复制走
      expect(store.edges).toHaveLength(1)
    })

    it('bringToFront / sendToBack 调整图层顺序', () => {
      const store = useComicCanvasStore()
      const a = store.addNode('image')
      const b = store.addNode('image')

      store.sendToBack(b.id)
      expect(store.sortedNodes[0].id).toBe(b.id)

      store.bringToFront(a.id)
      expect(store.sortedNodes.at(-1).id).toBe(a.id)
    })

    it('toggleDisable 切换禁用标记', () => {
      const store = useComicCanvasStore()
      const node = store.addNode('text')

      store.toggleDisable(node.id)
      expect(store.nodes[0].disabled).toBe(true)
      store.toggleDisable(node.id)
      expect(store.nodes[0].disabled).toBe(false)
    })
  })

  describe('连线', () => {
    it('addEdge 建立 输出→输入 关系', () => {
      const store = useComicCanvasStore()
      const a = store.addNode('text')
      const b = store.addNode('image')

      const edge = store.addEdge(a.id, b.id)

      expect(edge).not.toBeNull()
      expect(store.edges).toHaveLength(1)
      expect(store.edges[0]).toMatchObject({ from: a.id, to: b.id })
    })

    it('addEdge 拒绝自连、重复连线和缺失节点', () => {
      const store = useComicCanvasStore()
      const a = store.addNode('text')
      const b = store.addNode('image')

      expect(store.addEdge(a.id, a.id)).toBeNull()
      expect(store.addEdge(a.id, 'missing')).toBeNull()
      store.addEdge(a.id, b.id)
      expect(store.addEdge(a.id, b.id)).toBeNull()
      expect(store.edges).toHaveLength(1)
    })

    it('addEdge 拒绝成环（a→b→c 后不能再 c→a）', () => {
      const store = useComicCanvasStore()
      const a = store.addNode('text')
      const b = store.addNode('image')
      const c = store.addNode('video')

      store.addEdge(a.id, b.id)
      store.addEdge(b.id, c.id)

      expect(store.addEdge(c.id, a.id)).toBeNull()
      expect(store.edges).toHaveLength(2)
    })

    it('deleteNode 级联删除关联连线', () => {
      const store = useComicCanvasStore()
      const a = store.addNode('text')
      const b = store.addNode('image')
      const c = store.addNode('video')
      store.addEdge(a.id, b.id)
      store.addEdge(b.id, c.id)

      store.deleteNode(b.id)

      expect(store.nodes).toHaveLength(2)
      expect(store.edges).toHaveLength(0)
    })

    it('removeEdgesOf 断开节点全部连线', () => {
      const store = useComicCanvasStore()
      const a = store.addNode('text')
      const b = store.addNode('image')
      const c = store.addNode('video')
      store.addEdge(a.id, b.id)
      store.addEdge(c.id, b.id)

      store.removeEdgesOf(b.id)

      expect(store.edges).toHaveLength(0)
    })

    it('removeEdge 删除并清空连线选中态', () => {
      const store = useComicCanvasStore()
      const a = store.addNode('text')
      const b = store.addNode('image')
      const edge = store.addEdge(a.id, b.id)
      store.selectEdge(edge.id)

      store.removeEdge(edge.id)

      expect(store.edges).toHaveLength(0)
      expect(store.selectedEdgeId).toBe('')
    })
  })

  describe('多选', () => {
    it('selectNode additive 模式支持加选/减选', () => {
      const store = useComicCanvasStore()
      const a = store.addNode('text')
      const b = store.addNode('text')

      store.selectNode(a.id)
      store.selectNode(b.id, true)
      expect(store.selectedIds).toEqual([a.id, b.id])

      store.selectNode(a.id, true)
      expect(store.selectedIds).toEqual([b.id])
    })

    it('deleteSelected 批量删除节点及其连线', () => {
      const store = useComicCanvasStore()
      const a = store.addNode('text')
      const b = store.addNode('image')
      const c = store.addNode('video')
      store.addEdge(a.id, b.id)
      store.addEdge(b.id, c.id)

      store.setSelection([a.id, b.id])
      store.deleteSelected()

      expect(store.nodes.map((n) => n.id)).toEqual([c.id])
      expect(store.edges).toHaveLength(0)
      expect(store.selectedIds).toEqual([])
    })

    it('selectedNode 仅在恰好单选时返回节点', () => {
      const store = useComicCanvasStore()
      const a = store.addNode('text')
      const b = store.addNode('text')

      store.selectNode(a.id)
      expect(store.selectedNode?.id).toBe(a.id)

      store.selectNode(b.id, true)
      expect(store.selectedNode).toBeNull()
    })
  })

  describe('视口', () => {
    it('setViewport 将缩放夹紧在 20% – 400%', () => {
      const store = useComicCanvasStore()

      store.setViewport({ zoom: 100 })
      expect(store.viewport.zoom).toBe(MAX_ZOOM)

      store.setViewport({ zoom: 0.001 })
      expect(store.viewport.zoom).toBe(MIN_ZOOM)
    })
  })

  describe('持久化', () => {
    it('clearCanvas 清空节点与连线', () => {
      const store = useComicCanvasStore()
      const a = store.addNode('text')
      const b = store.addNode('image')
      store.addEdge(a.id, b.id)

      store.clearCanvas()

      expect(store.nodes).toHaveLength(0)
      expect(store.edges).toHaveLength(0)
      expect(store.selectedIds).toEqual([])
    })

    it('saveToStorage + loadFromStorage 往返恢复节点、连线与视口', () => {
      const store = useComicCanvasStore()
      const a = store.addPanel('16:9', { x: 300, y: 200 })
      const b = store.addNode('text')
      store.updateNode(a.id, { prompt: '雨夜天台', image: 'data:image/jpeg;base64,xx' })
      store.addEdge(b.id, a.id)
      store.setViewport({ x: 123, y: 45, zoom: 1.5 })
      store.saveToStorage()

      // 模拟刷新：新 pinia 实例 + 从 localStorage 恢复
      setActivePinia(createPinia())
      const restored = useComicCanvasStore()
      restored.loadFromStorage()

      expect(restored.nodes).toHaveLength(2)
      expect(restored.edges).toHaveLength(1)
      const restoredPanel = restored.nodes.find((n) => n.type === 'panel')
      expect(restoredPanel.prompt).toBe('雨夜天台')
      expect(restoredPanel.image).toBe('data:image/jpeg;base64,xx')
      expect(restored.viewport).toEqual({ x: 123, y: 45, zoom: 1.5 })
      // 恢复后新节点 z 不冲突
      const added = restored.addNode('text')
      expect(added.z).toBeGreaterThan(restoredPanel.z)
    })

    it('v1 旧数据（纯分镜格）自动迁移为 panel 节点', () => {
      localStorage.setItem(
        LEGACY_STORAGE_KEY,
        JSON.stringify({
          panels: [
            {
              id: 'panel-1',
              x: 10,
              y: 20,
              width: 480,
              height: 270,
              z: 1,
              ratio: '16:9',
              prompt: '旧数据',
              dialogue: 'hi',
              image: '',
            },
          ],
          viewport: { x: 1, y: 2, zoom: 0.8 },
        }),
      )
      const store = useComicCanvasStore()

      store.loadFromStorage()

      expect(store.nodes).toHaveLength(1)
      expect(store.nodes[0].type).toBe('panel')
      expect(store.nodes[0].prompt).toBe('旧数据')
      expect(store.viewport.zoom).toBe(0.8)
    })

    it('localStorage 数据损坏时 loadFromStorage 静默回退为空画布', () => {
      localStorage.setItem(COMIC_CANVAS_STORAGE_KEY, '{broken json')
      const store = useComicCanvasStore()

      store.loadFromStorage()

      expect(store.nodes).toHaveLength(0)
      expect(store.edges).toHaveLength(0)
    })

    it('loadFromStorage 丢弃指向缺失节点的连线', () => {
      localStorage.setItem(
        COMIC_CANVAS_STORAGE_KEY,
        JSON.stringify({
          nodes: [
            {
              id: 'n1',
              type: 'text',
              x: 0,
              y: 0,
              width: 280,
              height: 160,
              z: 1,
            },
          ],
          edges: [
            { id: 'e1', from: 'n1', to: 'ghost' },
            { id: 'e2', from: 'ghost', to: 'n1' },
          ],
          viewport: { x: 0, y: 0, zoom: 1 },
        }),
      )
      const store = useComicCanvasStore()

      store.loadFromStorage()

      expect(store.nodes).toHaveLength(1)
      expect(store.edges).toHaveLength(0)
    })
  })
})
