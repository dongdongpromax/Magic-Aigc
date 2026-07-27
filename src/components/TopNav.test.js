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
    await flushPromises()

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
