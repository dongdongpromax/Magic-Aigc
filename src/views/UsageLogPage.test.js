import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import UsageLogPage from './UsageLogPage.vue'
import { createTestRouter } from '@/test/testRouter'
import * as usageLogApi from '@/services/usageLogApi'

// mock 使用日志 API，避免真实网络请求
vi.mock('@/services/usageLogApi', () => ({
  listUsageLogs: vi.fn().mockResolvedValue([]),
  getUsageLogDetail: vi.fn().mockResolvedValue(null),
  deleteUsageLog: vi.fn().mockResolvedValue({ success: true }),
  clearAllUsageLogs: vi.fn().mockResolvedValue({ success: true, deleted: 0 }),
}))

/** 构造一条日志摘要（列表用，不含完整 JSON 负载） */
function makeLogSummary(overrides = {}) {
  return {
    id: 'log-1',
    topicId: 'topic-1',
    type: 'image',
    status: 'success',
    providerName: 'OpenRouter',
    model: 'openai/gpt-image-2',
    prompt: '一只冷银色机械猫',
    errorMessage: null,
    durationMs: 1200,
    createdAt: 1700000000000,
    ...overrides,
  }
}

/** 构造一条日志详情（含完整 4 阶段 JSON 负载） */
function makeLogDetail(overrides = {}) {
  return {
    ...makeLogSummary(),
    clientRequest: { prompt: '一只冷银色机械猫', draft: { model: 'openai/gpt-image-2' } },
    upstreamRequest: { model: 'openai/gpt-image-2', prompt: '一只冷银色机械猫' },
    upstreamResponse: { data: [{ b64_json: 'xxx' }] },
    clientResponse: { images: ['/files/a.png'], revisedPrompt: '' },
    ...overrides,
  }
}

