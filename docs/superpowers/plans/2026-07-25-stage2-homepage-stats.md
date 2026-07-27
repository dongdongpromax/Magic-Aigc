# 阶段 2：门户首页 + 使用统计 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增门户首页（HomePage）作为应用入口，展示功能入口卡片、使用统计、最近创作会话；根路径 `/` 指向 HomePage；后端新增 `GET /api/stats/summary` 聚合 usage_logs 统计。

**Architecture:** 后端在 usageLogRepository 加 `countByType()` 方法，新建 stats 路由模块聚合统计。前端新建 statsApi 封装 + HomePage.vue（三区块布局），路由根路径从重定向 /chat 改为渲染 HomePage。

**Tech Stack:** Vue 3, vue-router, pinia, Express, vitest

---

## 文件结构

**创建：**
- `server/src/modules/stats/routes.js` — stats 路由（GET /stats/summary）
- `server/src/modules/stats/routes.test.js` — stats 路由测试
- `src/services/statsApi.js` — 前端 stats API 封装
- `src/services/statsApi.test.js` — statsApi 测试
- `src/views/HomePage.vue` — 门户首页
- `src/views/HomePage.test.js` — HomePage 测试

**修改：**
- `server/src/db/repositories/usageLogRepository.js` — 加 `countByType()` 方法
- `server/src/db/repositories/usageLogRepository.test.js` — 加 countByType 测试
- `server/src/app.js` — 注册 stats 路由
- `src/router/index.js` — 根路径指向 HomePage

---

### Task 1: 后端 usageLogRepository.countByType + 测试

**Files:**
- Modify: `server/src/db/repositories/usageLogRepository.js`
- Modify: `server/src/db/repositories/usageLogRepository.test.js`

- [ ] **Step 1: 编写失败测试**

在 `usageLogRepository.test.js` 末尾 `})` 前追加：

```js
  it('countByType 按 type 聚合返回 image/video/total 计数', async () => {
    const query = vi.fn().mockResolvedValueOnce([
      [
        { type: 'image', cnt: 12 },
        { type: 'video', cnt: 5 },
      ],
    ])
    const repository = createUsageLogRepository({ query })

    const result = await repository.countByType()

    expect(result).toEqual({ image: 12, video: 5, total: 17 })
    expect(query).toHaveBeenCalledWith(
      'SELECT type, COUNT(*) AS cnt FROM usage_logs GROUP BY type',
    )
  })

  it('countByType 无数据时返回全 0', async () => {
    const query = vi.fn().mockResolvedValueOnce([[]])
    const repository = createUsageLogRepository({ query })

    const result = await repository.countByType()

    expect(result).toEqual({ image: 0, video: 0, total: 0 })
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run server/src/db/repositories/usageLogRepository.test.js`
Expected: FAIL — countByType is not a function

- [ ] **Step 3: 实现 countByType**

在 `usageLogRepository.js` 的 return 对象内（deleteAll 方法后）追加：

```js
    /** 按 type 聚合统计：返回 { image, video, total } */
    async countByType() {
      const [rows] = await pool.query(
        'SELECT type, COUNT(*) AS cnt FROM usage_logs GROUP BY type',
      )
      const result = { image: 0, video: 0, total: 0 }
      for (const row of rows) {
        if (row.type === 'image') result.image = Number(row.cnt)
        if (row.type === 'video') result.video = Number(row.cnt)
        result.total += Number(row.cnt)
      }
      return result
    },
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run server/src/db/repositories/usageLogRepository.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/db/repositories/usageLogRepository.js server/src/db/repositories/usageLogRepository.test.js
git commit -m "feat(stats): usageLogRepository 新增 countByType 聚合统计方法"
```

---

### Task 2: 后端 stats 路由 + 测试

**Files:**
- Create: `server/src/modules/stats/routes.js`
- Create: `server/src/modules/stats/routes.test.js`
- Modify: `server/src/app.js`

- [ ] **Step 1: 编写失败测试**

创建 `server/src/modules/stats/routes.test.js`：

