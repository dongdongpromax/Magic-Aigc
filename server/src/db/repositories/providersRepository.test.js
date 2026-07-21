import { describe, expect, it } from 'vitest'
import { createProvidersRepository } from './providersRepository.js'

/** 可编程 mock pool：handlers 为 [正则, rows] */
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

const providerRow = {
  id: 'openrouter',
  name: 'OpenRouter',
  base_url: 'https://openrouter.ai/api/v1',
  api_keys: '["sk-a","sk-b"]', // JSON 列在某些驱动下返回字符串，仓储需兼容
  enabled: 1,
  request_mode: 'openrouter-image',
  color: '#6366f1',
  is_builtin: 1,
  sort_order: 0,
  created_at: 1,
  updated_at: 2,
  model_count: 3,
  enabled_model_count: 2,
}

describe('providersRepository', () => {
  it('listProviders 返回驼峰映射并解析 api_keys JSON', async () => {
    const pool = createMockPool([[/FROM providers/, [providerRow]]])
    const repo = createProvidersRepository(pool)

    const list = await repo.listProviders()

    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      id: 'openrouter',
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKeys: ['sk-a', 'sk-b'],
      enabled: true,
      requestMode: 'openrouter-image',
      color: '#6366f1',
      isBuiltin: true,
      modelCount: 3,
      enabledModelCount: 2,
    })
  })

  it('listProviders 附带每家已启用模型简表（供聊天选择器）', async () => {
    const pool = createMockPool([
      [/FROM providers/, [providerRow]],
      [
        /FROM provider_models WHERE enabled = 1/,
        [
          {
            provider_id: 'openrouter',
            model_id: 'openai/gpt-image-2',
            display_name: 'GPT Image 2',
          },
        ],
      ],
    ])
    const repo = createProvidersRepository(pool)

    const list = await repo.listProviders()

    expect(list[0].enabledModels).toEqual([
      { modelId: 'openai/gpt-image-2', displayName: 'GPT Image 2' },
    ])
  })

  it('getProvider 返回单个 provider；不存在返回 null', async () => {
    const pool = createMockPool([[/FROM providers WHERE id = \?/, [providerRow]]])
    const repo = createProvidersRepository(pool)

    const found = await repo.getProvider('openrouter')
    expect(found.apiKeys).toEqual(['sk-a', 'sk-b'])

    const emptyPool = createMockPool([[/FROM providers WHERE id = \?/, []]])
    const missing = await createProvidersRepository(emptyPool).getProvider('nope')
    expect(missing).toBeNull()
  })

  it('createProvider 写入自定义中转站（is_builtin=0）', async () => {
    const pool = createMockPool()
    const repo = createProvidersRepository(pool)

    await repo.createProvider({
      id: 'custom-1',
      name: '我的中转站',
      baseUrl: 'https://x.example.com/v1',
      apiKeys: ['sk-x'],
    })

    const insert = pool.calls.find((c) => /INSERT INTO providers/.test(c.sql))
    expect(insert.params.slice(0, 5)).toEqual([
      'custom-1',
      '我的中转站',
      'https://x.example.com/v1',
      '["sk-x"]',
      1,
    ])
  })

  it('updateProvider 仅更新传入的字段', async () => {
    const pool = createMockPool()
    const repo = createProvidersRepository(pool)

    await repo.updateProvider('openrouter', { name: '新名字', apiKeys: ['sk-c'] })

    const update = pool.calls.find((c) => /UPDATE providers SET/.test(c.sql))
    expect(update.sql).toContain('name = ?')
    expect(update.sql).toContain('api_keys = ?')
    expect(update.sql).not.toContain('base_url = ?')
    expect(update.params).toContain('新名字')
    expect(update.params).toContain('["sk-c"]')
  })

  it('setProviderEnabled 切换整家开关', async () => {
    const pool = createMockPool()
    const repo = createProvidersRepository(pool)

    await repo.setProviderEnabled('openrouter', false)

    const update = pool.calls.find((c) => /UPDATE providers SET enabled/.test(c.sql))
    expect(update.params).toEqual([0, 'openrouter'])
  })

  it('deleteProvider 先重置引用草稿，再删模型与 provider', async () => {
    const pool = createMockPool()
    const repo = createProvidersRepository(pool)

    await repo.deleteProvider('openrouter')

    // 引用该家的草稿 provider_id 置 NULL（生成时走默认 provider 回退链）
    const reset = pool.calls.find((c) => /UPDATE drafts SET provider_id = NULL/.test(c.sql))
    expect(reset.params).toEqual(['openrouter'])

    const deletes = pool.calls.filter((c) => /DELETE FROM/.test(c.sql))
    expect(deletes).toHaveLength(2)
    expect(deletes[0].sql).toContain('provider_models')
    expect(deletes[1].sql).toContain('providers')
  })

  it('upsertFetchedModels 新增行标记 is_image/enabled，已存在行仅更新 display_name', async () => {
    const pool = createMockPool()
    const repo = createProvidersRepository(pool)

    await repo.upsertFetchedModels('openrouter', [
      { modelId: 'openai/gpt-image-2', displayName: 'GPT Image 2', isImage: true },
      { modelId: 'openai/gpt-4o', displayName: 'GPT-4o', isImage: false },
    ])

    const upserts = pool.calls.filter((c) => /INSERT INTO provider_models/.test(c.sql))
    expect(upserts).toHaveLength(2)
    // ON DUPLICATE KEY UPDATE 只更新 display_name，不触碰 enabled（保留用户开关）
    expect(upserts[0].sql).toContain('ON DUPLICATE KEY UPDATE display_name = VALUES(display_name)')
    // 图像模型 enabled=1，文本模型 enabled=0
    expect(upserts[0].params).toContain(1)
    expect(upserts[1].params).toContain(0)
  })

  it('setModelEnabled / deleteModel 按 provider+model 定位', async () => {
    const pool = createMockPool()
    const repo = createProvidersRepository(pool)

    await repo.setModelEnabled('openrouter', 'openai/gpt-4o', true)
    await repo.deleteModel('openrouter', 'openai/gpt-4o')

    const update = pool.calls.find((c) => /UPDATE provider_models SET enabled/.test(c.sql))
    expect(update.params).toEqual([1, 'openrouter', 'openai/gpt-4o'])
    const del = pool.calls.find((c) => /DELETE FROM provider_models/.test(c.sql))
    expect(del.params).toEqual(['openrouter', 'openai/gpt-4o'])
  })

  it('listModels 返回该家全部模型（含禁用）', async () => {
    const pool = createMockPool([
      [
        /FROM provider_models WHERE provider_id = \?/,
        [
          {
            id: 'm1',
            provider_id: 'openrouter',
            model_id: 'openai/gpt-image-2',
            display_name: 'GPT Image 2',
            group_name: 'openai',
            is_image: 1,
            enabled: 1,
            sort_order: 0,
            created_at: 1,
          },
        ],
      ],
    ])
    const repo = createProvidersRepository(pool)

    const models = await repo.listModels('openrouter')

    expect(models[0]).toMatchObject({
      modelId: 'openai/gpt-image-2',
      groupName: 'openai',
      isImage: true,
      enabled: true,
    })
  })
})
