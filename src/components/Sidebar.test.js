import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import Sidebar from './Sidebar.vue'
import { useChatStore } from '@/store/chat'

describe('Sidebar', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('显示图像工作台并支持新建创作', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const wrapper = mount(Sidebar, {
      global: {
        plugins: [pinia],
      },
    })

    expect(wrapper.text()).toContain('图像工作台')
    expect(wrapper.text()).toContain('新建创作')

    const store = useChatStore()
    const beforeCount = store.topics.length

    await wrapper.find('.action-btn').trigger('click')
    expect(store.topics.length).toBe(beforeCount + 1)
  })
})
