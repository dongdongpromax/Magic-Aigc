import { mount } from '@vue/test-utils'
import { NImage, NImageGroup } from 'naive-ui'
import { describe, expect, it } from 'vitest'
import ImageMessageCard from './ImageMessageCard.vue'

describe('ImageMessageCard', () => {
  it('渲染继续细化和下载原图动作', () => {
    const wrapper = mount(ImageMessageCard, {
      props: {
        message: {
          images: [{ id: '1', url: 'https://img.example.com/1.png' }],
          model: 'gpt-image-2',
          size: '1024x1024',
        },
      },
    })

    expect(wrapper.get('[data-role="message-row"]').classes()).toContain('is-assistant')
    expect(wrapper.get('[data-role="message-badge"]').text()).toBe('AI')
    expect(wrapper.get('[data-role="message-title"]').text()).toBe('图像结果')
    expect(wrapper.text()).toContain('继续细化')
    expect(wrapper.text()).toContain('下载原图')
  })

  it('使用 Naive UI 图片组件渲染结果图', () => {
    const wrapper = mount(ImageMessageCard, {
      props: {
        message: {
          id: 'msg-1',
          topicId: 'topic-1',
          images: [
            { id: 'img-1', url: 'data:image/png;base64,ZmFrZQ==' },
            { id: 'img-2', url: 'data:image/png;base64,ZmFrZTI=' },
          ],
          model: 'openai/gpt-image-2',
          size: '1024x1024',
        },
      },
    })

    expect(wrapper.findComponent(NImageGroup).exists()).toBe(true)
    expect(wrapper.findAllComponents(NImage)).toHaveLength(2)
    expect(wrapper.findComponent(NImage).props('objectFit')).toBe('contain')
    expect(wrapper.find('img.image-item').exists()).toBe(false)
    expect(wrapper.get('[data-role="image-frame"]').attributes('style')).toContain('max-width: 720px')
    expect(wrapper.get('[data-role="image-frame"]').attributes('style')).toContain('max-height: 420px')
  })
})
