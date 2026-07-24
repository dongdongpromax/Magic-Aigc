import { createRouter, createMemoryHistory } from 'vue-router'

/**
 * 创建用于单元测试的路由实例
 *
 * 使用 memory history（不依赖浏览器 URL），提供与正式路由一致的 /chat、/logs 两条路由，
 * 组件用空 div stub，避免引入真实页面及其依赖（API/store 等）。
 *
 * @param {string} initialPath 初始路径（默认 /chat）
 * @returns {import('vue-router').Router} 已就绪的路由实例
 */
export function createTestRouter(initialPath = '/chat') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', redirect: '/chat' },
      { path: '/chat', name: 'chat', component: { template: '<div />' } },
      { path: '/logs', name: 'logs', component: { template: '<div />' } },
    ],
  })
  // 推到初始路径；测试挂载前 await router.isReady() 保证路由就绪
  router.push(initialPath)
  return router
}
