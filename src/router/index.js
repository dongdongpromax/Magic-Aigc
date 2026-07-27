import { createRouter, createWebHistory } from 'vue-router'
import MainLayout from '@/components/MainLayout.vue'

/**
 * 路由配置
 *
 * 主路由共用 MainLayout（顶栏 + 侧边栏 + 背景动效），仅内容区切换：
 * - /        → 门户首页（HomePage）
 * - /chat    → 聊天创作页（ChatArea）
 * - /prompts → 提示词库页（PromptLibraryPage）
 * - /logs    → 使用日志页（UsageLogPage）
 * - /canvas  → 漫剧自由画布页（独立全屏布局，不套 MainLayout）
 */
export const routes = [
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
  {
    path: '/canvas',
    name: 'canvas',
    component: () => import('@/pages/ComicCanvasPage.vue'),
  },
  {
    path: '/chat',
    name: 'chat',
    component: MainLayout,
    children: [
      {
        path: '',
        name: 'chat-content',
        component: () => import('@/components/ChatArea.vue'),
      },
    ],
  },
  {
    path: '/prompts',
    name: 'prompts',
    component: MainLayout,
    children: [
      {
        path: '',
        name: 'prompts-content',
        component: () => import('@/views/PromptLibraryPage.vue'),
      },
    ],
  },
  {
    path: '/logs',
    name: 'logs',
    component: MainLayout,
    children: [
      {
        path: '',
        name: 'logs-content',
        component: () => import('@/views/UsageLogPage.vue'),
      },
    ],
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})
