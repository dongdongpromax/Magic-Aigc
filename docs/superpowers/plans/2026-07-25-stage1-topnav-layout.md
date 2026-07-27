# 阶段 1：顶部导航 + 侧栏改造 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增顶部导航栏（TopNav）承载父子菜单页面导航，侧栏（Sidebar）移除品牌区和底部导航、聚焦创作会话管理，连接徽标（ConnectionBadge）上移到 TopNav 全局可见。

**Architecture:** MainLayout 从「侧栏+内容区」改为「顶栏+侧栏+内容区」三层结构。TopNav 用父子下拉菜单分组页面入口（创作/管理），hover 展开。全屏模式下 TopNav 与 Sidebar 一起隐藏。本阶段不改动路由（根路径仍重定向 /chat，/canvas 保持独立全屏），/prompts 路由留到阶段 3。

**Tech Stack:** Vue 3 Composition API, vue-router, pinia, lucide-vue-next, vitest, @vue/test-utils

---

## 文件结构

**创建：**
- `src/components/topNavConfig.js` — 父子菜单配置（NAV_MENU 数组）
- `src/components/TopNav.vue` — 顶部导航组件（品牌 + 父子菜单 + 连接徽标）
- `src/components/TopNav.test.js` — TopNav 单元测试

**修改：**
- `src/components/MainLayout.vue` — 集成 TopNav，全屏模式隐藏顶栏
- `src/components/MainLayout.test.js` — stub TopNav
- `src/components/Sidebar.vue` — 移除品牌区 + 底部导航入口
- `src/components/Sidebar.test.js` — 更新断言（移除品牌/底部导航相关）
- `src/components/ChatArea.vue` — 移除 ConnectionBadge（已移到 TopNav）
- `src/components/ChatArea.test.js` — 移除 ConnectionBadge stub

---

### Task 1: 创建菜单配置 topNavConfig.js

**Files:**
- Create: `src/components/topNavConfig.js`

- [ ] **Step 1: 创建菜单配置文件**

创建 `src/components/topNavConfig.js`：

```js
import { MessageSquare, Clapperboard, ScrollText } from 'lucide-vue-next'

/**
 * 顶部导航父子菜单配置
 *
 * 阶段 1 仅含「创作」（聊天/画布）和「管理」（使用日志）两组。
 * 阶段 3 提示词库上线后，在「管理」组追加 { label: '提示词库', path: '/prompts', icon: Library }。
 *
 * 每项：label 显示文案，path 路由路径，icon lucide 图标组件
 */
export const NAV_MENU = [
  {
    label: '创作',
    items: [
      { label: '聊天', path: '/chat', icon: MessageSquare },
      { label: '画布', path: '/canvas', icon: Clapperboard },
    ],
  },
  {
    label: '管理',
    items: [{ label: '使用日志', path: '/logs', icon: ScrollText }],
  },
]
```

- [ ] **Step 2: Commit**

```bash
git add src/components/topNavConfig.js
git commit -m "feat(nav): 新增顶部导航父子菜单配置"
```

---

### Task 2: 创建 TopNav 组件（TDD）

**Files:**
- Create: `src/components/TopNav.test.js`
- Create: `src/components/TopNav.vue`

- [ ] **Step 1: 编写失败测试**

创建 `src/components/TopNav.test.js`：

