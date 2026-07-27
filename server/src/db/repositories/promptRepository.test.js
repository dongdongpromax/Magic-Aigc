import { describe, expect, it } from 'vitest'
import { createPromptRepository } from './promptRepository.js'

/**
 * 可编程 mock pool：handlers 为 [正则, rows/result] 元组数组
 * query 命中第一个匹配的正则即返回其结果，并记录所有调用便于断言
 */
function createMockPool(handlers = []) {
  const calls = []
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params })
      for (const [pattern, rows] of handlers) {
        if (pattern.test(sql)) return Array.isArray(rows) && rows.affectedRows !== undefined ? [rows] : [rows]
      }
      return [[]]
    },
  }
}

describe('promptRepository', () => {
  it('create 写入完整字段并返回 ID', async () => {
    const pool = createMockPool()
    const repo = createPromptRepository(pool)

    const id = await repo.create({
      title: '赛博朋克人物',
      content: '霓虹灯下的特写...',
      type: 'image',
      tags: ['赛博朋克', '人物特写'],
      assets: [{ url: '/files/prompts/a.png', mimeType: 'image/png', kind: 'image', name: 'a.png' }],
      notes: '备注',
    })

    expect(id).toBeTruthy()
    const insert = pool.calls[0]
    expect(insert.sql).toContain('INSERT INTO prompts')
    // 10 个占位符对应 10 个字段
    expect(insert.params).toHaveLength(10)
    expect(insert.params[0]).toBe(id)
    expect(insert.params[1]).toBe('赛博朋克人物')
    expect(insert.params[3]).toBe('image')
    // tags / assets 序列化为 JSON 字符串
    expect(insert.params[4]).toBe(JSON.stringify(['赛博朋克', '人物特写']))
    expect(insert.params[5]).toBe(
      JSON.stringify([{ url: '/files/prompts/a.png', mimeType: 'image/png', kind: 'image', name: 'a.png' }]),
    )
  })

  it('create 缺省字段时回退到默认值（type 非法回退 text）', async () => {
    const pool = createMockPool()
    const repo = createPromptRepository(pool)

    const id = await repo.create({ title: '空提示词', content: '', type: 'unknown' })

    expect(id).toBeTruthy()
    const insert = pool.calls[0]
    expect(insert.params[1]).toBe('空提示词')
    // type 非法 → 回退 'text'
    expect(insert.params[3]).toBe('text')
    expect(insert.params[4]).toBe('[]')
    expect(insert.params[5]).toBe('[]')
    expect(insert.params[6]).toBeNull() // notes 缺省 → null
  })

  it('create 支持显式传入 executor（事务连接）', async () => {
    const pool = createMockPool()
    const repo = createPromptRepository(pool)

    const spy = { calls: [], async query(sql, params = []) { this.calls.push({ sql, params }) } }
    await repo.create({ title: 't', content: 'c', type: 'video' }, spy)

    expect(spy.calls).toHaveLength(1)
    expect(pool.calls).toHaveLength(0)
  })

  it('list 不带筛选时返回全部（按 sort_order、created_at 倒序）', async () => {
    const pool = createMockPool([
      [
        /FROM prompts/,
        [
          {
            id: 'p1',
            title: '提示词1',
            content: '内容1',
            type: 'image',
            tags: '["a","b"]',
            assets: '[{"url":"/files/prompts/a.png","mimeType":"image/png","kind":"image","name":"a.png"}]',
            notes: null,
            sort_order: 0,
            created_at: 200,
            updated_at: 200,
          },
        ],
      ],
    ])
    const repo = createPromptRepository(pool)

    const list = await repo.list()

    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      id: 'p1',
      title: '提示词1',
      type: 'image',
      sortOrder: 0,
      createdAt: 200,
    })
    // JSON 字段被解析为数组
    expect(list[0].tags).toEqual(['a', 'b'])
    expect(list[0].assets).toEqual([
      { url: '/files/prompts/a.png', mimeType: 'image/png', kind: 'image', name: 'a.png' },
    ])
  })

  it('list 按 type 筛选注入 WHERE type = ?', async () => {
    const pool = createMockPool([[/FROM prompts/, []]])
    const repo = createPromptRepository(pool)

    await repo.list({ type: 'video' })

    const select = pool.calls[0]
    expect(select.sql).toContain('WHERE type = ?')
    expect(select.params[0]).toBe('video')
  })

  it('list 按 tag 筛选用 JSON_CONTAINS', async () => {
    const pool = createMockPool([[/FROM prompts/, []]])
    const repo = createPromptRepository(pool)

    await repo.list({ tag: '赛博朋克' })

    const select = pool.calls[0]
    expect(select.sql).toContain('JSON_CONTAINS(tags, JSON_QUOTE(?))')
    expect(select.params[0]).toBe('赛博朋克')
  })

  it('list 按 keyword 筛选匹配标题或正文', async () => {
    const pool = createMockPool([[/FROM prompts/, []]])
    const repo = createPromptRepository(pool)

    await repo.list({ keyword: '霓虹' })

    const select = pool.calls[0]
    expect(select.sql).toContain('title LIKE ? OR content LIKE ?')
    expect(select.params[0]).toBe('%霓虹%')
    expect(select.params[1]).toBe('%霓虹%')
  })

  it('list 多条件组合用 AND 连接', async () => {
    const pool = createMockPool([[/FROM prompts/, []]])
    const repo = createPromptRepository(pool)

    await repo.list({ type: 'image', tag: '人物', keyword: '特写' })

    const select = pool.calls[0]
    expect(select.sql).toContain('type = ?')
    expect(select.sql).toContain('JSON_CONTAINS(tags, JSON_QUOTE(?))')
    expect(select.sql).toContain('title LIKE ? OR content LIKE ?')
    expect(select.sql).toContain('WHERE')
    expect(select.sql).toContain('AND')
  })

  it('list 兼容 JSON 列已为数组形态（mysql2 自动解析）', async () => {
    const pool = createMockPool([
      [
        /FROM prompts/,
        [
          {
            id: 'p2',
            title: 't',
            content: 'c',
            type: 'video',
            tags: ['x', 'y'],
            assets: [{ url: '/files/prompts/v.mp4', mimeType: 'video/mp4', kind: 'video', name: 'v.mp4' }],
            notes: null,
            sort_order: 0,
            created_at: 100,
            updated_at: 100,
          },
        ],
      ],
    ])
    const repo = createPromptRepository(pool)

    const list = await repo.list()
    expect(list[0].tags).toEqual(['x', 'y'])
    expect(list[0].assets).toEqual([
      { url: '/files/prompts/v.mp4', mimeType: 'video/mp4', kind: 'video', name: 'v.mp4' },
    ])
  })

  it('findById 返回完整字段（解析 JSON 字符串为对象）', async () => {
    const pool = createMockPool([
      [
        /WHERE id = \? LIMIT 1/,
        [
          {
            id: 'p1',
            title: '标题',
            content: '正文',
            type: 'audio',
            tags: '["音乐"]',
            assets: '[{"url":"/files/prompts/a.mp3","mimeType":"audio/mpeg","kind":"audio","name":"a.mp3"}]',
            notes: '备注',
            sort_order: 3,
            created_at: 100,
            updated_at: 200,
          },
        ],
      ],
    ])
    const repo = createPromptRepository(pool)

    const detail = await repo.findById('p1')

    expect(detail).toMatchObject({
      id: 'p1',
      title: '标题',
      content: '正文',
      type: 'audio',
      notes: '备注',
      sortOrder: 3,
      createdAt: 100,
      updatedAt: 200,
    })
    expect(detail.tags).toEqual(['音乐'])
    expect(detail.assets).toEqual([
      { url: '/files/prompts/a.mp3', mimeType: 'audio/mpeg', kind: 'audio', name: 'a.mp3' },
    ])
  })

  it('findById 不存在时返回 null', async () => {
    const pool = createMockPool([[/WHERE id = \? LIMIT 1/, []]])
    const repo = createPromptRepository(pool)

    const detail = await repo.findById('nope')
    expect(detail).toBeNull()
  })

  it('update 仅更新 patch 中出现的字段，并自动追加 updated_at', async () => {
    const pool = createMockPool([[/UPDATE prompts/, { affectedRows: 1 }]])
    const repo = createPromptRepository(pool)

    const ok = await repo.update('p1', { title: '新标题', tags: ['a'] })

    expect(ok).toBe(true)
    const upd = pool.calls[0]
    expect(upd.sql).toContain('title = ?')
    expect(upd.sql).toContain('tags = ?')
    expect(upd.sql).toContain('updated_at = ?')
    // 不应包含未传入的字段
    expect(upd.sql).not.toContain('content = ?')
    expect(upd.params[0]).toBe('新标题')
    expect(upd.params[1]).toBe(JSON.stringify(['a']))
  })

  it('update type 非法时不写入 type 字段', async () => {
    const pool = createMockPool([[/UPDATE prompts/, { affectedRows: 1 }]])
    const repo = createPromptRepository(pool)

    await repo.update('p1', { type: 'invalid', title: 'x' })

    const upd = pool.calls[0]
    expect(upd.sql).not.toContain('type = ?')
    expect(upd.sql).toContain('title = ?')
  })

  it('update 空 patch 时仅校验目标存在', async () => {
    const pool = createMockPool([[/SELECT id FROM prompts/, [{ id: 'p1' }]]])
    const repo = createPromptRepository(pool)

    const ok = await repo.update('p1', {})
    expect(ok).toBe(true)
    expect(pool.calls[0].sql).toContain('SELECT id FROM prompts')
  })

  it('update 不存在时返回 false', async () => {
    const pool = createMockPool([[/UPDATE prompts/, { affectedRows: 0 }]])
    const repo = createPromptRepository(pool)

    const ok = await repo.update('nope', { title: 'x' })
    expect(ok).toBe(false)
  })

  it('deleteById 返回是否删除成功', async () => {
    const pool = createMockPool([[/DELETE FROM prompts WHERE id/, { affectedRows: 1 }]])
    const repo = createPromptRepository(pool)

    const ok = await repo.deleteById('p1')
    expect(ok).toBe(true)
    expect(pool.calls[0].params).toEqual(['p1'])
  })

  it('deleteById 不存在时返回 false', async () => {
    const pool = createMockPool([[/DELETE FROM prompts WHERE id/, { affectedRows: 0 }]])
    const repo = createPromptRepository(pool)

    const ok = await repo.deleteById('nope')
    expect(ok).toBe(false)
  })

  it('count 返回提示词总数', async () => {
    const pool = createMockPool([[/COUNT\(\*\) AS cnt FROM prompts/, [{ cnt: 42 }]]])
    const repo = createPromptRepository(pool)

    const count = await repo.count()
    expect(count).toBe(42)
  })

  it('count 无数据时返回 0', async () => {
    const pool = createMockPool([[/COUNT\(\*\) AS cnt FROM prompts/, [{ cnt: 0 }]]])
    const repo = createPromptRepository(pool)

    const count = await repo.count()
    expect(count).toBe(0)
  })
})