```js
import { describe, expect, it, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createStatsRoutes } from './routes.js'

describe('createStatsRoutes', () => {
  it('GET /stats/summary 返回 totalGenerations/imageCount/videoCount', async () => {
    const usageLogRepository = {
      countByType: vi.fn().mockResolvedValue({ image: 12, video: 5, total: 17 }),
    }
    const app = express()
    app.use('/api', createStatsRoutes({ usageLogRepository }))

    const res = await request(app).get('/api/stats/summary')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      totalGenerations: 17,
      imageCount: 12,
      videoCount: 5,
    })
    expect(usageLogRepository.countByType).toHaveBeenCalled()
  })

  it('repository 抛错时走错误中间件返回 500', async () => {
    const usageLogRepository = {
      countByType: vi.fn().mockRejectedValue(new Error('DB 超时')),
    }
    const app = express()
    app.use('/api', createStatsRoutes({ usageLogRepository }))
    app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }))

    const res = await request(app).get('/api/stats/summary')

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('DB 超时')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run server/src/modules/stats/routes.test.js`
Expected: FAIL — routes.js 不存在

- [ ] **Step 3: 实现 stats 路由**

创建 `server/src/modules/stats/routes.js`：

```js
import { Router } from 'express'

/**
 * 创建统计路由
 *
 * 端点：
 * - GET /stats/summary  返回生成次数汇总（totalGenerations/imageCount/videoCount）
 *
 * 阶段 3 prompts 表建好后，在此追加 promptCount 字段。
 *
 * @param {{ usageLogRepository: object }} deps 依赖注入
 */
export function createStatsRoutes({ usageLogRepository }) {
  const router = Router()

  /** 生成次数汇总：从 usage_logs 按 type 聚合 */
  router.get('/stats/summary', async (_req, res, next) => {
    try {
      const stats = await usageLogRepository.countByType()
      res.json({
        totalGenerations: stats.total,
        imageCount: stats.image,
        videoCount: stats.video,
      })
    } catch (error) {
      next(error)
    }
  })

  return router
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run server/src/modules/stats/routes.test.js`
Expected: PASS

- [ ] **Step 5: 在 app.js 注册 stats 路由**

修改 `server/src/app.js`，在 `import { createUsageLogRoutes }` 后追加导入：

```js
import { createStatsRoutes } from './modules/stats/routes.js'
```

在 `app.use('/api', createUsageLogRoutes(...))` 行后追加：

```js
  app.use('/api', createStatsRoutes({ usageLogRepository: deps.usageLogRepository }))
```

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/stats/ server/src/app.js
git commit -m "feat(stats): 新增 GET /api/stats/summary 统计端点"
```

---

### Task 3: 前端 statsApi + 测试

**Files:**
- Create: `src/services/statsApi.js`
- Create: `src/services/statsApi.test.js`

- [ ] **Step 1: 编写失败测试**

创建 `src/services/statsApi.test.js`：

```js
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getStatsSummary } from './statsApi'

