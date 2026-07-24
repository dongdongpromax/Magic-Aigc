import { createRouter, createWebHistory } from 'vue-router'
import MainLayout from '@/components/MainLayout.vue'

/**
 * 路由配置
 *
 * 两个主路由共用 MainLayout（侧边栏 + 背景动效），仅内容区切换：
 * - /chat → 聊天创作页（ChatArea）
 * - /logs → 使用日志页（UsageLogPage）
 *
 * 根路径重定向到 /chat，保证刷新/直接访问时不白屏。
 */
export const routes = [
  {
    path: '/',
    redirect: '/chat',
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