describe('UsageLogPage', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    // ConfirmDialog / 详情抽屉通过 Teleport 挂到 body，测试间清理避免串扰
    document.body.innerHTML = ''
    vi.clearAllMocks()
    usageLogApi.listUsageLogs.mockResolvedValue([])
  })

  it('挂载时拉取日志列表并渲染表格行', async () => {
    usageLogApi.listUsageLogs.mockResolvedValue([
      makeLogSummary({ id: 'log-1', prompt: '一只猫' }),
      makeLogSummary({ id: 'log-2', type: 'video', status: 'error', prompt: '动起来' }),
    ])
    const router = createTestRouter('/logs')
    await router.isReady()

    const wrapper = mount(UsageLogPage, { global: { plugins: [router] } })
    await flushPromises()

    expect(usageLogApi.listUsageLogs).toHaveBeenCalled()
    // 表格含两行日志
    expect(wrapper.findAll('.log-row')).toHaveLength(2)
    expect(wrapper.text()).toContain('一只猫')
    expect(wrapper.text()).toContain('动起来')
    // 共 2 条计数
    expect(wrapper.text()).toContain('共 2 条')
  })

  it('无日志时显示空状态', async () => {
    usageLogApi.listUsageLogs.mockResolvedValue([])
    const router = createTestRouter('/logs')
    await router.isReady()

    const wrapper = mount(UsageLogPage, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.text()).toContain('暂无使用日志')
  })

  it('类型筛选按钮触发重新拉取（图像/视频）', async () => {
    usageLogApi.listUsageLogs.mockResolvedValue([])
    const router = createTestRouter('/logs')
    await router.isReady()

    const wrapper = mount(UsageLogPage, { global: { plugins: [router] } })
    await flushPromises()

    // 初始拉取不带 type
    expect(usageLogApi.listUsageLogs).toHaveBeenLastCalledWith({ type: undefined, limit: 200 })

    // 点击「视频」筛选
    const videoBtn = wrapper.findAll('.filter-btn').find((b) => b.text().includes('视频'))
    await videoBtn.trigger('click')
    await flushPromises()

    expect(usageLogApi.listUsageLogs).toHaveBeenLastCalledWith({ type: 'video', limit: 200 })
  })

  it('点击日志行加载详情并展示 4 阶段 JSON 区块', async () => {
    usageLogApi.listUsageLogs.mockResolvedValue([makeLogSummary({ id: 'log-1' })])
    usageLogApi.getUsageLogDetail.mockResolvedValue(makeLogDetail({ id: 'log-1' }))
    const router = createTestRouter('/logs')
    await router.isReady()

    const wrapper = mount(UsageLogPage, { global: { plugins: [router] } })
    await flushPromises()

    // 点击第一行
    await wrapper.find('.log-row').trigger('click')
    await flushPromises()

    expect(usageLogApi.getUsageLogDetail).toHaveBeenCalledWith('log-1')
    // 详情抽屉渲染（Teleport 在测试中 stub，原地渲染）
    expect(wrapper.find('.detail-drawer').exists()).toBe(true)
    // 4 阶段标题都在
    expect(wrapper.text()).toContain('前端请求')
    expect(wrapper.text()).toContain('上游请求')
    expect(wrapper.text()).toContain('上游响应')
    expect(wrapper.text()).toContain('前端响应')
    // JSON 查看器渲染了真实负载（prompt 值出现在序列化结果里）
    expect(wrapper.find('.json-viewer').exists()).toBe(true)
  })

  it('点击行内删除按钮删除单条日志并从列表移除', async () => {
    usageLogApi.listUsageLogs.mockResolvedValue([
      makeLogSummary({ id: 'log-1', prompt: '一只猫' }),
      makeLogSummary({ id: 'log-2', prompt: '一只狗' }),
    ])
    usageLogApi.deleteUsageLog.mockResolvedValue({ success: true })
    const router = createTestRouter('/logs')
    await router.isReady()

    const wrapper = mount(UsageLogPage, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.findAll('.log-row')).toHaveLength(2)

    // 点击第一行的删除按钮（row-delete-btn，点击事件已 stop 防止触发选行）
    await wrapper.find('.row-delete-btn').trigger('click')
    await flushPromises()

    expect(usageLogApi.deleteUsageLog).toHaveBeenCalledWith('log-1')
    // 列表移除该条
    expect(wrapper.findAll('.log-row')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('一只猫')
  })

  it('清空按钮弹二次确认，确认后清空列表', async () => {
    usageLogApi.listUsageLogs.mockResolvedValue([makeLogSummary({ id: 'log-1' })])
    usageLogApi.clearAllUsageLogs.mockResolvedValue({ success: true, deleted: 1 })
    const router = createTestRouter('/logs')
    await router.isReady()

    const wrapper = mount(UsageLogPage, { global: { plugins: [router] } })
    await flushPromises()

    // 点击「清空」只弹确认框，尚未真正清空
    await wrapper.find('.header-btn--danger').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-role="confirm-dialog"]').exists()).toBe(true)
    expect(usageLogApi.clearAllUsageLogs).not.toHaveBeenCalled()

    // 确认清空
    await wrapper.find('[data-action="confirm-confirm"]').trigger('click')
    await flushPromises()

    expect(usageLogApi.clearAllUsageLogs).toHaveBeenCalledTimes(1)
    // 列表清空 → 显示空状态
    expect(wrapper.find('.empty-state').exists()).toBe(true)
  })

  it('返回按钮跳转 /chat', async () => {
    usageLogApi.listUsageLogs.mockResolvedValue([])
    const router = createTestRouter('/logs')
    await router.isReady()

    const wrapper = mount(UsageLogPage, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.find('.back-btn').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/chat')
  })

  it('拉取失败时显示错误提示', async () => {
    usageLogApi.listUsageLogs.mockRejectedValue({ message: '网络错误' })
    const router = createTestRouter('/logs')
    await router.isReady()

    const wrapper = mount(UsageLogPage, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('.error-banner').exists()).toBe(true)
    expect(wrapper.text()).toContain('加载失败')
  })
})