describe('statsApi', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('getStatsSummary 调用 /api/stats/summary 并返回统计数据', async () => {
    const getMock = vi.fn().mockResolvedValue({
      data: { totalGenerations: 17, imageCount: 12, videoCount: 5 },
    })
    vi.doMock('./backendClient', () => ({ backendClient: { get: getMock } }))

    const { getStatsSummary } = await import('./statsApi')
    const result = await getStatsSummary()

    expect(getMock).toHaveBeenCalledWith('/api/stats/summary')
    expect(result).toEqual({ totalGenerations: 17, imageCount: 12, videoCount: 5 })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/services/statsApi.test.js`
Expected: FAIL — statsApi.js 不存在

- [ ] **Step 3: 实现 statsApi**

创建 `src/services/statsApi.js`：

```js
import { backendClient } from './backendClient'

/**
 * 统计 API
 *
 * 对接后端 /api/stats/summary 端点，返回生成次数汇总。
 */

/**
 * 获取生成次数汇总统计
 * @returns {Promise<{ totalGenerations: number, imageCount: number, videoCount: number }>}
 */
export async function getStatsSummary() {
  const response = await backendClient.get('/api/stats/summary')
  return response.data
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/services/statsApi.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/statsApi.js src/services/statsApi.test.js
git commit -m "feat(stats): 前端 statsApi 封装统计端点调用"
```

---

### Task 4: HomePage 组件 + 测试

**Files:**
- Create: `src/views/HomePage.vue`
- Create: `src/views/HomePage.test.js`

- [ ] **Step 1: 编写失败测试**

创建 `src/views/HomePage.test.js`：

```js
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import HomePage from './HomePage.vue'
import { createTestRouter } from '@/test/testRouter'

vi.mock('@/services/statsApi', () => ({
  getStatsSummary: vi.fn().mockResolvedValue({
    totalGenerations: 17,
    imageCount: 12,
    videoCount: 5,
  }),
}))

describe('HomePage', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('渲染四个功能入口卡片', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createTestRouter()
    await router.isReady()

    const wrapper = mount(HomePage, { global: { plugins: [pinia, router] } })
    await flushPromises()

    const cards = wrapper.findAll('[data-role="entry-card"]')
    expect(cards).toHaveLength(4)
    expect(wrapper.text()).toContain('聊天创作')
    expect(wrapper.text()).toContain('创作画布')
    expect(wrapper.text()).toContain('提示词库')
    expect(wrapper.text()).toContain('使用日志')
  })

  it('渲染使用统计数字', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createTestRouter()
    await router.isReady()

    const wrapper = mount(HomePage, { global: { plugins: [pinia, router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('17')
    expect(wrapper.text()).toContain('12')
    expect(wrapper.text()).toContain('5')
  })

  it('点击功能入口卡片跳转对应路由', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createTestRouter()
    await router.isReady()

    const wrapper = mount(HomePage, { global: { plugins: [pinia, router] } })
    await flushPromises()

    const chatCard = wrapper.find('[data-role="entry-card"][data-path="/chat"]')
    await chatCard.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/chat')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/HomePage.test.js`
Expected: FAIL — HomePage.vue 不存在

- [ ] **Step 3: 实现 HomePage 组件**

创建 `src/views/HomePage.vue`：

```vue
<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  MessageSquare,
  Clapperboard,
  Library,
  ScrollText,
  ImageIcon,
  VideoIcon,
  Sparkles,
} from 'lucide-vue-next'
import { useChatStore } from '@/store/chat'
import { getStatsSummary } from '@/services/statsApi'

const router = useRouter()
const chatStore = useChatStore()

// 功能入口配置
const entries = [
  { label: '聊天创作', desc: '对话式图像/视频生成', path: '/chat', icon: MessageSquare },
  { label: '创作画布', desc: '漫剧自由画布', path: '/canvas', icon: Clapperboard },
  { label: '提示词库', desc: '提示词管理与复用', path: '/prompts', icon: Library },
  { label: '使用日志', desc: '生成记录与详情', path: '/logs', icon: ScrollText },
]

// 使用统计
const stats = ref({ totalGenerations: 0, imageCount: 0, videoCount: 0 })
const isLoadingStats = ref(false)

// 最近创作会话（取最近 8 个）
const recentTopics = ref([])

onMounted(async () => {
  isLoadingStats.value = true
  try {
    stats.value = await getStatsSummary()
  } catch {
    // 统计加载失败不阻塞页面
  } finally {
    isLoadingStats.value = false
  }

  // 从 chatStore 取最近会话，按 updatedAt 降序取前 8
  recentTopics.value = [...chatStore.topics]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 8)
})

/** 点击功能入口跳转 */
function goEntry(path) {
  router.push(path)
}

/** 点击最近会话跳转并选中 */
function goTopic(topicId) {
  router.push('/chat')
  chatStore.selectTopic(topicId)
}

/** 取会话封面（图/视频首帧） */
function topicCover(topic) {
  return topic.coverUrl || ''
}
</script>

<template>
  <div class="home-page">
    <!-- ① 功能入口卡片 -->
    <section class="section">
      <h3 class="section-title">功能入口</h3>
      <div class="entry-grid">
        <button
          v-for="entry in entries"
          :key="entry.path"
          type="button"
          class="entry-card"
          data-role="entry-card"
          :data-path="entry.path"
          @click="goEntry(entry.path)"
        >
          <div class="entry-icon">
            <component :is="entry.icon" :size="22" />
          </div>
          <div class="entry-text">
            <span class="entry-label">{{ entry.label }}</span>
            <span class="entry-desc">{{ entry.desc }}</span>
          </div>
        </button>
      </div>
    </section>

    <!-- ② 使用统计 -->
    <section class="section">
      <h3 class="section-title">使用统计</h3>
      <div class="stats-grid">
        <div class="stat-card">
          <Sparkles :size="18" class="stat-icon" />
          <div class="stat-body">
            <span class="stat-value">{{ stats.totalGenerations }}</span>
            <span class="stat-label">累计生成</span>
          </div>
        </div>
        <div class="stat-card">
          <ImageIcon :size="18" class="stat-icon" />
          <div class="stat-body">
            <span class="stat-value">{{ stats.imageCount }}</span>
            <span class="stat-label">图片生成</span>
          </div>
        </div>
        <div class="stat-card">
          <VideoIcon :size="18" class="stat-icon" />
          <div class="stat-body">
            <span class="stat-value">{{ stats.videoCount }}</span>
            <span class="stat-label">视频生成</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ③ 最近创作会话 -->
    <section class="section">
      <h3 class="section-title">最近创作</h3>
      <div v-if="recentTopics.length" class="recent-row">
        <button
          v-for="topic in recentTopics"
          :key="topic.id"
          type="button"
          class="recent-item"
          @click="goTopic(topic.id)"
        >
          <div class="recent-cover">
            <img v-if="topicCover(topic)" :src="topicCover(topic)" :alt="topic.title" loading="lazy" />
            <MessageSquare v-else :size="20" class="recent-placeholder" />
          </div>
          <span class="recent-title">{{ topic.title }}</span>
        </button>
      </div>
      <p v-else class="empty-hint">暂无创作会话，点击「聊天创作」开始</p>
    </section>
  </div>
</template>

<style lang="scss" scoped>
@import '@/styles/variables.scss';

.home-page {
  height: 100%;
  overflow-y: auto;
  padding: 32px 40px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: $text-primary;
  padding-left: 8px;
  border-left: 2px solid rgba(119, 168, 255, 0.6);
  line-height: 1.2;
}

/* 功能入口卡片网格 */
.entry-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.entry-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  background: rgba(18, 22, 28, 0.6);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;

  &:hover {
    border-color: rgba(119, 168, 255, 0.3);
    background: rgba(119, 168, 255, 0.06);
  }
}

.entry-icon {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(119, 168, 255, 0.1);
  color: rgba(119, 168, 255, 0.9);
  flex-shrink: 0;
}

.entry-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.entry-label {
  font-size: 14px;
  font-weight: 600;
  color: $text-primary;
}

.entry-desc {
  font-size: 12px;
  color: $text-secondary;
}

/* 统计卡片 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  background: rgba(18, 22, 28, 0.6);
}

.stat-icon {
  color: rgba(119, 168, 255, 0.8);
  flex-shrink: 0;
}

.stat-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: $text-primary;
  line-height: 1.1;
}

.stat-label {
  font-size: 12px;
  color: $text-secondary;
}

/* 最近创作会话 */
.recent-row {
  display: flex;
  gap: 14px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.recent-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
  width: 140px;
}

.recent-cover {
  width: 140px;
  height: 100px;
  border-radius: 3px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(18, 22, 28, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.recent-placeholder {
  color: $text-secondary;
}

.recent-title {
  font-size: 12px;
  color: $text-secondary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
}

.empty-hint {
  margin: 0;
  font-size: 13px;
  color: $text-secondary;
}
</style>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/views/HomePage.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/HomePage.vue src/views/HomePage.test.js
git commit -m "feat(home): 新增门户首页（功能入口+使用统计+最近创作）"
```

---

### Task 5: 路由调整 + 全量测试

**Files:**
- Modify: `src/router/index.js`

- [ ] **Step 1: 修改根路由指向 HomePage**

修改 `src/router/index.js`，将根路径从 redirect 改为渲染 HomePage（套 MainLayout）：

```js
  {
    path: '/',
    component: MainLayout,
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('@/views/HomePage.vue'),
      },
    ],
  },
```

删除原 `redirect: '/chat'`。

- [ ] **Step 2: 运行全量测试**

Run: `npx vitest run`
Expected: 全部通过

- [ ] **Step 3: Commit**

```bash
git add src/router/index.js
git commit -m "feat(router): 根路径指向门户首页 HomePage"
```

---

## 完成标准

- GET /api/stats/summary 返回 totalGenerations/imageCount/videoCount
- HomePage 渲染四个功能入口卡片、三个统计数字、最近创作会话
- 点击入口卡片跳转对应路由
- 根路径 / 指向 HomePage（不再重定向 /chat）
- 全部测试通过