```js
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import TopNav from './TopNav.vue'
import { createTestRouter } from '@/test/testRouter'

describe('TopNav', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    document.body.innerHTML = ''
  })

  it('渲染品牌「创作工坊」', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createTestRouter()
    await router.isReady()

    const wrapper = mount(TopNav, { global: { plugins: [pinia, router] } })

    expect(wrapper.text()).toContain('创作工坊')
  })

  it('渲染父子菜单组：创作 / 管理', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createTestRouter()
    await router.isReady()

    const wrapper = mount(TopNav, { global: { plugins: [pinia, router] } })

    const groups = wrapper.findAll('[data-role="nav-group"]')
    expect(groups).toHaveLength(2)
    expect(groups[0].text()).toContain('创作')
    expect(groups[1].text()).toContain('管理')
  })

  it('hover 父菜单展开子菜单项', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createTestRouter()
    await router.isReady()

    const wrapper = mount(TopNav, { global: { plugins: [pinia, router] } })

    // 初始子菜单不可见
    expect(wrapper.find('[data-role="submenu"]').exists()).toBe(false)

    // hover「创作」组
    await wrapper.find('[data-role="nav-group"]').trigger('mouseenter')

    const submenu = wrapper.find('[data-role="submenu"]')
    expect(submenu.exists()).toBe(true)
    expect(submenu.text()).toContain('聊天')
    expect(submenu.text()).toContain('画布')
  })

  it('点击子菜单项跳转对应路由', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createTestRouter()
    await router.isReady()

    const wrapper = mount(TopNav, { global: { plugins: [pinia, router] } })

    // hover「管理」组并点击「使用日志」
    const groups = wrapper.findAll('[data-role="nav-group"]')
    await groups[1].trigger('mouseenter')
    await flushPromises()

    const logsItem = wrapper.find('[data-action="nav-item"][data-path="/logs"]')
    await logsItem.trigger('click')

    expect(router.currentRoute.value.path).toBe('/logs')
  })

  it('当前路由对应的菜单项高亮（active 类）', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createTestRouter()
    await router.push('/chat')
    await router.isReady()

    const wrapper = mount(TopNav, { global: { plugins: [pinia, router] } })

    await wrapper.find('[data-role="nav-group"]').trigger('mouseenter')

    const chatItem = wrapper.find('[data-action="nav-item"][data-path="/chat"]')
    expect(chatItem.classes()).toContain('active')
  })

  it('渲染连接状态徽标', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createTestRouter()
    await router.isReady()

    const wrapper = mount(TopNav, { global: { plugins: [pinia, router] } })

    expect(wrapper.findComponent({ name: 'ConnectionBadge' }).exists()).toBe(true)
  })
})

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/components/TopNav.test.js`
Expected: FAIL — TopNav.vue 不存在

- [ ] **Step 3: 实现 TopNav 组件**

创建 `src/components/TopNav.vue`：

```vue
<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Aperture } from 'lucide-vue-next'
import ConnectionBadge from './ConnectionBadge.vue'
import { useChatStore } from '@/store/chat'
import { NAV_MENU } from './topNavConfig'

const route = useRoute()
const router = useRouter()
const chatStore = useChatStore()

/** 当前展开的父菜单 label（hover 控制，离开清空） */
const openMenu = ref('')

/** 判断菜单项是否对应当前路由（前缀匹配） */
function isActive(path) {
  return route.path.startsWith(path)
}

/** 点击子菜单项跳转并收起菜单 */
function go(path) {
  router.push(path)
  openMenu.value = ''
}
</script>

<template>
  <div class="top-nav" data-role="top-nav">
    <!-- 左侧：品牌 -->
    <div class="brand">
      <div class="brand-icon">
        <Aperture :size="18" />
      </div>
      <span class="brand-title">创作工坊</span>
    </div>

    <!-- 中部：父子下拉菜单 -->
    <nav class="nav-menu">
      <div
        v-for="group in NAV_MENU"
        :key="group.label"
        class="nav-group"
        data-role="nav-group"
        @mouseenter="openMenu = group.label"
        @mouseleave="openMenu = ''"
      >
        <span class="nav-group-label">{{ group.label }}</span>

        <!-- 子菜单浮层：hover 时渲染 -->
        <div v-if="openMenu === group.label" class="submenu" data-role="submenu">
          <button
            v-for="item in group.items"
            :key="item.path"
            type="button"
            class="submenu-item"
            :class="{ active: isActive(item.path) }"
            data-action="nav-item"
            :data-path="item.path"
            @click="go(item.path)"
          >
            <component :is="item.icon" :size="15" />
            <span>{{ item.label }}</span>
          </button>
        </div>
      </div>
    </nav>

    <!-- 右侧：连接状态徽标 -->
    <div class="nav-actions">
      <ConnectionBadge
        :has-config="chatStore.hasConfig"
        :has-error="Boolean(chatStore.lastError)"
        @click="chatStore.openSettings"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
@import '@/styles/variables.scss';

.top-nav {
  flex-shrink: 0;
  height: 48px;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 0 20px;
  background: rgba(11, 14, 19, 0.92);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(18px);
  z-index: 20;
  position: relative;
}

/* 品牌区 */
.brand {
  display: flex;
  align-items: center;
  gap: 10px;

  .brand-icon {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, rgba(119, 168, 255, 0.18), rgba(255, 255, 255, 0.04));
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .brand-title {
    font-size: 14px;
    font-weight: 600;
    color: $text-primary;
  }
}

/* 父子菜单 */
.nav-menu {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nav-group {
  position: relative;
  padding: 0 12px;
  height: 48px;
  display: flex;
  align-items: center;
  cursor: default;
}

.nav-group-label {
  font-size: 13px;
  color: $text-secondary;
  transition: color 0.2s ease;
}

.nav-group:hover .nav-group-label {
  color: $text-primary;
}

/* 子菜单浮层 */
.submenu {
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 140px;
  padding: 6px;
  background: rgba(18, 22, 28, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
  z-index: 30;
}

.submenu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: $text-secondary;
  font-size: 13px;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
    color: $text-primary;
  }

  &.active {
    background: rgba(119, 168, 255, 0.12);
    color: $text-primary;
  }
}

/* 右侧操作区 */
.nav-actions {
  margin-left: auto;
}
</style>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/components/TopNav.test.js`
Expected: PASS（6 个测试）

