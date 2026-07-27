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
