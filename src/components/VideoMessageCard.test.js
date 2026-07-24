import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import VideoMessageCard from './VideoMessageCard.vue'

/**
 * 视频消息卡片单测
 *
 * 参考 ImageMessageCard.test.js 结构：渲染校验、meta 展示、images 兜底、动作 emit。
 */
describe('VideoMessageCard', () => {
  it('渲染 video 元素并展示动作按钮', () => {
    const wrapper = mount(VideoMessageCard, {
      props: {
        message: {
          videos: [{ id: 'v1', url: '/files/generated/demo.mp4' }],
          model: 'doubao-seedance-2-0-260128',
          ratio: '16:9',
          duration: 5,
        },
      },
    })

    expect(wrapper.get('[data-role="message-row"]').classes()).toContain('is-assistant')
    expect(wrapper.get('.role-tag').text()).toBe('AI')
    expect(wrapper.get('.role-title').text()).toBe('视频结果')
    // video 元素带 controls 与 src
    const video = wrapper.get('video')
    expect(video.attributes('src')).toBe('/files/generated/demo.mp4')
    expect(video.attributes('controls')).toBeDefined()
    // 三个动作按钮（视频不支持「设为首帧」）
    expect(wrapper.text()).toContain('继续细化')
    expect(wrapper.text()).toContain('再次生成')
    expect(wrapper.text()).toContain('下载视频')
    expect(wrapper.text()).not.toContain('设为首帧')
  })

  it('无 videos 时从 images 按 mimeType 前缀兜底（reload 后从 message_images 表读出）', () => {
    const wrapper = mount(VideoMessageCard, {
      props: {
        message: {
          // 无 videos 字段，images 混合图片与视频行
          images: [
            { id: 'img-1', url: '/files/generated/a.png', mimeType: 'image/png' },
            { id: 'img-2', url: '/files/generated/b.mp4', mimeType: 'video/mp4' },
          ],
          model: 'doubao-seedance-2-0-260128',
        },
      },
    })

    // 仅渲染 video/* 的项
    const frames = wrapper.findAll('[data-role="video-frame"]')
    expect(frames).toHaveLength(1)
    expect(wrapper.get('video').attributes('src')).toBe('/files/generated/b.mp4')
  })

  it('meta 含 providerName / ratio / duration 时在 header 展示', () => {
    const wrapper = mount(VideoMessageCard, {
      props: {
        message: {
          videos: [{ id: 'v1', url: '/files/generated/demo.mp4' }],
          model: 'doubao-seedance-2-0-260128',
          ratio: '9:16',
          duration: 8,
          meta: { providerName: '火山方舟' },
        },
      },
    })

    expect(wrapper.get('[data-role="provider-name"]').text()).toBe('火山方舟')
    expect(wrapper.text()).toContain('9:16')
    expect(wrapper.text()).toContain('8秒')
  })

  it('无 providerName 时不渲染中转站位（旧消息兼容）', () => {
    const wrapper = mount(VideoMessageCard, {
      props: {
        message: {
          videos: [{ id: 'v1', url: '/files/generated/demo.mp4' }],
          model: 'doubao-seedance-2-0-260128',
        },
      },
    })

    expect(wrapper.find('[data-role="provider-name"]').exists()).toBe(false)
  })

  it('点击动作按钮触发对应 emit', async () => {
    const wrapper = mount(VideoMessageCard, {
      props: {
        message: {
          videos: [{ id: 'v1', url: '/files/generated/demo.mp4' }],
          model: 'doubao-seedance-2-0-260128',
        },
      },
    })

    const buttons = wrapper.findAll('.action-row button')
    expect(buttons).toHaveLength(3)

    await buttons[0].trigger('click')
    expect(wrapper.emitted('refine')).toBeTruthy()
    await buttons[1].trigger('click')
    expect(wrapper.emitted('retry')).toBeTruthy()
    await buttons[2].trigger('click')
    expect(wrapper.emitted('download')).toBeTruthy()
  })
})