- [ ] **Step 5: Commit**

```bash
git add src/components/TopNav.vue src/components/TopNav.test.js
git commit -m "feat(nav): 新增顶部导航组件 TopNav（品牌+父子菜单+连接徽标）"
```

---

### Task 3: MainLayout 集成 TopNav + 全屏适配

**Files:**
- Modify: `src/components/MainLayout.vue`
- Modify: `src/components/MainLayout.test.js`

- [ ] **Step 1: 更新 MainLayout.test.js，stub TopNav**

修改 `src/components/MainLayout.test.js`，在 stubs 中加入 `TopNav: true`：

```js
import { shallowMount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import MainLayout from './MainLayout.vue'

describe('MainLayout', () => {
  it('渲染动态粒子炫光背景层', () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const wrapper = shallowMount(MainLayout, {
      global: {
        plugins: [pinia],
        stubs: {
          Sidebar: true,
          TopNav: true,
        },
      },
    })

    expect(wrapper.find('.cyber-grid-bg').exists()).toBe(true)
    expect(wrapper.find('.ambient-glow').exists()).toBe(true)
    expect(wrapper.find('.particle-orbit').exists()).toBe(true)
    expect(wrapper.find('.particle-dust').exists()).toBe(true)
    expect(wrapper.find('.particle-vignette').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 修改 MainLayout.vue 集成 TopNav**

修改 `src/components/MainLayout.vue` 的 `<script setup>` 和 `<template>` 部分。

`<script setup>` 加入 TopNav 导入：

```js
<script setup>
import { computed } from 'vue'
import Sidebar from './Sidebar.vue'
import TopNav from './TopNav.vue'
import { useChatStore } from '@/store/chat'

const chatStore = useChatStore()
// 改动2: 聊天区全屏时隐藏侧栏与顶栏，内容区铺满整个窗口
const isFullscreen = computed(() => chatStore.isChatFullscreen)
</script>
```

`<template>` 在 `.main-layout` 内最前面加入 TopNav，`.content-wrapper` 改为包裹 Sidebar + router-view：

```html
<template>
  <div class="main-layout" :class="{ 'is-fullscreen': isFullscreen }">
    <TopNav />
    <div class="body-wrapper">
      <Sidebar />
      <div class="content-wrapper">
        <div class="background-scene" aria-hidden="true">
          <div class="cyber-grid-bg"></div>
          <div class="ambient-glow"></div>
          <div class="particle-orbit"></div>
          <div class="particle-dust"></div>
          <div class="particle-vignette"></div>
        </div>
        <router-view />
      </div>
    </div>
  </div>
