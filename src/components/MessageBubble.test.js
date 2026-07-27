import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MessageBubble from './MessageBubble.vue'

/**
 * 构造一条用户 prompt 消息
 * @param {object} overrides 覆盖字段
 * @returns {object}
 */
function userMessage(overrides = {}) {
  return {
    id: 'msg-user-1',
    role: 'user',
    type: 'user_prompt',
    prompt: '生成一张冷银色未来大厅',
    ...overrides,
  }
}

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
    expect(wrapper.get('.role-tag').text()).toBe('你')
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
    expect(wrapper.get('.role-tag').text()).toBe('AI')
    expect(wrapper.get('.role-title').text()).toBe('图像助手')
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
    expect(wrapper.get('[data-role="message-body"]').classes()).toContain('status-pill')
    expect(wrapper.text()).toContain('正在生成图像...')
  })

  describe('用户消息操作栏（复制 + 重试）', () => {
    // navigator.clipboard 在 jsdom 中可能缺失，统一注入可控 mock
    const writeTextMock = vi.fn().mockResolvedValue(undefined)

    afterEach(() => {
      writeTextMock.mockClear()
    })

    it('用户消息渲染复制与重试按钮，AI/系统消息不渲染操作栏', () => {
      const userWrapper = mount(MessageBubble, { props: { message: userMessage() } })
      const userActionRow = userWrapper.find('[data-role="user-action-row"]')
      expect(userActionRow.exists()).toBe(true)
      expect(userActionRow.find('[data-action="copy"]').exists()).toBe(true)
      expect(userActionRow.find('[data-action="retry"]').exists()).toBe(true)

      // AI 文本消息无操作栏
      const aiWrapper = mount(MessageBubble, {
        props: {
          message: { id: 'msg-ai', role: 'assistant', type: 'assistant_text', content: '构图建议' },
        },
      })
      expect(aiWrapper.find('[data-role="user-action-row"]').exists()).toBe(false)

      // 系统状态消息无操作栏
      const sysWrapper = mount(MessageBubble, {
        props: { message: { id: 'msg-sys', role: 'system', type: 'system_status' } },
      })
      expect(sysWrapper.find('[data-role="user-action-row"]').exists()).toBe(false)
    })

    it('点击复制写入剪贴板并切换为「已复制」文案', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        configurable: true,
      })

      const wrapper = mount(MessageBubble, { props: { message: userMessage() } })
      const copyBtn = wrapper.get('[data-action="copy"]')

      expect(copyBtn.text()).toBe('复制')

      await copyBtn.trigger('click')
      await flushPromises()

      expect(writeTextMock).toHaveBeenCalledWith('生成一张冷银色未来大厅')
      expect(wrapper.get('[data-action="copy"]').text()).toBe('已复制')
    })

    it('点击重试向父组件 emit retry 事件并携带原消息', async () => {
      const wrapper = mount(MessageBubble, { props: { message: userMessage({ id: 'msg-retry' }) } })

      await wrapper.get('[data-action="retry"]').trigger('click')

      expect(wrapper.emitted('retry')).toBeTruthy()
      // 第一条 retry 事件的首个参数即原消息对象
      expect(wrapper.emitted('retry')[0][0]).toMatchObject({
        id: 'msg-retry',
        type: 'user_prompt',
        prompt: '生成一张冷银色未来大厅',
      })
    })
  })

  /**
   * 用户消息参考图渲染：解决「加了参考图但气泡里看不到，误以为没发给模型」的痛点
   * 覆盖：reload 后从 meta 读、本地刚发送从 draftSnapshot 读、角色标签派生、优先级与无参考图场景
   */
  describe('用户消息参考图渲染', () => {
    it('meta.referenceImages 存在时渲染参考图缩略图行', () => {
      const wrapper = mount(MessageBubble, {
        props: {
          message: userMessage({
            meta: {
              referenceImages: [
                { url: '/files/references/a.png', mimeType: 'image/png', name: 'a.png' },
                { url: '/files/references/b.png', mimeType: 'image/jpeg', name: 'b.jpg' },
              ],
            },
          }),
        },
      })

      const row = wrapper.find('[data-role="reference-row"]')
      expect(row.exists()).toBe(true)
      // 缩略图数量与 referenceImages 一致
      expect(row.findAll('.reference-thumb')).toHaveLength(2)
      // <img> src 指向参考图 url
      expect(row.find('img').attributes('src')).toBe('/files/references/a.png')
    })

    it('reload 后从 meta 读取参考图（draftSnapshot 缺失时仍可展示）', () => {
      const wrapper = mount(MessageBubble, {
        props: {
          message: userMessage({
            meta: {
              referenceImages: [{ url: '/files/references/only.png', mimeType: 'image/png', name: 'only.png' }],
            },
          }),
        },
      })

      expect(wrapper.find('[data-role="reference-row"]').exists()).toBe(true)
      expect(wrapper.findAll('.reference-thumb')).toHaveLength(1)
    })

    it('本地刚发送未 reload 时从 draftSnapshot 读取参考图', () => {
      const wrapper = mount(MessageBubble, {
        props: {
          message: userMessage({
            draftSnapshot: {
              referenceImages: [
                { filePath: '/files/references/local1.png', type: 'image/png', name: 'local1.png' },
                { filePath: '/files/references/local2.png', type: 'image/png', name: 'local2.png' },
                { filePath: '/files/references/local3.png', type: 'image/png', name: 'local3.png' },
              ],
            },
          }),
        },
      })

      const thumbs = wrapper.findAll('.reference-thumb')
      expect(thumbs).toHaveLength(3)
      // filePath 字段归一化为 url 后渲染到 <img src>
      expect(thumbs[0].find('img').attributes('src')).toBe('/files/references/local1.png')
    })

    it('meta.referenceImages 优先于 draftSnapshot.referenceImages', () => {
      const wrapper = mount(MessageBubble, {
        props: {
          message: userMessage({
            meta: {
              referenceImages: [{ url: '/files/references/meta.png', mimeType: 'image/png', name: 'meta.png' }],
            },
            draftSnapshot: {
              referenceImages: [
                { filePath: '/files/references/draft1.png', type: 'image/png', name: 'draft1.png' },
                { filePath: '/files/references/draft2.png', type: 'image/png', name: 'draft2.png' },
              ],
            },
          }),
        },
      })

      // meta 优先，仅渲染 1 张而非 draftSnapshot 的 2 张
      expect(wrapper.findAll('.reference-thumb')).toHaveLength(1)
      expect(wrapper.find('img').attributes('src')).toBe('/files/references/meta.png')
    })

    it('无参考图时不渲染 reference-row', () => {
      const wrapper = mount(MessageBubble, { props: { message: userMessage() } })

      expect(wrapper.find('[data-role="reference-row"]').exists()).toBe(false)
    })

    it('AI 消息即使带 referenceImages 也不渲染参考图行', () => {
      const wrapper = mount(MessageBubble, {
        props: {
          message: {
            id: 'msg-ai',
            role: 'assistant',
            type: 'assistant_images',
            meta: { referenceImages: [{ url: '/files/references/x.png', mimeType: 'image/png', name: 'x.png' }] },
          },
        },
      })

      expect(wrapper.find('[data-role="reference-row"]').exists()).toBe(false)
    })

    it('视频参考模式 first_last：第 1 张显示「首帧」、第 2 张显示「尾帧」', () => {
      const wrapper = mount(MessageBubble, {
        props: {
          message: userMessage({
            meta: {
              videoRefMode: 'first_last',
              referenceImages: [
                { url: '/files/references/first.png', mimeType: 'image/png', name: 'first.png' },
                { url: '/files/references/last.png', mimeType: 'image/png', name: 'last.png' },
              ],
            },
          }),
        },
      })

      const tags = wrapper.findAll('.ref-role-tag')
      expect(tags).toHaveLength(2)
      expect(tags[0].text()).toBe('首帧')
      expect(tags[1].text()).toBe('尾帧')
    })

    it('视频参考模式 first_frame：仅 1 张显示「首帧」', () => {
      const wrapper = mount(MessageBubble, {
        props: {
          message: userMessage({
            meta: {
              videoRefMode: 'first_frame',
              referenceImages: [{ url: '/files/references/first.png', mimeType: 'image/png', name: 'first.png' }],
            },
          }),
        },
      })

      const tags = wrapper.findAll('.ref-role-tag')
      expect(tags).toHaveLength(1)
      expect(tags[0].text()).toBe('首帧')
    })

    it('视频参考模式 reference：全部显示「参考图」', () => {
      const wrapper = mount(MessageBubble, {
        props: {
          message: userMessage({
            meta: {
              videoRefMode: 'reference',
              referenceImages: [
                { url: '/files/references/r1.png', mimeType: 'image/png', name: 'r1.png' },
                { url: '/files/references/r2.png', mimeType: 'image/png', name: 'r2.png' },
              ],
            },
          }),
        },
      })

      const tags = wrapper.findAll('.ref-role-tag')
      expect(tags).toHaveLength(2)
      expect(tags[0].text()).toBe('参考图')
      expect(tags[1].text()).toBe('参考图')
    })

    it('图像消息无 videoRefMode：不显示角色标签（仅展示缩略图）', () => {
      const wrapper = mount(MessageBubble, {
        props: {
          message: userMessage({
            meta: {
              // 图像消息 meta 无 videoRefMode
              referenceImages: [{ url: '/files/references/img.png', mimeType: 'image/png', name: 'img.png' }],
            },
          }),
        },
      })

      // 缩略图渲染但无角色标签
      expect(wrapper.findAll('.reference-thumb')).toHaveLength(1)
      expect(wrapper.findAll('.ref-role-tag')).toHaveLength(0)
    })
  })
})
