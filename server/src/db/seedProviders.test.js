import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PRESET_PROVIDERS, migrateProvidersSchema, seedProvidersIfEmpty } from './seedProviders.js'

/**
 * 构造可编程的 mock pool：
 * handlers 为 [匹配正则, 返回 rows] 列表，按顺序匹配第一条
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

describe('migrateProvidersSchema', () => {
  it('建两张表并在缺列时执行 ALTER', async () => {
    // information_schema 探测全部返回 0（列不存在）
    const pool = createMockPool([[/information_schema/, [{ cnt: 0 }]]])

    await migrateProvidersSchema(pool)

    const sqls = pool.calls.map((c) => c.sql).join('\n')
    expect(sqls).toContain('CREATE TABLE IF NOT EXISTS providers')
    expect(sqls).toContain('CREATE TABLE IF NOT EXISTS provider_models')
    expect(sqls).toContain('ALTER TABLE drafts ADD COLUMN provider_id')
    expect(sqls).toContain('ALTER TABLE app_settings ADD COLUMN default_provider_id')
    // 视频模型默认参数列（通用设置按模型类型分区持久化）
    expect(sqls).toContain('ALTER TABLE app_settings ADD COLUMN default_ratio')
    expect(sqls).toContain('ALTER TABLE app_settings ADD COLUMN default_duration')
    expect(sqls).toContain('ALTER TABLE app_settings ADD COLUMN default_resolution')
    expect(sqls).toContain('ALTER TABLE app_settings ADD COLUMN default_video_ref_mode')
  })

  it('列已存在时跳过 ALTER（幂等）', async () => {
    const pool = createMockPool([[/information_schema/, [{ cnt: 1 }]]])

    await migrateProvidersSchema(pool)

    const sqls = pool.calls.map((c) => c.sql).join('\n')
    expect(sqls).not.toContain('ALTER TABLE')
  })
})

describe('seedProvidersIfEmpty', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('表为空时写入全部预设，OpenRouter 吸收 env Key 与旧 baseURL', async () => {
    const pool = createMockPool([[/COUNT\(\*\).*providers/, [{ cnt: 0 }]]])

    const result = await seedProvidersIfEmpty(pool, {
      envApiKey: 'REMOVED_SECRET',
      legacyBaseURL: 'https://my-gateway.example.com/v1',
      legacyDefaultModel: 'openai/gpt-image-2',
    })

    expect(result.seeded).toBe(true)

    // 每个预设一条 INSERT INTO providers
    const providerInserts = pool.calls.filter((c) => /INSERT INTO providers/.test(c.sql))
    expect(providerInserts).toHaveLength(PRESET_PROVIDERS.length)

    // OpenRouter 行：吸收 env key 与旧 baseURL
    const openrouter = providerInserts.find((c) => c.params[0] === 'openrouter')
    expect(openrouter.params[2]).toBe('https://my-gateway.example.com/v1')
    expect(JSON.parse(openrouter.params[3])).toEqual(['REMOVED_SECRET'])

    // 非 OpenRouter 行：空 key 数组 + 预设地址
    const siliconflow = providerInserts.find((c) => c.params[0] === 'siliconflow')
    expect(siliconflow.params[2]).toBe('https://api.siliconflow.cn/v1')
    expect(JSON.parse(siliconflow.params[3])).toEqual([])

    // 旧默认模型补一条启用的图像模型记录
    const modelInsert = pool.calls.find((c) => /INSERT INTO provider_models/.test(c.sql))
    expect(modelInsert.params.slice(1, 4)).toEqual([
      'openrouter',
      'openai/gpt-image-2',
      'openai/gpt-image-2',
    ])

    // default_provider_id 指向 openrouter
    const settingsUpsert = pool.calls.find((c) => /default_provider_id/.test(c.sql))
    expect(settingsUpsert).toBeTruthy()
  })

  it('表非空时跳过（幂等，二次启动不重复插入）', async () => {
    const pool = createMockPool([[/COUNT\(\*\).*providers/, [{ cnt: 6 }]]])

    const result = await seedProvidersIfEmpty(pool, {})

    expect(result.seeded).toBe(false)
    expect(pool.calls.filter((c) => /INSERT/.test(c.sql))).toHaveLength(0)
  })

  it('env Key 为空时 OpenRouter 的 api_keys 为空数组', async () => {
    const pool = createMockPool([[/COUNT\(\*\).*providers/, [{ cnt: 0 }]]])

    await seedProvidersIfEmpty(pool, {})

    const openrouter = pool.calls.find(
      (c) => /INSERT INTO providers/.test(c.sql) && c.params[0] === 'openrouter',
    )
    expect(JSON.parse(openrouter.params[3])).toEqual([])
  })
})