</template>
```

在 `<style>` 中，`.main-layout` 改为纵向 flex；新增 `.body-wrapper` 横向 flex 容纳侧栏+内容；全屏模式隐藏顶栏（上移）+ 侧栏（左移）：

```scss
.main-layout {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background-color: $bg-base;
}

/* 顶栏 + 侧栏 + 内容区的横向容器 */
.body-wrapper {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* 全屏模式：顶栏上移隐藏，侧栏左移隐藏 */
:deep(.top-nav) {
  transition: transform 0.3s ease;
}

:deep(.sidebar) {
  transition: margin-left 0.3s ease;
}

.main-layout.is-fullscreen :deep(.top-nav) {
  transform: translateY(-100%);
}

.main-layout.is-fullscreen :deep(.sidebar) {
  margin-left: -$sidebar-width;
}
```

保留 `.content-wrapper` 及背景动效相关样式不变。

- [ ] **Step 3: 运行测试确认通过**

Run: `npx vitest run src/components/MainLayout.test.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/MainLayout.vue src/components/MainLayout.test.js
git commit -m "feat(layout): MainLayout 集成 TopNav，全屏模式隐藏顶栏与侧栏"
```

---

### Task 4: Sidebar 移除品牌区和底部导航

**Files:**
- Modify: `src/components/Sidebar.vue`
- Modify: `src/components/Sidebar.test.js`

- [ ] **Step 1: 更新 Sidebar.test.js 断言**

修改 `src/components/Sidebar.test.js`：

1. 第一个测试「显示创作工坊并支持新建创作」改为「支持新建创作」，移除品牌断言：

```js
it('支持新建创作', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createTestRouter()
  await router.isReady()

  const wrapper = mount(Sidebar, {
    global: {
      plugins: [pinia, router],
    },
  })

  expect(wrapper.text()).toContain('新建创作')

  const store = useChatStore()
  const createTopicSpy = vi.spyOn(store, 'createTopic').mockResolvedValue('topic-1')

  await wrapper.find('.action-btn').trigger('click')
  expect(createTopicSpy).toHaveBeenCalledWith('新建创作')
})
```

2. 删除最后一个测试「底部含使用日志入口，点击跳转 /logs」（第 198-216 行整段删除，品牌区和底部导航已移至 TopNav）。

- [ ] **Step 2: 运行测试确认通过（断言已先更新，组件未改时仍应通过）**

Run: `npx vitest run src/components/Sidebar.test.js`
Expected: PASS（移除断言不改变通过状态，删除底部导航测试减少用例数）

- [ ] **Step 3: 修改 Sidebar.vue 移除品牌区和底部导航**

修改 `src/components/Sidebar.vue`：

`<script setup>` 移除不再使用的导入和函数：删除 `Aperture`、`ScrollText`、`Clapperboard` 导入；删除 `isLogsRoute`、`isCanvasRoute` computed；删除 `goToLogs`、`goToCanvas` 函数；删除 `useRoute`、`useRouter` 导入（若不再使用）。

精简后的 `<script setup>` 开头：

```js
<script setup>
import { computed, reactive, ref } from 'vue'
import { useChatStore } from '@/store/chat'
import {
  Plus,
  Search,
  Image as ImageIcon,
  Trash2,
} from 'lucide-vue-next'
import ConfirmDialog from './ConfirmDialog.vue'

const chatStore = useChatStore()
const keyword = ref('')

// 正在删除的主题 ID，用于禁用对应按钮防重复点击
const deletingTopicId = ref('')
// 删除二次确认弹窗状态（替代原生 window.confirm，确保确认动作可见可靠）
const deleteConfirm = reactive({ show: false, topicId: '', title: '' })

const filteredTopics = computed(() => {
  const search = keyword.value.trim().toLowerCase()
  if (!search) return chatStore.topics

  return chatStore.topics.filter((topic) => topic.title.toLowerCase().includes(search))
})

const handleNewTopic = () => {
  chatStore.createTopic('新建创作')
}

const handleSelectTopic = (topicId) => {
  chatStore.selectTopic(topicId)
}

