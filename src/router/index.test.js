import { describe, expect, it } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { routes } from './index'

/**
 * 路由配置测试
 *
 * 用 memory history 基于正式 routes 表构造独立路由实例，
 * 避免触碰单例 router 的 createWebHistory（不污染 window.location）。
 * 仅校验路由解析结果，不渲染真实页面组件（懒加载 import 不会触发）。
 */
function createMemoryRouter() {
  return createRouter({ history: createMemoryHistory(), routes })
}

describe('router 配置', () => {
  it('根路径 / 命名为 home，渲染门户首页', async () => {
    const router = createMemoryRouter()
    await router.push('/')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/')
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('/chat 命名路由为 chat，含 chat-content 子路由', async () => {
    const router = createMemoryRouter()
    await router.push('/chat')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('chat-content')
  })

  it('/logs 命名路由为 logs，含 logs-content 子路由', async () => {
    const router = createMemoryRouter()
    await router.push('/logs')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('logs-content')
  })

  it('未知路径无匹配（404 兜底由应用层处理）', async () => {
    const router = createMemoryRouter()
    await router.push('/nonexistent')
    await router.isReady()

    // 未定义路由 → matched 为空
    expect(router.currentRoute.value.matched).toHaveLength(0)
  })
})
