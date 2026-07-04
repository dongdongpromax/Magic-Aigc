import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ConnectionBadge from './ConnectionBadge.vue'

describe('ConnectionBadge', () => {
  it('缺少配置时显示未配置', () => {
    const wrapper = mount(ConnectionBadge, {
      props: {
        hasConfig: false,
        hasError: false,
      },
    })

    expect(wrapper.text()).toContain('未配置')
  })
})