// ... 保留 isVideoCover / handleDeleteTopic / handleConfirmDelete 不变
</script>
```

`<template>` 移除 `.sidebar-header` 内的 `.brand` 块，移除整个 `.sidebar-footer` 块。精简后模板结构：

```html
<template>
  <div class="sidebar">
    <div class="sidebar-header">
      <button class="action-btn" type="button" @click="handleNewTopic">
        <Plus :size="16" />
        <span>新建创作</span>
      </button>

      <label class="search-box">
        <Search :size="16" class="search-icon" />
        <input v-model="keyword" type="text" placeholder="搜索主题" />
      </label>
    </div>

    <div class="topic-list">
      <!-- 主题列表不变 -->
    </div>

    <!-- 删除二次确认不变 -->
    <ConfirmDialog
      v-model:show="deleteConfirm.show"
      title="确定删除？"
      :content="`将删除「${deleteConfirm.title}」及其所有消息和文件，且不可恢复。`"
      confirm-text="删除"
      danger
      @confirm="handleConfirmDelete"
    />
  </div>
</template>
```

`<style>` 移除 `.brand`、`.brand-copy`、`.brand-title`、`.brand-subtitle`、`.sidebar-footer`、`.nav-entry` 相关样式（品牌区已移至 TopNav，底部导航已移除）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/components/Sidebar.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar.vue src/components/Sidebar.test.js
git commit -m "refactor(sidebar): 移除品牌区和底部导航，聚焦创作会话管理"
```

---

### Task 5: ChatArea 移除 ConnectionBadge

**Files:**
- Modify: `src/components/ChatArea.vue`
- Modify: `src/components/ChatArea.test.js`

- [ ] **Step 1: 修改 ChatArea.vue 移除 ConnectionBadge**

`src/components/ChatArea.vue` 的 `<template>` 中，`.header-actions` 内移除 `<ConnectionBadge>` 组件，仅保留全屏按钮：

```html
<div class="header-actions">
  <button
    class="fullscreen-btn"
    type="button"
    data-action="toggle-fullscreen"
    :title="chatStore.isChatFullscreen ? '退出全屏' : '全屏对话'"
    @click="chatStore.toggleChatFullscreen"
  >
    <Minimize2 v-if="chatStore.isChatFullscreen" :size="16" />
    <Maximize2 v-else :size="16" />
  </button>
</div>
```

`<script setup>` 中移除 `import ConnectionBadge from './ConnectionBadge.vue'`（若该导入仅此处使用）。

- [ ] **Step 2: 修改 ChatArea.test.js 移除 ConnectionBadge stub**

`src/components/ChatArea.test.js` 中所有 `ConnectionBadge: true` stub 行删除（约 7 处，第 88/107/162/215/291/346/389 行）。这些 stub 针对的组件已不在 ChatArea 中渲染，删除避免冗余。

- [ ] **Step 3: 运行测试确认通过**

Run: `npx vitest run src/components/ChatArea.test.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/ChatArea.vue src/components/ChatArea.test.js
git commit -m "refactor(chat): 移除 ChatArea 的 ConnectionBadge（已上移至 TopNav）"
```

---

### Task 6: 全量测试验证

- [ ] **Step 1: 运行全部前后端测试**

Run: `npx vitest run`
Expected: 全部测试通过（原 378 个 + 新增 TopNav 6 个 = 384 个）

- [ ] **Step 2: 如有失败，修复后重新运行**

若 Sidebar.test.js 或 ChatArea.test.js 因移除项残留引用而失败，根据报错定位并清理。

- [ ] **Step 3: Commit（如有修复）**

```bash
git add -A
git commit -m "test: 修复布局重构后的测试适配"
```

---

## 完成标准

- TopNav 渲染品牌、父子菜单（创作/管理）、连接徽标
- hover 父菜单展开子菜单，点击跳转路由，当前页高亮
- Sidebar 只保留新建、搜索、主题列表，无品牌区和底部导航
- ConnectionBadge 在 TopNav 全局可见，ChatArea 不再渲染
- 全屏模式 TopNav + Sidebar 一起隐藏
- 全部测试通过
