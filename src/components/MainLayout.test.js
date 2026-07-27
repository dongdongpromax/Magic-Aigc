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
