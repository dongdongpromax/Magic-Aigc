import { describe, expect, it } from 'vitest'
import { createUsageLogRepository } from './usageLogRepository.js'

/**
 * 可编程 mock pool：handlers 为 [正则, rows] 元组数组
 * query 命中第一个匹配的正则即返回其 rows，并记录所有调用便于断言
 */
function createMockPool(handlers = []) {
  const calls = []
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params })
      for (const [pattern, rows] of handlers) {
        if (pattern.test(sql)) return [rows]
      }
      return [[]]
    },
  }
}

describe('usageLogRepository', () => {
  it('create 写入完整 4 阶段数据并返回 ID', async () => {
    const pool = createMockPool()
    const repo = createUsageLogRepository(pool)

    const id = await repo.create({
      topicId: 'topic-1',
      type: 'image',
      status: 'success',
      providerName: 'OpenRouter',
      model: 'openai/gpt-image-2',
      prompt: '一只猫',
      clientRequest: { prompt: '一只猫' },
      upstreamRequest: { model: 'openai/gpt-image-2' },
      upstreamResponse: { data: [{ b64_json: 'xxx' }] },
      clientResponse: { images: ['/files/a.png'] },
      resultFiles: [{ url: '/files/a.png', mimeType: 'image/png', kind: 'image' }],
      durationMs: 1200,
    })

    expect(id).toBeTruthy()
    const insert = pool.calls.find((c) => /INSERT INTO usage_logs/.test(c.sql))
    expect(insert).toBeTruthy()
    // 15 个占位符对应 15 个字段（含 result_files）
    expect(insert.params).toHaveLength(15)
    // 4 阶段 JSON 负载被序列化为字符串写入
    expect(insert.params[7]).toBe(JSON.stringify({ prompt: '一只猫' }))
    expect(insert.params[8]).toBe(JSON.stringify({ model: 'openai/gpt-image-2' }))
    // result_files 序列化为 JSON 字符串
    expect(insert.params[11]).toBe(
      JSON.stringify([{ url: '/files/a.png', mimeType: 'image/png', kind: 'image' }]),
    )
    expect(insert.params[12]).toBeNull() // errorMessage 为空 → null
    expect(insert.params[13]).toBe(1200) // durationMs
  })

  it('create 缺省字段时写 null，不抛错', async () => {
    const pool = createMockPool()
    const repo = createUsageLogRepository(pool)

    const id = await repo.create({ type: 'video', status: 'error' })

    expect(id).toBeTruthy()
    const insert = pool.calls[0]
    // params[0] 为生成的 id（非空字符串），topicId/providerName/model/prompt 缺省 → null
    expect(insert.params[0]).toBe(id) // id
    expect(insert.params[1]).toBeNull() // topicId
    expect(insert.params[4]).toBeNull() // providerName
    expect(insert.params[5]).toBeNull() // model
    expect(insert.params[6]).toBeNull() // prompt
    // 未提供 JSON 负载 → null
    expect(insert.params[7]).toBeNull()
    expect(insert.params[11]).toBeNull() // resultFiles
    expect(insert.params[12]).toBeNull() // errorMessage
    expect(insert.params[13]).toBeNull() // durationMs
  })

  it('create 支持显式传入 executor（事务连接）', async () => {
    const pool = createMockPool()
    const repo = createUsageLogRepository(pool)

    const conn = { async query() {} }
    const spy = { calls: [], async query(sql, params = []) { this.calls.push({ sql, params }) } }
    await repo.create({ type: 'image', status: 'success' }, spy)

    // 应使用传入的 conn 而非 pool
    expect(spy.calls).toHaveLength(1)
    expect(pool.calls).toHaveLength(0)
  })

  it('list 返回摘要列表（不含完整 JSON 负载），按 created_at 倒序', async () => {
    const pool = createMockPool([
      [
        /FROM usage_logs/,
        [
          {
            id: 'log-2',
            topic_id: 'topic-2',
            type: 'video',
            status: 'success',
            provider_name: '火山方舟',
            model: 'seedance-1-0',
            prompt: '动起来',
            result_files: '[{"url":"/files/v.mp4","mimeType":"video/mp4","kind":"video"}]',
            error_message: null,
            duration_ms: 5000,
            created_at: 200,
          },
          {
            id: 'log-1',
            topic_id: null,
            type: 'image',
            status: 'error',
            provider_name: null,
            model: null,
            prompt: null,
            result_files: null,
            error_message: '超时',
            duration_ms: null,
            created_at: 100,
          },
        ],
      ],
    ])
    const repo = createUsageLogRepository(pool)

    const list = await repo.list()

    expect(list).toHaveLength(2)
    // 驼峰映射 + 摘要字段齐全
    expect(list[0]).toMatchObject({
      id: 'log-2',
      topicId: 'topic-2',
      type: 'video',
      status: 'success',
      providerName: '火山方舟',
      model: 'seedance-1-0',
      prompt: '动起来',
      durationMs: 5000,
      createdAt: 200,
    })
    // 摘要列表不应包含完整 JSON 负载字段
    expect(list[0]).not.toHaveProperty('clientRequest')
    expect(list[0]).not.toHaveProperty('upstreamResponse')
  })

  it('list 按 type 筛选并注入 WHERE 子句', async () => {
    const pool = createMockPool([[/FROM usage_logs/, []]])
    const repo = createUsageLogRepository(pool)

    await repo.list({ type: 'video', limit: 50, offset: 10 })

    const select = pool.calls[0]
    expect(select.sql).toContain('WHERE type = ?')
    expect(select.sql).toContain('LIMIT ? OFFSET ?')
    expect(select.params).toEqual(['video', 50, 10])
  })

  it('list 不传 type 时不带 WHERE，使用默认 limit=100 offset=0', async () => {
    const pool = createMockPool([[/FROM usage_logs/, []]])
    const repo = createUsageLogRepository(pool)

    await repo.list()

    const select = pool.calls[0]
    expect(select.sql).not.toContain('WHERE')
    expect(select.params).toEqual([100, 0])
  })

  it('findById 返回完整 4 阶段 JSON 负载（解析字符串为对象）', async () => {
    const pool = createMockPool([
      [
        /WHERE id = \? LIMIT 1/,
        [
          {
            id: 'log-1',
            topic_id: 'topic-1',
            type: 'image',
            status: 'success',
            provider_name: 'OpenRouter',
            model: 'openai/gpt-image-2',
            prompt: '一只猫',
            // JSON 列在 mysql2 下通常已解析为对象，但仓储需兼容字符串形态
            client_request: '{"prompt":"一只猫"}',
            upstream_request: '{"model":"openai/gpt-image-2"}',
            upstream_response: '{"data":[]}',
            client_response: '{"images":["/files/a.png"]}',
            result_files: '[{"url":"/files/a.png","mimeType":"image/png","kind":"image"}]',
            error_message: null,
            duration_ms: 1200,
            created_at: 100,
          },
        ],
      ],
    ])
    const repo = createUsageLogRepository(pool)

    const detail = await repo.findById('log-1')

    expect(detail).toMatchObject({
      id: 'log-1',
      topicId: 'topic-1',
      type: 'image',
      status: 'success',
      providerName: 'OpenRouter',
      prompt: '一只猫',
      durationMs: 1200,
    })
    // 字符串 JSON 被解析回对象
    expect(detail.clientRequest).toEqual({ prompt: '一只猫' })
    expect(detail.upstreamRequest).toEqual({ model: 'openai/gpt-image-2' })
    expect(detail.upstreamResponse).toEqual({ data: [] })
    expect(detail.clientResponse).toEqual({ images: ['/files/a.png'] })
    expect(detail.resultFiles).toEqual([{ url: '/files/a.png', mimeType: 'image/png', kind: 'image' }])
  })

  it('findById 不存在时返回 null', async () => {
    const pool = createMockPool([[/WHERE id = \? LIMIT 1/, []]])
    const repo = createUsageLogRepository(pool)

    const detail = await repo.findById('nope')
    expect(detail).toBeNull()
  })

  it('findById 兼容 JSON 列已为对象形态（mysql2 自动解析）', async () => {
    const pool = createMockPool([
      [
        /WHERE id = \? LIMIT 1/,
        [
          {
            id: 'log-2',
            topic_id: null,
            type: 'video',
            status: 'error',
            provider_name: null,
            model: null,
            prompt: null,
            client_request: { already: 'object' },
            upstream_request: null,
            upstream_response: null,
            client_response: null,
            error_message: '上游超时',
            duration_ms: null,
            created_at: 300,
          },
        ],
      ],
    ])
    const repo = createUsageLogRepository(pool)

    const detail = await repo.findById('log-2')
    expect(detail.clientRequest).toEqual({ already: 'object' })
    expect(detail.upstreamRequest).toBeNull()
    expect(detail.errorMessage).toBe('上游超时')
  })

  it('deleteById 返回是否删除成功（affectedRows>0）', async () => {
    const pool = createMockPool([[/DELETE FROM usage_logs WHERE id/, { affectedRows: 1 }]])
    const repo = createUsageLogRepository(pool)

    const ok = await repo.deleteById('log-1')
    expect(ok).toBe(true)
    expect(pool.calls[0].params).toEqual(['log-1'])
  })

  it('deleteById 不存在时返回 false', async () => {
    const pool = createMockPool([[/DELETE FROM usage_logs WHERE id/, { affectedRows: 0 }]])
    const repo = createUsageLogRepository(pool)

    const ok = await repo.deleteById('nope')
    expect(ok).toBe(false)
  })

  it('deleteAll 清空全表并返回删除行数', async () => {
    const pool = createMockPool([[/DELETE FROM usage_logs$/, { affectedRows: 42 }]])
    const repo = createUsageLogRepository(pool)

    const count = await repo.deleteAll()
    expect(count).toBe(42)
  })

  it('countByType 按 type 聚合返回 image/video/total 计数', async () => {
    const pool = createMockPool([
      [/GROUP BY type/, [{ type: 'image', cnt: 12 }, { type: 'video', cnt: 5 }]],
    ])
    const repo = createUsageLogRepository(pool)

    const result = await repo.countByType()

    expect(result).toEqual({ image: 12, video: 5, total: 17 })
  })

  it('countByType 无数据时返回全 0', async () => {
    const pool = createMockPool([[/GROUP BY type/, []]])
    const repo = createUsageLogRepository(pool)

    const result = await repo.countByType()

    expect(result).toEqual({ image: 0, video: 0, total: 0 })
  })
})
