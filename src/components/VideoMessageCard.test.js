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
    // 四个动作按钮：继续细化 / 再次生成 / 下载视频 / 复制（视频不支持「设为首帧」）
    expect(wrapper.text()).toContain('继续细化')
    expect(wrapper.text()).toContain('再次生成')
    expect(wrapper.text()).toContain('下载视频')
    expect(wrapper.text()).toContain('复制')
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
    expect(buttons).toHaveLength(4)

    await buttons[0].trigger('click')
    expect(wrapper.emitted('refine')).toBeTruthy()
    await buttons[1].trigger('click')
    expect(wrapper.emitted('retry')).toBeTruthy()
    await buttons[2].trigger('click')
    expect(wrapper.emitted('download')).toBeTruthy()
    // 第 4 个为复制按钮（内部写剪贴板，不 emit 事件）
    expect(buttons[3].attributes('data-action')).toBe('copy')
    expect(buttons[3].text()).toBe('复制')
  })

  // ===== pending 状态渲染 =====

  it('pending 状态渲染占位横幅而非视频播放器', () => {
    const wrapper = mount(VideoMessageCard, {
      props: {
        message: {
          status: 'pending',
          videos: [],
          model: 'doubao-seedance-2-0-260128',
          meta: { providerName: '火山方舟', status: 'pending', taskId: 'cgt-1' },
        },
      },
    })

    // 占位横幅存在
    expect(wrapper.find('[data-role="pending-banner"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('视频仍在后台生成中')
    // 不渲染视频播放器
    expect(wrapper.find('video').exists()).toBe(false)
  })

  it('pending 状态只显示「检查状态」+「复制」按钮，不显示下载/细化/再次生成', () => {
    const wrapper = mount(VideoMessageCard, {
      props: {
        message: {
          status: 'pending',
          videos: [],
          model: 'doubao-seedance-2-0-260128',
        },
      },
    })

    const buttons = wrapper.findAll('.action-row button')
    // 仅 2 个按钮：检查状态 + 复制
    expect(buttons).toHaveLength(2)
    expect(buttons[0].attributes('data-action')).toBe('check-pending')
    expect(buttons[0].text()).toBe('检查状态')
    expect(buttons[1].attributes('data-action')).toBe('copy')
    // 不显示正常操作栏按钮
    expect(wrapper.text()).not.toContain('下载视频')
    expect(wrapper.text()).not.toContain('继续细化')
    expect(wrapper.text()).not.toContain('再次生成')
  })

  it('点击「检查状态」emit check-pending 事件并携带原消息', async () => {
    const wrapper = mount(VideoMessageCard, {
      props: {
        message: {
          id: 'msg-pending',
          status: 'pending',
          videos: [],
          model: 'doubao-seedance-2-0-260128',
        },
      },
    })

    await wrapper.get('[data-action="check-pending"]').trigger('click')

    expect(wrapper.emitted('check-pending')).toBeTruthy()
    expect(wrapper.emitted('check-pending')[0][0]).toMatchObject({
      id: 'msg-pending',
      status: 'pending',
    })
  })

  it('meta.status=pending 也能识别为 pending（reload 后从 DB 读取）', () => {
    const wrapper = mount(VideoMessageCard, {
      props: {
        message: {
          // 无顶层 status 字段，仅 meta.status
          videos: [],
          model: 'doubao-seedance-2-0-260128',
          meta: { status: 'pending' },
        },
      },
    })

    expect(wrapper.find('[data-role="pending-banner"]').exists()).toBe(true)
    expect(wrapper.find('[data-action="check-pending"]').exists()).toBe(true)
  })
})
