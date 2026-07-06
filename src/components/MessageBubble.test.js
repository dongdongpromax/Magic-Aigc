import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MessageBubble from './MessageBubble.vue'

describe('MessageBubble', () => {
  it('用户消息使用右侧消息行和中文角色标识', () => {
    const wrapper = mount(MessageBubble, {
      props: {
        message: {
          id: 'msg-user-1',
          role: 'user',
          type: 'user_prompt',
          prompt: '生成一张冷银色未来大厅',
        },
      },
    })

    expect(wrapper.get('[data-role="message-row"]').classes()).toContain('is-user')
    expect(wrapper.get('[data-role="message-badge"]').text()).toBe('你')
    expect(wrapper.text()).toContain('生成一张冷银色未来大厅')
  })

  it('助手消息使用左侧信息轨和模型标识', () => {
    const wrapper = mount(MessageBubble, {
      props: {
        message: {
          id: 'msg-assistant-1',
          role: 'assistant',
          type: 'assistant_text',
          content: '我已经整理好了这一轮的图像构图建议。',
        },
      },
    })

    expect(wrapper.get('[data-role="message-row"]').classes()).toContain('is-assistant')
    expect(wrapper.get('[data-role="message-badge"]').text()).toBe('AI')
    expect(wrapper.get('[data-role="message-title"]').text()).toBe('图像助手')
  })

  it('系统状态消息使用紧凑状态条', () => {
    const wrapper = mount(MessageBubble, {
      props: {
        message: {
          id: 'msg-system-1',
          role: 'system',
          type: 'system_status',
          content: '',
        },
      },
    })

    expect(wrapper.get('[data-role="message-row"]').classes()).toContain('is-system')
    expect(wrapper.get('[data-role="message-body"]').classes()).toContain('compact-status')
    expect(wrapper.text()).toContain('正在生成图像...')
  })
})
