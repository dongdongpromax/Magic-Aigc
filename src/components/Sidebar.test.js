import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    const createTopicSpy = vi.spyOn(store, 'createTopic').mockResolvedValue('topic-1')

    await wrapper.find('.action-btn').trigger('click')
    expect(createTopicSpy).toHaveBeenCalledWith('新建创作')
  })
})
