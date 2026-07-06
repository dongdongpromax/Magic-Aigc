import { shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import ChatArea from './ChatArea.vue'

describe('ChatArea', () => {
  it('聊天主区域使用可透出背景场景的外层样式', () => {
    setActivePinia(createPinia())

    const wrapper = shallowMount(ChatArea, {
      global: {
        plugins: [createPinia()],
        stubs: {
          ConnectionBadge: true,
          ImageMessageCard: true,
          InputConsole: true,
          MessageBubble: true,
          SettingsDrawer: true,
        },
      },
    })

    expect(wrapper.get('.chat-area').classes()).toContain('scene-visible')
  })
})
