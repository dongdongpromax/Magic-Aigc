# 多中转站模型广场 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把设置面板升级为 CherryStudio 式「模型广场」：多中转站配置（独立 Key/地址/开关）、代理拉取模型列表、多 Key 轮询，聊天框可按「中转站 → 模型」选择生成目标。

**Architecture:** 后端新增 providers 模块（2 张新表 + 仓储 + 服务 + REST 路由 + 多 Key 轮询 upstreamClient），生成链路按 `draft.providerId` 路由；前端新增 providers store + 全屏左右分栏 SettingsModal（即时保存），InputConsole 换分组模型选择器。

**Tech Stack:** Vue 3 + Pinia + Naive UI（前端）；Express + mysql2（后端）；vitest + supertest + @vue/test-utils（测试）。

**Spec:** `docs/superpowers/specs/2026-07-22-multi-provider-model-hub-design.md`

**Commit 约定：** 每个 Task 末尾的 commit 步骤仅在用户明确要求时执行，默认跳过。

---

## 文件结构

### 后端（新建）

| 文件                                                | 职责                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| `server/src/db/seedProviders.js`                    | 预设中转站列表 + 首次 seed（吸收 .env Key 与旧 settings）         |
| `server/src/db/repositories/providersRepository.js` | providers / provider_models 两表 SQL 访问                         |
| `server/src/modules/providers/upstreamClient.js`    | 代理调上游：多 Key 轮询、401 换 Key 重试、check、拉模型、图像生成 |
| `server/src/modules/providers/providersService.js`  | 业务逻辑：check / fetchModels diff 合并 / resolveForDraft         |
| `server/src/modules/providers/routes.js`            | REST 路由（11 个端点）                                            |
| `server/src/modules/providers/imagePayload.js`      | 图像生成 payload 构建（修 size:auto 超时 bug）                    |

### 后端（修改）

| 文件                                               | 改动                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| `server/src/db/init.js`                            | 加 `migrateProvidersSchema(pool)`（建表 + 幂等加列）                         |
| `server/sql/init.sql`                              | 同步两表 + 两列 DDL（docker 首次初始化用）                                   |
| `server/src/db/repositories/draftRepository.js`    | getDraft/saveDraft 读写 `provider_id`                                        |
| `server/src/db/repositories/settingsRepository.js` | get/save 读写 `default_provider_id`                                          |
| `server/src/app.js`                                | 挂载 `/api/providers` 路由（注入 providersService）                          |
| `server/src/server.js`                             | 启动时迁移+seed；generateImageMessage 改走 providersService + upstreamClient |

### 前端（新建）

| 文件                                         | 职责                                                  |
| -------------------------------------------- | ----------------------------------------------------- |
| `src/services/providersApi.js`               | 11 个端点的 HTTP 封装                                 |
| `src/store/providers.js`                     | providers Pinia store（列表/选中/模型/检测/拉取状态） |
| `src/components/settings/SettingsModal.vue`  | 全屏模态骨架（左栏 + 右栏 + 通用设置）                |
| `src/components/settings/ProviderList.vue`   | 左栏：搜索 + 中转站列表 + 开关 + 添加                 |
| `src/components/settings/ProviderDetail.vue` | 右栏：Key 编辑/检测、地址、模型区                     |

### 前端（修改/删除）

| 文件                                  | 改动                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| `src/store/chat.js`                   | draft 加 `providerId`；`hasConfig` 改读 providers store；bootstrap 加载 providers |
| `src/components/InputConsole.vue`     | 模型单选换分组下拉（`providerId::modelId` 复合键）                                |
| `src/components/ChatArea.vue`         | SettingsDrawer 替换为 SettingsModal                                               |
| `src/components/ImageMessageCard.vue` | meta 行追加「· 中转站名」（读 message.meta.providerName）                         |
| `src/components/SettingsDrawer.vue`   | **删除**                                                                          |

---

## Task 1: 后端 — DB 迁移 + 预设 seed

**Files:**

- Create: `server/src/db/seedProviders.js`
- Modify: `server/src/db/init.js`
- Modify: `server/sql/init.sql`
- Test: `server/src/db/seedProviders.test.js`

- [ ] **Step 1: 写失败测试**

创建 `server/src/db/seedProviders.test.js`：

```js
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- --run server/src/db/seedProviders.test.js`
Expected: FAIL（Cannot find module './seedProviders.js'）

- [ ] **Step 3: 实现 seedProviders.js**

创建 `server/src/db/seedProviders.js`：

```js
/**
 * 预设中转站列表 + providers 相关 schema 迁移 + 首次 seed
 *
 * 迁移与 seed 均为幂等实现，后端每次启动都会调用：
 * - migrateProvidersSchema：CREATE TABLE IF NOT EXISTS + 探测后补列
 * - seedProvidersIfEmpty：providers 表为空时写入预设，并吸收
 *   server/.env 的 OPENROUTER_API_KEY 与旧 app_settings 配置
 */

/** 预设中转站（is_builtin=1），默认仅 OpenRouter 启用 */
export const PRESET_PROVIDERS = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    color: '#6366f1',
    enabled: 1,
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    color: '#7c3aed',
    enabled: 0,
  },
  {
    id: 'aihubmix',
    name: 'AiHubMix',
    baseUrl: 'https://aihubmix.com/v1',
    color: '#0ea5e9',
    enabled: 0,
  },
  {
    id: 'dmxapi',
    name: 'DMXAPI',
    baseUrl: 'https://www.dmxapi.cn/v1',
    color: '#f59e0b',
    enabled: 0,
  },
  {
    id: 'openai',
    name: 'OpenAI 官方',
    baseUrl: 'https://api.openai.com/v1',
    color: '#10a37f',
    enabled: 0,
  },
  {
    id: 'api2d',
    name: 'API2D',
    baseUrl: 'https://openai.api2d.net/v1',
    color: '#ef4444',
    enabled: 0,
  },
]

/**
 * 生成唯一 ID
 * @returns {string}
 */
function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * 取模型 ID 的分组名（'/' 前缀，无 '/' 归「其他」）
 * @param {string} modelId 如 'openai/gpt-image-2'
 * @returns {string}
 */
export function groupOfModel(modelId) {
  const idx = String(modelId).indexOf('/')
  return idx > 0 ? String(modelId).slice(0, idx) : '其他'
}

/**
 * 探测列是否存在，不存在才执行 ALTER（幂等加列）
 */
async function ensureColumn(pool, table, column, alterSql) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  )
  if (Number(rows[0]?.cnt) === 0) {
    await pool.query(alterSql)
  }
}

/**
 * providers 相关 schema 迁移（幂等）
 * @param {import('mysql2/promise').Pool} pool
 */
export async function migrateProvidersSchema(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS providers (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    base_url VARCHAR(255) NOT NULL,
    api_keys JSON NOT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    request_mode VARCHAR(60) NOT NULL DEFAULT 'openrouter-image',
    color VARCHAR(20) NULL,
    is_builtin TINYINT(1) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  )`)

  await pool.query(`CREATE TABLE IF NOT EXISTS provider_models (
    id VARCHAR(64) PRIMARY KEY,
    provider_id VARCHAR(64) NOT NULL,
    model_id VARCHAR(190) NOT NULL,
    display_name VARCHAR(255) NULL,
    group_name VARCHAR(120) NULL,
    is_image TINYINT(1) NOT NULL DEFAULT 0,
    enabled TINYINT(1) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    UNIQUE KEY uq_provider_model (provider_id, model_id)
  )`)

  await ensureColumn(
    pool,
    'drafts',
    'provider_id',
    'ALTER TABLE drafts ADD COLUMN provider_id VARCHAR(64) NULL',
  )
  await ensureColumn(
    pool,
    'app_settings',
    'default_provider_id',
    'ALTER TABLE app_settings ADD COLUMN default_provider_id VARCHAR(64) NULL',
  )
}

/**
 * 首次 seed：providers 表为空时写入预设列表
 *
 * OpenRouter 预设自动吸收：
 * - api_keys   ← server/.env 的 OPENROUTER_API_KEY（非空才写）
 * - base_url   ← 旧 app_settings.base_url（非空才覆盖）
 * - 旧 default_model 补一条 enabled 的图像模型记录
 * - app_settings.default_provider_id 置为 'openrouter'
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ envApiKey?: string; legacyBaseURL?: string; legacyDefaultModel?: string }} deps
 * @returns {Promise<{ seeded: boolean }>}
 */
export async function seedProvidersIfEmpty(pool, deps = {}) {
  const { envApiKey = '', legacyBaseURL = '', legacyDefaultModel = '' } = deps

  const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM providers')
  if (Number(rows[0]?.cnt) > 0) return { seeded: false }

  const now = Date.now()
  for (const [index, preset] of PRESET_PROVIDERS.entries()) {
    const apiKeys = preset.id === 'openrouter' && envApiKey ? [envApiKey] : []
    const baseUrl = preset.id === 'openrouter' && legacyBaseURL ? legacyBaseURL : preset.baseUrl
    await pool.query(
      `INSERT INTO providers
        (id, name, base_url, api_keys, enabled, request_mode, color, is_builtin, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'openrouter-image', ?, 1, ?, ?, ?)`,
      [
        preset.id,
        preset.name,
        baseUrl,
        JSON.stringify(apiKeys),
        preset.enabled,
        preset.color,
        index,
        now,
        now,
      ],
    )
  }

  if (legacyDefaultModel) {
    await pool.query(
      `INSERT INTO provider_models
        (id, provider_id, model_id, display_name, group_name, is_image, enabled, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, 1, 1, 0, ?)`,
      [
        createId(),
        'openrouter',
        legacyDefaultModel,
        legacyDefaultModel,
        groupOfModel(legacyDefaultModel),
        now,
      ],
    )
  }

  await pool.query(
    `INSERT INTO app_settings
      (id, base_url, default_model, default_size, default_quality, default_n, request_mode, timeout, default_provider_id)
     VALUES (1, 'https://openrouter.ai/api/v1', ?, 'auto', 'high', 1, 'openrouter-image', 1200000, 'openrouter')
     ON DUPLICATE KEY UPDATE default_provider_id = 'openrouter'`,
    [legacyDefaultModel || 'openai/gpt-image-2'],
  )

  return { seeded: true }
}
```

- [ ] **Step 4: 改造 init.js 与 init.sql**

`server/src/db/init.js` 改为：

```js
export { migrateProvidersSchema, seedProvidersIfEmpty } from './seedProviders.js'

export async function verifyDatabaseConnection(pool) {
  await pool.query('SELECT 1')
}
```

`server/sql/init.sql` 在 `app_settings` 表定义后追加（保持 docker 首次初始化与迁移一致）：

```sql
ALTER TABLE app_settings ADD COLUMN default_provider_id VARCHAR(64) NULL;

CREATE TABLE IF NOT EXISTS providers (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  base_url VARCHAR(255) NOT NULL,
  api_keys JSON NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  request_mode VARCHAR(60) NOT NULL DEFAULT 'openrouter-image',
  color VARCHAR(20) NULL,
  is_builtin TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_models (
  id VARCHAR(64) PRIMARY KEY,
  provider_id VARCHAR(64) NOT NULL,
  model_id VARCHAR(190) NOT NULL,
  display_name VARCHAR(255) NULL,
  group_name VARCHAR(120) NULL,
  is_image TINYINT(1) NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  UNIQUE KEY uq_provider_model (provider_id, model_id)
);

ALTER TABLE drafts ADD COLUMN provider_id VARCHAR(64) NULL;
```

（注意：init.sql 是 docker 首次建库脚本，`ALTER TABLE` 针对本文件内新建的表执行是安全的。）

- [ ] **Step 5: 跑测试确认通过**

Run: `npm run test -- --run server/src/db/seedProviders.test.js`
Expected: PASS（5 tests）

---

## Task 2: 后端 — providersRepository

**Files:**

- Create: `server/src/db/repositories/providersRepository.js`
- Test: `server/src/db/repositories/providersRepository.test.js`

- [ ] **Step 1: 写失败测试**

创建 `server/src/db/repositories/providersRepository.test.js`：

```js
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- --run server/src/db/repositories/providersRepository.test.js`
Expected: FAIL（Cannot find module）

- [ ] **Step 3: 实现 providersRepository.js**

创建 `server/src/db/repositories/providersRepository.js`：

```js
import { groupOfModel } from '../seedProviders.js'

/**
 * 中转站仓储模块
 *
 * 负责 providers / provider_models 两张表的读写。
 * api_keys 为 JSON 列：mysql2 多数情况自动解析为数组，
 * 但部分配置下返回字符串，此处统一兼容两种形态。
 */

/**
 * 解析 api_keys JSON 列为字符串数组
 * @param {unknown} raw
 * @returns {Array<string>}
 */
function parseApiKeys(raw) {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

/**
 * providers 行 → 驼峰对象
 */
function mapProviderRow(row) {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    apiKeys: parseApiKeys(row.api_keys),
    enabled: Boolean(row.enabled),
    requestMode: row.request_mode,
    color: row.color,
    isBuiltin: Boolean(row.is_builtin),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    modelCount: row.model_count != null ? Number(row.model_count) : undefined,
    enabledModelCount:
      row.enabled_model_count != null ? Number(row.enabled_model_count) : undefined,
  }
}

/**
 * provider_models 行 → 驼峰对象
 */
function mapModelRow(row) {
  return {
    id: row.id,
    providerId: row.provider_id,
    modelId: row.model_id,
    displayName: row.display_name,
    groupName: row.group_name,
    isImage: Boolean(row.is_image),
    enabled: Boolean(row.enabled),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  }
}

/**
 * 创建中转站仓储
 * @param {import('mysql2/promise').Pool} pool
 */
export function createProvidersRepository(pool) {
  return {
    /**
     * 列出全部中转站（按 sort_order），含模型统计与已启用模型简表
     * 已启用模型简表供聊天输入框的分组选择器一次取齐，避免 N+1
     * @returns {Promise<Array<object>>}
     */
    async listProviders() {
      const [rows] = await pool.query(
        `SELECT p.*,
          (SELECT COUNT(*) FROM provider_models m WHERE m.provider_id = p.id) AS model_count,
          (SELECT COUNT(*) FROM provider_models m WHERE m.provider_id = p.id AND m.enabled = 1) AS enabled_model_count
         FROM providers p ORDER BY p.sort_order ASC, p.created_at ASC`,
      )
      const providers = rows.map(mapProviderRow)

      const [modelRows] = await pool.query(
        `SELECT provider_id, model_id, display_name FROM provider_models WHERE enabled = 1 ORDER BY sort_order ASC, created_at ASC`,
      )
      const byProvider = new Map()
      for (const m of modelRows) {
        if (!byProvider.has(m.provider_id)) byProvider.set(m.provider_id, [])
        byProvider.get(m.provider_id).push({ modelId: m.model_id, displayName: m.display_name })
      }
      for (const p of providers) {
        p.enabledModels = byProvider.get(p.id) || []
      }

      return providers
    },

    /**
     * 按 ID 取单个中转站
     * @param {string} id
     * @returns {Promise<object|null>}
     */
    async getProvider(id) {
      const [rows] = await pool.query('SELECT * FROM providers WHERE id = ? LIMIT 1', [id])
      return rows[0] ? mapProviderRow(rows[0]) : null
    },

    /**
     * 取第一个启用中的中转站（default_provider_id 回退链末端）
     * @returns {Promise<object|null>}
     */
    async getFirstEnabledProvider() {
      const [rows] = await pool.query(
        'SELECT * FROM providers WHERE enabled = 1 ORDER BY sort_order ASC LIMIT 1',
      )
      return rows[0] ? mapProviderRow(rows[0]) : null
    },

    /**
     * 新增自定义中转站
     * @param {{ id: string; name: string; baseUrl: string; apiKeys?: Array<string>; color?: string }} data
     * @returns {Promise<object>} 新建对象
     */
    async createProvider(data) {
      const now = Date.now()
      await pool.query(
        `INSERT INTO providers
          (id, name, base_url, api_keys, enabled, request_mode, color, is_builtin, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'openrouter-image', ?, 0, ?, ?, ?)`,
        [
          data.id,
          data.name,
          data.baseUrl,
          JSON.stringify(data.apiKeys || []),
          data.enabled === false ? 0 : 1,
          data.color || null,
          data.sortOrder ?? 100,
          now,
          now,
        ],
      )
      return this.getProvider(data.id)
    },

    /**
     * 部分更新中转站（仅更新传入字段）
     * @param {string} id
     * @param {{ name?: string; baseUrl?: string; apiKeys?: Array<string>; requestMode?: string }} patch
     * @returns {Promise<object>} 更新后对象
     */
    async updateProvider(id, patch) {
      const sets = []
      const params = []
      if (patch.name !== undefined) {
        sets.push('name = ?')
        params.push(patch.name)
      }
      if (patch.baseUrl !== undefined) {
        sets.push('base_url = ?')
        params.push(patch.baseUrl)
      }
      if (patch.apiKeys !== undefined) {
        sets.push('api_keys = ?')
        params.push(JSON.stringify(patch.apiKeys))
      }
      if (patch.requestMode !== undefined) {
        sets.push('request_mode = ?')
        params.push(patch.requestMode)
      }
      if (sets.length) {
        sets.push('updated_at = ?')
        params.push(Date.now(), id)
        await pool.query(`UPDATE providers SET ${sets.join(', ')} WHERE id = ?`, params)
      }
      return this.getProvider(id)
    },

    /**
     * 整家开关
     * @param {string} id
     * @param {boolean} enabled
     */
    async setProviderEnabled(id, enabled) {
      await pool.query('UPDATE providers SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, id])
    },

    /**
     * 删除中转站（先把引用它的草稿 provider_id 置 NULL 回退默认，再删其模型与本体）
     * @param {string} id
     */
    async deleteProvider(id) {
      await pool.query('UPDATE drafts SET provider_id = NULL WHERE provider_id = ?', [id])
      await pool.query('DELETE FROM provider_models WHERE provider_id = ?', [id])
      await pool.query('DELETE FROM providers WHERE id = ?', [id])
    },

    /**
     * 列出指定中转站的全部模型（含禁用）
     * @param {string} providerId
     * @returns {Promise<Array<object>>}
     */
    async listModels(providerId) {
      const [rows] = await pool.query(
        'SELECT * FROM provider_models WHERE provider_id = ? ORDER BY sort_order ASC, created_at ASC',
        [providerId],
      )
      return rows.map(mapModelRow)
    },

    /**
     * 手动添加模型（默认启用，is_image 按关键词判断由调用方传入）
     * @param {string} providerId
     * @param {{ modelId: string; displayName?: string; isImage?: boolean }} data
     * @returns {Promise<object>}
     */
    async addModel(providerId, data) {
      const id =
        globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
      await pool.query(
        `INSERT INTO provider_models
          (id, provider_id, model_id, display_name, group_name, is_image, enabled, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, 999, ?)`,
        [
          id,
          providerId,
          data.modelId,
          data.displayName || data.modelId,
          groupOfModel(data.modelId),
          data.isImage ? 1 : 0,
          Date.now(),
        ],
      )
      const [rows] = await pool.query('SELECT * FROM provider_models WHERE id = ?', [id])
      return mapModelRow(rows[0])
    },

    /**
     * fetch 合并：新增行插入（图像模型默认启用），已存在行仅更新 display_name
     * @param {string} providerId
     * @param {Array<{ modelId: string; displayName: string; isImage: boolean }>} models
     */
    async upsertFetchedModels(providerId, models) {
      const now = Date.now()
      for (const [index, m] of models.entries()) {
        const id =
          globalThis.crypto?.randomUUID?.() ||
          `${now}-${index}-${Math.random().toString(16).slice(2)}`
        await pool.query(
          `INSERT INTO provider_models
            (id, provider_id, model_id, display_name, group_name, is_image, enabled, sort_order, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE display_name = VALUES(display_name)`,
          [
            id,
            providerId,
            m.modelId,
            m.displayName,
            groupOfModel(m.modelId),
            m.isImage ? 1 : 0,
            m.isImage ? 1 : 0,
            index,
            now,
          ],
        )
      }
    },

    /**
     * 单模型开关
     * @param {string} providerId
     * @param {string} modelId
     * @param {boolean} enabled
     */
    async setModelEnabled(providerId, modelId, enabled) {
      await pool.query(
        'UPDATE provider_models SET enabled = ? WHERE provider_id = ? AND model_id = ?',
        [enabled ? 1 : 0, providerId, modelId],
      )
    },

    /**
     * 删除单个模型
     * @param {string} providerId
     * @param {string} modelId
     */
    async deleteModel(providerId, modelId) {
      await pool.query('DELETE FROM provider_models WHERE provider_id = ? AND model_id = ?', [
        providerId,
        modelId,
      ])
    },
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test -- --run server/src/db/repositories/providersRepository.test.js`
Expected: PASS（10 tests）

---

## Task 3: 后端 — upstreamClient（多 Key 轮询）

**Files:**

- Create: `server/src/modules/providers/upstreamClient.js`
- Test: `server/src/modules/providers/upstreamClient.test.js`

- [ ] **Step 1: 写失败测试**

创建 `server/src/modules/providers/upstreamClient.test.js`（mock axios，沿用项目 vitest 风格）：

```js
import { beforeEach, describe, expect, it, vi } from 'vitest'

// mock axios（ESM：vi.mock 提升，工厂内返回 mock 实现）
vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import axios from 'axios'
import { createUpstreamClient } from './upstreamClient.js'

const provider = {
  id: 'openrouter',
  name: 'OpenRouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKeys: ['sk-a', 'sk-b'],
  enabled: true,
}

/** 构造带 HTTP status 的错误（模拟 axios 响应错误） */
function httpError(status, data = {}) {
  const err = new Error(`Request failed with status code ${status}`)
  err.response = { status, data }
  return err
}

describe('upstreamClient', () => {
  beforeEach(() => {
    axios.get.mockReset()
    axios.post.mockReset()
  })

  it('listModels 用轮询 Key 调 GET {baseUrl}/models 并返回 data 数组', async () => {
    axios.get.mockResolvedValue({ data: { data: [{ id: 'openai/gpt-image-2' }] } })
    const client = createUpstreamClient()

    const models = await client.listModels(provider)

    expect(axios.get).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer sk-a' }),
      }),
    )
    expect(models).toEqual([{ id: 'openai/gpt-image-2' }])
  })

  it('多 Key 轮询：连续调用依次使用不同 Key', async () => {
    axios.get.mockResolvedValue({ data: { data: [] } })
    const client = createUpstreamClient()

    await client.listModels(provider)
    await client.listModels(provider)
    await client.listModels(provider)

    const auths = axios.get.mock.calls.map((c) => c[1].headers.Authorization)
    expect(auths).toEqual(['Bearer sk-a', 'Bearer sk-b', 'Bearer sk-a'])
  })

  it('401 时自动换下一把 Key 重试一次并成功', async () => {
    axios.post
      .mockRejectedValueOnce(httpError(401))
      .mockResolvedValueOnce({ data: { data: [{ b64_json: 'x' }] } })
    const client = createUpstreamClient()

    const result = await client.generateImages(provider, { model: 'm' }, 1000)

    expect(axios.post).toHaveBeenCalledTimes(2)
    expect(axios.post.mock.calls[1][2].headers.Authorization).toBe('Bearer sk-b')
    expect(result.data).toEqual([{ b64_json: 'x' }])
  })

  it('全部 Key 401 时抛友好错误（带 401 status）', async () => {
    axios.post.mockRejectedValue(httpError(401))
    const client = createUpstreamClient()

    await expect(client.generateImages(provider, { model: 'm' }, 1000)).rejects.toMatchObject({
      status: 401,
      message: expect.stringContaining('OpenRouter'),
    })
    // 每把 Key 各试一次
    expect(axios.post).toHaveBeenCalledTimes(2)
  })

  it('非 401/403 错误（如 500）直接抛出，不换 Key', async () => {
    axios.post.mockRejectedValue(httpError(500))
    const client = createUpstreamClient()

    await expect(client.generateImages(provider, { model: 'm' }, 1000)).rejects.toMatchObject({
      response: { status: 500 },
    })
    expect(axios.post).toHaveBeenCalledTimes(1)
  })

  it('checkKeys 逐把 Key 探测并返回可用数与脱敏尾号', async () => {
    axios.get
      .mockResolvedValueOnce({ data: { data: [] } }) // 第一把可用
      .mockRejectedValueOnce(httpError(401)) // 第二把失效
    const client = createUpstreamClient()
    const multiKeyProvider = { ...provider, apiKeys: ['sk-alpha-1234', 'sk-beta-5678'] }

    const report = await client.checkKeys(multiKeyProvider)

    expect(report.total).toBe(2)
    expect(report.available).toBe(1)
    expect(report.results[0]).toMatchObject({ tail: '1234', ok: true })
    expect(report.results[1]).toMatchObject({ tail: '5678', ok: false, status: 401 })
    expect(report.results[0].latencyMs).toBeGreaterThanOrEqual(0)
    // 脱敏：返回体不含完整 Key
    expect(JSON.stringify(report)).not.toContain('sk-alpha')
    expect(JSON.stringify(report)).not.toContain('sk-beta')
  })

  it('apiKeys 为空时 generateImages 直接抛 400 友好错误，不发请求', async () => {
    const client = createUpstreamClient()

    await expect(
      client.generateImages({ ...provider, apiKeys: [] }, { model: 'm' }, 1000),
    ).rejects.toMatchObject({ status: 400 })
    expect(axios.post).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- --run server/src/modules/providers/upstreamClient.test.js`
Expected: FAIL（Cannot find module）

- [ ] **Step 3: 实现 upstreamClient.js**

创建 `server/src/modules/providers/upstreamClient.js`：

```js
import axios from 'axios'

/**
 * 上游中转站客户端
 *
 * 职责：
 * - 代理调用 OpenAI 兼容端点（GET /models、POST /images）
 * - 多 Key 轮询：进程内游标 Map<providerId, number>，每次请求自增取模
 * - 单把 Key 401/403 时自动换下一把重试；全部失败抛友好错误
 *
 * 注意：Key 永不离开本模块进入日志或错误消息（仅 checkKeys 返回脱敏尾号）
 */

/**
 * 判断是否为可换 Key 重试的认证类错误
 * @param {unknown} err
 * @returns {boolean}
 */
function isAuthError(err) {
  const status = err?.response?.status
  return status === 401 || status === 403
}

/**
 * 创建上游客户端
 */
export function createUpstreamClient() {
  /** @type {Map<string, number>} 每家provider的轮询游标 */
  const cursors = new Map()

  /**
   * 按轮询游标取下一把 Key
   * @param {{ id: string; apiKeys: Array<string> }} provider
   * @returns {string}
   */
  function pickKey(provider) {
    const next = (cursors.get(provider.id) ?? -1) + 1
    cursors.set(provider.id, next)
    return provider.apiKeys[next % provider.apiKeys.length]
  }

  /**
   * 带 Key 轮询的请求执行器：
   * 每把 Key 最多试一次；401/403 换下一把；其余错误直接抛
   * @param {{ id: string; name: string; apiKeys: Array<string> }} provider
   * @param {(key: string) => Promise<unknown>} fn 用指定 Key 发请求的函数
   * @returns {Promise<unknown>}
   */
  async function withKeyRotation(provider, fn) {
    if (!provider.apiKeys?.length) {
      const err = new Error(`${provider.name} 未配置 API 密钥，请在设置中添加`)
      err.status = 400
      throw err
    }

    const tried = new Set()
    for (let attempt = 0; attempt < provider.apiKeys.length; attempt++) {
      const key = pickKey(provider)
      if (tried.has(key)) break // Key 有重复时避免死循环
      tried.add(key)
      try {
        return await fn(key)
      } catch (err) {
        if (isAuthError(err)) continue // 换下一把
        throw err
      }
    }

    const friendly = new Error(
      `${provider.name} 认证失败（全部 ${tried.size} 把密钥均被拒绝），请检查密钥是否失效/被撤销或账户余额不足`,
    )
    friendly.status = 401
    throw friendly
  }

  return {
    /**
     * 拉取上游模型列表
     * @param {{ id: string; name: string; baseUrl: string; apiKeys: Array<string> }} provider
     * @returns {Promise<Array<{ id: string; name?: string }>>}
     */
    async listModels(provider) {
      const data = await withKeyRotation(provider, async (key) => {
        const response = await axios.get(`${provider.baseUrl}/models`, {
          timeout: 30000,
          headers: { Authorization: `Bearer ${key}` },
        })
        return response.data
      })
      return data?.data || []
    },

    /**
     * 调用上游图像生成接口
     * @param {{ id: string; name: string; baseUrl: string; apiKeys: Array<string> }} provider
     * @param {object} payload 图像生成 payload
     * @param {number} timeout 超时毫秒
     * @returns {Promise<unknown>} 上游响应 data
     */
    async generateImages(provider, payload, timeout) {
      return withKeyRotation(provider, async (key) => {
        const response = await axios.post(`${provider.baseUrl}/images`, payload, {
          timeout,
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
        })
        return response.data
      })
    },

    /**
     * 逐把 Key 探测可用性（不走轮询，每把都试）
     * @param {{ baseUrl: string; apiKeys: Array<string> }} provider
     * @returns {Promise<{ total: number; available: number; results: Array<{ tail: string; ok: boolean; status?: number; latencyMs: number }> }>}
     */
    async checkKeys(provider) {
      const results = []
      for (const key of provider.apiKeys || []) {
        const startedAt = Date.now()
        try {
          await axios.get(`${provider.baseUrl}/models`, {
            timeout: 15000,
            headers: { Authorization: `Bearer ${key}` },
          })
          results.push({ tail: String(key).slice(-4), ok: true, latencyMs: Date.now() - startedAt })
        } catch (err) {
          results.push({
            tail: String(key).slice(-4),
            ok: false,
            status: err?.response?.status,
            latencyMs: Date.now() - startedAt,
          })
        }
      }
      return {
        total: results.length,
        available: results.filter((r) => r.ok).length,
        results,
      }
    },
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test -- --run server/src/modules/providers/upstreamClient.test.js`
Expected: PASS（7 tests）

---

## Task 4: 后端 — providersService + REST 路由

**Files:**

- Create: `server/src/modules/providers/providersService.js`
- Create: `server/src/modules/providers/imagePayload.js`
- Create: `server/src/modules/providers/routes.js`
- Modify: `server/src/app.js`（挂载路由）
- Test: `server/src/test/providerRoutes.test.js`

- [ ] **Step 1: 写失败测试**

创建 `server/src/test/providerRoutes.test.js`（supertest 打整个 app，service 用内存假实现，沿用现有 `server/src/test/topicRoutes.test.js` 的注入风格）：

```js
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import { isImageModelId } from '../modules/providers/providersService.js'
import { buildImagePayload } from '../modules/providers/imagePayload.js'

/** 内存版 providersService 假实现 */
function createFakeService() {
  const providers = [
    {
      id: 'openrouter',
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKeys: ['sk-a'],
      enabled: true,
      requestMode: 'openrouter-image',
      color: '#6366f1',
      isBuiltin: true,
      enabledModels: [{ modelId: 'openai/gpt-image-2', displayName: 'GPT Image 2' }],
      modelCount: 1,
      enabledModelCount: 1,
    },
  ]
  return {
    providers,
    listProviders: vi.fn(async () => providers),
    createProvider: vi.fn(async (data) => ({
      id: 'custom-1',
      enabled: true,
      apiKeys: [],
      ...data,
    })),
    updateProvider: vi.fn(async (id, patch) => ({ id, ...providers[0], ...patch })),
    setProviderEnabled: vi.fn(async () => {}),
    deleteProvider: vi.fn(async () => {}),
    checkProvider: vi.fn(async () => ({
      total: 1,
      available: 1,
      results: [{ tail: 'k-a', ok: true, latencyMs: 12 }],
    })),
    listModels: vi.fn(async () => [
      { modelId: 'openai/gpt-image-2', enabled: true, isImage: true, groupName: 'openai' },
    ]),
    fetchModels: vi.fn(async () => ({
      added: 2,
      updated: 1,
      total: 3,
      autoEnabled: 1,
      staleModelIds: [],
    })),
    addModel: vi.fn(async (pid, data) => ({ modelId: data.modelId, enabled: true })),
    setModelEnabled: vi.fn(async () => {}),
    deleteModel: vi.fn(async () => {}),
  }
}

describe('providerRoutes', () => {
  let service
  let app

  beforeEach(() => {
    service = createFakeService()
    app = createApp({ providersService: service })
  })

  it('GET /api/providers 返回列表', async () => {
    const res = await request(app).get('/api/providers')
    expect(res.status).toBe(200)
    expect(res.body[0]).toMatchObject({ id: 'openrouter', apiKeys: ['sk-a'] })
  })

  it('POST /api/providers 缺名称/地址时 400', async () => {
    const res = await request(app).post('/api/providers').send({ name: '' })
    expect(res.status).toBe(400)
    expect(service.createProvider).not.toHaveBeenCalled()
  })

  it('POST /api/providers 创建自定义中转站', async () => {
    const res = await request(app)
      .post('/api/providers')
      .send({ name: '我的站', baseUrl: 'https://x.example.com/v1' })
    expect(res.status).toBe(201)
    expect(service.createProvider).toHaveBeenCalledWith(
      expect.objectContaining({ name: '我的站', baseUrl: 'https://x.example.com/v1' }),
    )
  })

  it('PUT /api/providers/:id 更新字段', async () => {
    const res = await request(app)
      .put('/api/providers/openrouter')
      .send({ apiKeys: ['sk-new'], baseUrl: 'https://new.example.com/v1' })
    expect(res.status).toBe(200)
    expect(service.updateProvider).toHaveBeenCalledWith('openrouter', {
      apiKeys: ['sk-new'],
      baseUrl: 'https://new.example.com/v1',
    })
  })

  it('PATCH /api/providers/:id/enabled 切换开关', async () => {
    const res = await request(app)
      .patch('/api/providers/openrouter/enabled')
      .send({ enabled: false })
    expect(res.status).toBe(200)
    expect(service.setProviderEnabled).toHaveBeenCalledWith('openrouter', false)
  })

  it('DELETE /api/providers/:id 删除', async () => {
    const res = await request(app).delete('/api/providers/openrouter')
    expect(res.status).toBe(200)
    expect(service.deleteProvider).toHaveBeenCalledWith('openrouter')
  })

  it('POST /api/providers/:id/check 返回 Key 检测报告', async () => {
    const res = await request(app).post('/api/providers/openrouter/check')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ total: 1, available: 1 })
  })

  it('GET /api/providers/:id/models 返回模型列表', async () => {
    const res = await request(app).get('/api/providers/openrouter/models')
    expect(res.status).toBe(200)
    expect(res.body[0].modelId).toBe('openai/gpt-image-2')
  })

  it('POST /api/providers/:id/models/fetch 返回合并统计', async () => {
    const res = await request(app).post('/api/providers/openrouter/models/fetch')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ added: 2, autoEnabled: 1 })
  })

  it('POST /api/providers/:id/models 手动添加模型（缺 modelId 400）', async () => {
    const bad = await request(app).post('/api/providers/openrouter/models').send({})
    expect(bad.status).toBe(400)

    const ok = await request(app)
      .post('/api/providers/openrouter/models')
      .send({ modelId: 'flux/dev' })
    expect(ok.status).toBe(201)
    expect(service.addModel).toHaveBeenCalledWith(
      'openrouter',
      expect.objectContaining({ modelId: 'flux/dev', isImage: true }),
    )
  })

  it('PATCH /api/providers/:id/models/:modelId/enabled 单模型开关', async () => {
    const res = await request(app)
      .patch('/api/providers/openrouter/models/openai%2Fgpt-4o/enabled')
      .send({ enabled: true })
    expect(res.status).toBe(200)
    expect(service.setModelEnabled).toHaveBeenCalledWith('openrouter', 'openai/gpt-4o', true)
  })

  it('DELETE /api/providers/:id/models/:modelId 移除模型', async () => {
    const res = await request(app).delete('/api/providers/openrouter/models/openai%2Fgpt-4o')
    expect(res.status).toBe(200)
    expect(service.deleteModel).toHaveBeenCalledWith('openrouter', 'openai/gpt-4o')
  })
})

describe('isImageModelId', () => {
  it('命中图像关键词返回 true', () => {
    expect(isImageModelId('openai/gpt-image-2')).toBe(true)
    expect(isImageModelId('openai/dall-e-3')).toBe(true)
    expect(isImageModelId('black-forest-labs/flux-1.1-pro')).toBe(true)
    expect(isImageModelId('bytedance/seedream-4')).toBe(true)
    expect(isImageModelId('google/imagen-3')).toBe(true)
  })

  it('纯文本模型返回 false', () => {
    expect(isImageModelId('openai/gpt-4o')).toBe(false)
    expect(isImageModelId('anthropic/claude-sonnet-4')).toBe(false)
    expect(isImageModelId('deepseek/deepseek-chat')).toBe(false)
  })
})

describe('buildImagePayload', () => {
  it('size 为 auto 时不传 size/resolution/aspect_ratio', () => {
    const payload = buildImagePayload({
      model: 'openai/gpt-image-2',
      prompt: '画一只猫',
      size: 'auto',
      quality: 'high',
      n: 1,
    })
    expect(payload).toEqual({
      model: 'openai/gpt-image-2',
      prompt: '画一只猫',
      quality: 'high',
      n: 1,
    })
    expect('size' in payload).toBe(false)
    expect('resolution' in payload).toBe(false)
  })

  it('非 auto 尺寸换算为 resolution + aspect_ratio（约分）', () => {
    const payload = buildImagePayload({
      model: 'openai/gpt-image-2',
      prompt: 'p',
      size: '1536x864',
      quality: 'high',
      n: 2,
    })
    expect(payload.resolution).toBe('1536x864')
    expect(payload.aspect_ratio).toBe('16:9')
  })

  it('有参考图时带 input_references', () => {
    const payload = buildImagePayload({
      model: 'm',
      prompt: 'p',
      size: 'auto',
      quality: 'high',
      n: 1,
      inputReferences: ['data:image/png;base64,x'],
    })
    expect(payload.input_references).toEqual(['data:image/png;base64,x'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- --run server/src/test/providerRoutes.test.js`
Expected: FAIL（Cannot find module providersService.js / imagePayload.js）

- [ ] **Step 3: 实现 imagePayload.js**

创建 `server/src/modules/providers/imagePayload.js`：

```js
/**
 * 图像生成 payload 构建
 *
 * 修复遗留 timeout bug：OpenRouter 图像 API 不认旧 `size` 直传格式
 * （size:"auto" 会导致上游长时间无响应），改为：
 * - size === 'auto'：不传任何尺寸字段，由上游自动适配
 * - 非 auto：传 resolution（'1536x864'）+ aspect_ratio（约分后的 '16:9'）
 */

/**
 * 最大公约数（用于宽高比约分）
 */
function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b)
}

/**
 * 构建上游图像生成 payload
 * @param {{ model: string; prompt: string; size: string; quality: string; n: number; inputReferences?: Array<string> }} args
 * @returns {object}
 */
export function buildImagePayload({ model, prompt, size, quality, n, inputReferences }) {
  const payload = { model, prompt, quality, n }

  if (size && size !== 'auto') {
    const [w, h] = String(size).split('x').map(Number)
    if (w > 0 && h > 0) {
      payload.resolution = `${w}x${h}`
      const divisor = gcd(w, h)
      payload.aspect_ratio = `${w / divisor}:${h / divisor}`
    }
  }

  if (inputReferences?.length) {
    payload.input_references = inputReferences
  }

  return payload
}
```

- [ ] **Step 4: 实现 providersService.js**

创建 `server/src/modules/providers/providersService.js`：

```js
/**
 * 中转站业务服务
 *
 * 职责：
 * - checkProvider：Key 可用性检测（委托 upstreamClient）
 * - fetchModels：代理拉取上游模型并 diff 合并入库
 * - resolveForDraft：按 draft.providerId 解析出生成用的 provider（含回退链）
 */

/** 图像模型关键词（命中即认为支持图像生成） */
const IMAGE_KEYWORDS = ['image', 'dall-e', 'flux', 'seedream', 'seededit', 'imagen']

/**
 * 判断模型 ID 是否为图像生成模型
 * @param {string} modelId
 * @returns {boolean}
 */
export function isImageModelId(modelId) {
  const lower = String(modelId).toLowerCase()
  return IMAGE_KEYWORDS.some((keyword) => lower.includes(keyword))
}

/**
 * 创建中转站服务
 * @param {{ providersRepository: object; upstreamClient: object; settingsRepository: object }} deps
 */
export function createProvidersService({
  providersRepository,
  upstreamClient,
  settingsRepository,
}) {
  /**
   * 取 provider，不存在抛 404
   */
  async function mustGetProvider(id) {
    const provider = await providersRepository.getProvider(id)
    if (!provider) {
      const err = new Error('中转站不存在')
      err.status = 404
      throw err
    }
    return provider
  }

  return {
    listProviders: () => providersRepository.listProviders(),

    /**
     * 新增自定义中转站
     * @param {{ name: string; baseUrl: string }} data
     */
    async createProvider(data) {
      const id =
        globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
      return providersRepository.createProvider({
        id,
        name: String(data.name).trim(),
        baseUrl: String(data.baseUrl).trim().replace(/\/+$/, ''),
        apiKeys: [],
      })
    },

    /**
     * 更新中转站（apiKeys 传数组整体替换）
     */
    async updateProvider(id, patch) {
      await mustGetProvider(id)
      const next = { ...patch }
      if (next.baseUrl) next.baseUrl = String(next.baseUrl).trim().replace(/\/+$/, '')
      return providersRepository.updateProvider(id, next)
    },

    async setProviderEnabled(id, enabled) {
      await mustGetProvider(id)
      await providersRepository.setProviderEnabled(id, enabled)
    },

    async deleteProvider(id) {
      await mustGetProvider(id)
      await providersRepository.deleteProvider(id)
    },

    /**
     * 检测该家全部 Key 的可用性
     * @param {string} id
     */
    async checkProvider(id) {
      const provider = await mustGetProvider(id)
      return upstreamClient.checkKeys(provider)
    },

    listModels: (id) => providersRepository.listModels(id),

    /**
     * 代理拉取上游模型列表并 diff 合并入库
     *
     * 合并规则：
     * - 新增：is_image 命中关键词 → enabled=1，否则 0
     * - 已存在：仅更新 display_name（保留用户 enabled 状态）
     * - 上游消失：不删除，modelId 放入 staleModelIds 响应
     *
     * @param {string} id
     * @returns {Promise<{ added: number; updated: number; total: number; autoEnabled: number; staleModelIds: Array<string> }>}
     */
    async fetchModels(id) {
      const provider = await mustGetProvider(id)
      const upstream = await upstreamClient.listModels(provider)

      const existing = await providersRepository.listModels(id)
      const existingIds = new Set(existing.map((m) => m.modelId))
      const upstreamIds = new Set(upstream.map((m) => m.id))

      const toUpsert = upstream.map((m) => ({
        modelId: m.id,
        displayName: m.name || m.id,
        isImage: isImageModelId(m.id),
      }))
      await providersRepository.upsertFetchedModels(id, toUpsert)

      const added = toUpsert.filter((m) => !existingIds.has(m.modelId))
      return {
        added: added.length,
        updated: toUpsert.length - added.length,
        total: toUpsert.length,
        autoEnabled: added.filter((m) => m.isImage).length,
        staleModelIds: existing.filter((m) => !upstreamIds.has(m.modelId)).map((m) => m.modelId),
      }
    },

    /**
     * 手动添加模型（isImage 按关键词自动判断）
     */
    async addModel(id, data) {
      await mustGetProvider(id)
      return providersRepository.addModel(id, {
        modelId: String(data.modelId).trim(),
        displayName: data.displayName || String(data.modelId).trim(),
        isImage: isImageModelId(data.modelId),
      })
    },

    setModelEnabled: (id, modelId, enabled) =>
      providersRepository.setModelEnabled(id, modelId, enabled),

    deleteModel: (id, modelId) => providersRepository.deleteModel(id, modelId),

    /**
     * 解析生成请求应使用的 provider
     *
     * 回退链：draft.providerId → app_settings.default_provider_id → 第一个 enabled
     * @param {string|undefined} draftProviderId 草稿里选中的 provider
     * @returns {Promise<object>} 可用 provider
     * @throws 400 指定 provider 停用/无 Key；404 没有任何可用 provider
     */
    async resolveForDraft(draftProviderId) {
      let provider = null

      if (draftProviderId) {
        provider = await providersRepository.getProvider(draftProviderId)
        if (!provider) {
          const err = new Error('所选中转站不存在，请重新选择')
          err.status = 400
          throw err
        }
        if (!provider.enabled) {
          const err = new Error(`${provider.name} 已停用，请在设置中启用或更换中转站`)
          err.status = 400
          throw err
        }
      } else {
        const settings = await settingsRepository.getSettings()
        if (settings.defaultProviderId) {
          provider = await providersRepository.getProvider(settings.defaultProviderId)
          if (provider && !provider.enabled) provider = null
        }
        if (!provider) {
          provider = await providersRepository.getFirstEnabledProvider()
        }
      }

      if (!provider) {
        const err = new Error('没有可用的中转站，请在设置中启用至少一家')
        err.status = 400
        throw err
      }
      if (!provider.apiKeys?.length) {
        const err = new Error(`${provider.name} 未配置 API 密钥，请在设置中添加`)
        err.status = 400
        throw err
      }

      return provider
    },
  }
}
```

- [ ] **Step 5: 实现 routes.js**

创建 `server/src/modules/providers/routes.js`：

```js
import { Router } from 'express'

/**
 * 创建中转站路由
 * @param {{ providersService: object }} deps 依赖注入
 */
export function createProviderRoutes({ providersService }) {
  const router = Router()

  /** 校验创建参数 */
  function validateCreate(body) {
    if (!body?.name?.trim() || !body?.baseUrl?.trim()) {
      const err = new Error('name 和 baseUrl 不能为空')
      err.status = 400
      throw err
    }
  }

  router.get('/providers', async (_req, res, next) => {
    try {
      res.json(await providersService.listProviders())
    } catch (error) {
      next(error)
    }
  })

  router.post('/providers', async (req, res, next) => {
    try {
      validateCreate(req.body)
      res.status(201).json(await providersService.createProvider(req.body))
    } catch (error) {
      next(error)
    }
  })

  router.put('/providers/:id', async (req, res, next) => {
    try {
      // 仅白名单字段允许更新，防止 id/enabled 等被意外覆盖
      const { name, baseUrl, apiKeys, requestMode } = req.body || {}
      const patch = {}
      if (name !== undefined) patch.name = name
      if (baseUrl !== undefined) patch.baseUrl = baseUrl
      if (apiKeys !== undefined) patch.apiKeys = Array.isArray(apiKeys) ? apiKeys : []
      if (requestMode !== undefined) patch.requestMode = requestMode
      res.json(await providersService.updateProvider(req.params.id, patch))
    } catch (error) {
      next(error)
    }
  })

  router.patch('/providers/:id/enabled', async (req, res, next) => {
    try {
      await providersService.setProviderEnabled(req.params.id, Boolean(req.body?.enabled))
      res.json({ success: true })
    } catch (error) {
      next(error)
    }
  })

  router.delete('/providers/:id', async (req, res, next) => {
    try {
      await providersService.deleteProvider(req.params.id)
      res.json({ success: true })
    } catch (error) {
      next(error)
    }
  })

  router.post('/providers/:id/check', async (req, res, next) => {
    try {
      res.json(await providersService.checkProvider(req.params.id))
    } catch (error) {
      next(error)
    }
  })

  router.get('/providers/:id/models', async (req, res, next) => {
    try {
      res.json(await providersService.listModels(req.params.id))
    } catch (error) {
      next(error)
    }
  })

  router.post('/providers/:id/models/fetch', async (req, res, next) => {
    try {
      res.json(await providersService.fetchModels(req.params.id))
    } catch (error) {
      next(error)
    }
  })

  router.post('/providers/:id/models', async (req, res, next) => {
    try {
      if (!req.body?.modelId?.trim()) {
        const err = new Error('modelId 不能为空')
        err.status = 400
        throw err
      }
      res.status(201).json(await providersService.addModel(req.params.id, req.body))
    } catch (error) {
      next(error)
    }
  })

  router.patch('/providers/:id/models/:modelId/enabled', async (req, res, next) => {
    try {
      await providersService.setModelEnabled(
        req.params.id,
        decodeURIComponent(req.params.modelId),
        Boolean(req.body?.enabled),
      )
      res.json({ success: true })
    } catch (error) {
      next(error)
    }
  })

  router.delete('/providers/:id/models/:modelId', async (req, res, next) => {
    try {
      await providersService.deleteModel(req.params.id, decodeURIComponent(req.params.modelId))
      res.json({ success: true })
    } catch (error) {
      next(error)
    }
  })

  return router
}
```

- [ ] **Step 6: app.js 挂载路由**

`server/src/app.js` 在 `createImageRoutes` 挂载后追加：

```js
import { createProviderRoutes } from './modules/providers/routes.js'
```

并在 `app.use('/api', createImageRoutes(...))` 后加：

```js
// deps.providersService 未注入时（旧测试）跳过，保持向后兼容
if (deps.providersService) {
  app.use('/api', createProviderRoutes({ providersService: deps.providersService }))
}
```

同时更新 createApp 的 JSDoc：`providersService?: object;`

- [ ] **Step 7: 跑测试确认通过**

Run: `npm run test -- --run server/src/test/providerRoutes.test.js`
Expected: PASS（15 tests）

再跑全量确认无回归：

Run: `npm run test -- --run server/`
Expected: 全部 PASS

---

## Task 5: 后端 — 生成链路改造（providerId 路由 + payload 修复）

**Files:**

- Modify: `server/src/db/repositories/draftRepository.js`（读写 provider_id）
- Modify: `server/src/db/repositories/settingsRepository.js`（读写 default_provider_id）
- Modify: `server/src/db/repositories/topicRepository.js`（meta_json 加 providerName）
- Modify: `server/src/server.js`（迁移+seed+组装，generateImageMessage 改走 upstreamClient）
- Delete: `server/src/modules/images/openrouterClient.js`（被 upstreamClient 取代）
- Test: `server/src/test/generationRouting.test.js`

- [ ] **Step 1: draftRepository 读写 provider_id**

`draftRepository.js` 两处改动：

`getDraft` 返回对象加一行：

```js
return {
  topicId,
  prompt: draft?.prompt || '',
  model: draft?.model || 'openai/gpt-image-2',
  providerId: draft?.provider_id || '',
  size: draft?.size || 'auto',
  quality: draft?.quality || 'high',
  n: draft?.n || 1,
  referenceImages,
}
```

`saveDraft` 的 next 与 SQL 加 providerId：

```js
const next = {
  prompt: payload.prompt || '',
  model: payload.model || 'openai/gpt-image-2',
  providerId: payload.providerId || '',
  size: payload.size || 'auto',
  quality: payload.quality || 'high',
  n: payload.n || 1,
  updatedAt: Date.now(),
}

await executor.query(
  `INSERT INTO drafts (topic_id, prompt, model, provider_id, size, quality, n, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         prompt = VALUES(prompt),
         model = VALUES(model),
         provider_id = VALUES(provider_id),
         size = VALUES(size),
         quality = VALUES(quality),
         n = VALUES(n),
         updated_at = VALUES(updated_at)`,
  [
    topicId,
    next.prompt,
    next.model,
    next.providerId,
    next.size,
    next.quality,
    next.n,
    next.updatedAt,
  ],
)
```

- [ ] **Step 2: settingsRepository 读写 default_provider_id**

`getSettings` 返回对象加 `defaultProviderId: row.default_provider_id || ''`（无 row 的默认分支加 `defaultProviderId: ''`）；`saveSettings` 的 next 加：

```js
        defaultProviderId: payload.defaultProviderId || '',
```

SQL 改为：

```js
await pool.query(
  `INSERT INTO app_settings
          (id, base_url, default_model, default_size, default_quality, default_n, request_mode, timeout, default_provider_id)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         base_url = VALUES(base_url),
         default_model = VALUES(default_model),
         default_size = VALUES(default_size),
         default_quality = VALUES(default_quality),
         default_n = VALUES(default_n),
         request_mode = VALUES(request_mode),
         timeout = VALUES(timeout),
         default_provider_id = VALUES(default_provider_id)`,
  [
    next.baseURL,
    next.defaultModel,
    next.defaultSize,
    next.defaultQuality,
    next.defaultN,
    next.requestMode,
    next.timeout,
    next.defaultProviderId,
  ],
)
```

- [ ] **Step 3: topicRepository 的 meta_json 写入 providerName**

`saveGeneratedConversation` 两条 INSERT 的 meta_json 参数改为：

user 消息：

```js
          JSON.stringify({
            referenceCount: draft.referenceImages?.length || 0,
            providerName: draft.providerName || '',
          }),
```

assistant 消息：

```js
          JSON.stringify({ imageCount: safeImages.length, providerName: draft.providerName || '' }),
```

（`meta` 在 listMessages 已解析透传，前端可直接读 `message.meta.providerName`，无需改读取侧。）

- [ ] **Step 4: 写生成路由的失败测试**

创建 `server/src/test/generationRouting.test.js`：

```js
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

import axios from 'axios'
import { createProvidersService } from '../modules/providers/providersService.js'
import { createUpstreamClient } from '../modules/providers/upstreamClient.js'

/** 内存版仓储假实现 */
function createFakeRepos({ providers = [], defaultProviderId = '' } = {}) {
  return {
    providersRepository: {
      getProvider: vi.fn(async (id) => providers.find((p) => p.id === id) || null),
      getFirstEnabledProvider: vi.fn(async () => providers.find((p) => p.enabled) || null),
    },
    settingsRepository: {
      getSettings: vi.fn(async () => ({ defaultProviderId, timeout: 1000 })),
    },
  }
}

const openrouter = {
  id: 'openrouter',
  name: 'OpenRouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKeys: ['sk-a'],
  enabled: true,
}
const siliconflow = {
  id: 'siliconflow',
  name: '硅基流动',
  baseUrl: 'https://api.siliconflow.cn/v1',
  apiKeys: ['sk-sf'],
  enabled: true,
}

describe('providersService.resolveForDraft', () => {
  it('draft 指定 providerId 时路由到该家', async () => {
    const repos = createFakeRepos({ providers: [openrouter, siliconflow] })
    const service = createProvidersService({ ...repos, upstreamClient: createUpstreamClient() })

    const provider = await service.resolveForDraft('siliconflow')

    expect(provider.baseUrl).toBe('https://api.siliconflow.cn/v1')
  })

  it('未指定时回退 default_provider_id', async () => {
    const repos = createFakeRepos({
      providers: [openrouter, siliconflow],
      defaultProviderId: 'siliconflow',
    })
    const service = createProvidersService({ ...repos, upstreamClient: createUpstreamClient() })

    const provider = await service.resolveForDraft(undefined)

    expect(provider.id).toBe('siliconflow')
  })

  it('default_provider_id 已停用时回退第一个 enabled', async () => {
    const repos = createFakeRepos({
      providers: [{ ...siliconflow, enabled: false }, openrouter],
      defaultProviderId: 'siliconflow',
    })
    const service = createProvidersService({ ...repos, upstreamClient: createUpstreamClient() })

    const provider = await service.resolveForDraft(undefined)

    expect(provider.id).toBe('openrouter')
  })

  it('指定 provider 已停用时 400', async () => {
    const repos = createFakeRepos({ providers: [{ ...openrouter, enabled: false }] })
    const service = createProvidersService({ ...repos, upstreamClient: createUpstreamClient() })

    await expect(service.resolveForDraft('openrouter')).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('已停用'),
    })
  })

  it('provider 无 Key 时 400 友好错误', async () => {
    const repos = createFakeRepos({ providers: [{ ...openrouter, apiKeys: [] }] })
    const service = createProvidersService({ ...repos, upstreamClient: createUpstreamClient() })

    await expect(service.resolveForDraft('openrouter')).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('未配置 API 密钥'),
    })
  })

  it('无任何可用 provider 时 400', async () => {
    const repos = createFakeRepos({ providers: [] })
    const service = createProvidersService({ ...repos, upstreamClient: createUpstreamClient() })

    await expect(service.resolveForDraft(undefined)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('没有可用的中转站'),
    })
  })
})

describe('生成链路集成（resolveForDraft + upstreamClient.generateImages）', () => {
  beforeEach(() => {
    axios.post.mockReset()
  })

  it('按 draft.providerId 的 baseUrl+Key 发请求', async () => {
    axios.post.mockResolvedValue({ data: { data: [{ b64_json: 'x' }] } })
    const repos = createFakeRepos({ providers: [openrouter, siliconflow] })
    const upstreamClient = createUpstreamClient()
    const service = createProvidersService({ ...repos, upstreamClient })

    const provider = await service.resolveForDraft('siliconflow')
    await upstreamClient.generateImages(
      provider,
      { model: 'flux/dev', prompt: 'p', quality: 'high', n: 1 },
      1000,
    )

    expect(axios.post).toHaveBeenCalledWith(
      'https://api.siliconflow.cn/v1/images',
      expect.objectContaining({ model: 'flux/dev' }),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer sk-sf' }),
      }),
    )
  })
})
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm run test -- --run server/src/test/generationRouting.test.js`
Expected: PASS（7 tests）（Task 4 已实现 providersService/upstreamClient，此步直接通过）

- [ ] **Step 6: server.js 组装改造**

`server/src/server.js`：

import 部分替换：

```js
import { verifyDatabaseConnection } from './db/init.js'
import { migrateProvidersSchema, seedProvidersIfEmpty } from './db/seedProviders.js'
import { createProvidersRepository } from './db/repositories/providersRepository.js'
import { createUpstreamClient } from './modules/providers/upstreamClient.js'
import { createProvidersService } from './modules/providers/providersService.js'
import { buildImagePayload } from './modules/providers/imagePayload.js'
```

删除 `import { createOpenRouterClient } ...` 与 `const openRouterClient = createOpenRouterClient(...)`，删除文件 `server/src/modules/images/openrouterClient.js`。

DB 探测后、createApp 前加迁移 + seed + 组装：

```js
// providers 迁移与首次 seed（幂等）；失败不阻断启动，API 调用时会再次暴露问题
const settingsRepository = createSettingsRepository(pool)
try {
  await migrateProvidersSchema(pool)
  const legacy = await settingsRepository.getSettings()
  await seedProvidersIfEmpty(pool, {
    envApiKey: env.openrouterApiKey,
    legacyBaseURL: legacy.baseURL,
    legacyDefaultModel: legacy.defaultModel,
  })
} catch (err) {
  console.warn(
    `[startup] providers 迁移/seed 失败（不影响启动，API 调用时可能报错）：${err?.message || err}`,
  )
}

const providersRepository = createProvidersRepository(pool)
const upstreamClient = createUpstreamClient()
const providersService = createProvidersService({
  providersRepository,
  upstreamClient,
  settingsRepository,
})
```

（注意：把原来的 `const settingsRepository = createSettingsRepository(pool)` 上移，不要重复声明。）

`generateImageMessage` 中替换 OpenRouter 调用段：

```js
// 按 draft.providerId 解析中转站（含 default_provider_id → 第一个 enabled 回退链）
const provider = await providersService.resolveForDraft(draft.providerId)

const openrouterPayload = buildImagePayload({
  model: draft.model || settings.defaultModel,
  prompt: payload.prompt || draft.prompt || '',
  size: draft.size || settings.defaultSize,
  quality: draft.quality || settings.defaultQuality,
  n: draft.n || settings.defaultN,
  inputReferences,
})

// API 调用失败时还没写文件，无需清理
const response = await upstreamClient.generateImages(provider, openrouterPayload, settings.timeout)
```

（删除原来的 `if (inputReferences.length) { openrouterPayload.input_references = ... }`，已由 buildImagePayload 处理。）

`saveGeneratedConversation` 调用处把 providerName 塞入 draft（供 meta_json 落库），并让接口响应携带 providerName（供前端乐观消息即时展示「模型 · 中转站名」）：

```js
const saved = await topicRepository.saveGeneratedConversation(
  {
    topicId,
    prompt: payload.prompt || '',
    revisedPrompt: response.revised_prompt || '',
    draft: { ...draft, providerName: provider.name },
    images,
  },
  conn,
)
```

事务成功后的 return 改为：

```js
return {
  images: message.images,
  revisedPrompt: message.revisedPrompt,
  providerName: provider.name,
}
```

`createApp({...})` 注入加一行：`providersService,`

- [ ] **Step 7: 验证 openrouterClient 无残留引用并全量回归**

Run: `npm run test -- --run`
Expected: 全部 PASS（现有 105 + 新增，若 server.test.js 等旧测试引用了 openrouterClient，同步更新为 upstreamClient 或删除对应 mock）

---

## Task 6: 前端 — providersApi + providers store

**Files:**

- Create: `src/services/providersApi.js`
- Create: `src/store/providers.js`
- Test: `src/store/providers.test.js`

- [ ] **Step 1: 实现 providersApi.js**

创建 `src/services/providersApi.js`：

```js
import { backendClient } from './backendClient'

/**
 * 中转站 API 封装
 * modelId 含 '/'，路径参数需 encodeURIComponent
 */

export async function listProviders() {
  const response = await backendClient.get('/api/providers')
  return response.data
}

export async function createProvider(payload) {
  const response = await backendClient.post('/api/providers', payload)
  return response.data
}

export async function updateProvider(id, patch) {
  const response = await backendClient.put(`/api/providers/${id}`, patch)
  return response.data
}

export async function setProviderEnabled(id, enabled) {
  const response = await backendClient.patch(`/api/providers/${id}/enabled`, { enabled })
  return response.data
}

export async function deleteProvider(id) {
  const response = await backendClient.delete(`/api/providers/${id}`)
  return response.data
}

export async function checkProvider(id) {
  const response = await backendClient.post(`/api/providers/${id}/check`)
  return response.data
}

export async function listProviderModels(id) {
  const response = await backendClient.get(`/api/providers/${id}/models`)
  return response.data
}

export async function fetchProviderModels(id) {
  const response = await backendClient.post(`/api/providers/${id}/models/fetch`)
  return response.data
}

export async function addProviderModel(id, payload) {
  const response = await backendClient.post(`/api/providers/${id}/models`, payload)
  return response.data
}

export async function setProviderModelEnabled(id, modelId, enabled) {
  const response = await backendClient.patch(
    `/api/providers/${id}/models/${encodeURIComponent(modelId)}/enabled`,
    { enabled },
  )
  return response.data
}

export async function deleteProviderModel(id, modelId) {
  const response = await backendClient.delete(
    `/api/providers/${id}/models/${encodeURIComponent(modelId)}`,
  )
  return response.data
}
```

- [ ] **Step 2: 写 store 失败测试**

创建 `src/store/providers.test.js`：

```js
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProvidersStore } from './providers'
import * as api from '@/services/providersApi'

vi.mock('@/services/providersApi', () => ({
  listProviders: vi.fn(),
  createProvider: vi.fn(),
  updateProvider: vi.fn(),
  setProviderEnabled: vi.fn(),
  deleteProvider: vi.fn(),
  checkProvider: vi.fn(),
  listProviderModels: vi.fn(),
  fetchProviderModels: vi.fn(),
  addProviderModel: vi.fn(),
  setProviderModelEnabled: vi.fn(),
  deleteProviderModel: vi.fn(),
}))

const openrouter = {
  id: 'openrouter',
  name: 'OpenRouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKeys: ['sk-a'],
  enabled: true,
  color: '#6366f1',
  isBuiltin: true,
  modelCount: 1,
  enabledModelCount: 1,
  enabledModels: [{ modelId: 'openai/gpt-image-2', displayName: 'GPT Image 2' }],
}
const siliconflow = {
  id: 'siliconflow',
  name: '硅基流动',
  baseUrl: 'https://api.siliconflow.cn/v1',
  apiKeys: [],
  enabled: false,
  color: '#7c3aed',
  isBuiltin: true,
  modelCount: 0,
  enabledModelCount: 0,
  enabledModels: [],
}

describe('providers store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    api.listProviders.mockResolvedValue([openrouter, siliconflow])
  })

  it('loadProviders 加载列表并默认选中第一家', async () => {
    const store = useProvidersStore()

    await store.loadProviders()

    expect(store.providers).toHaveLength(2)
    expect(store.selectedProviderId).toBe('openrouter')
  })

  it('enabledProviders 仅含启用中的；hasUsableProvider 要求启用且有 Key', async () => {
    const store = useProvidersStore()
    await store.loadProviders()

    expect(store.enabledProviders.map((p) => p.id)).toEqual(['openrouter'])
    expect(store.hasUsableProvider).toBe(true)

    store.providers[0].apiKeys = []
    expect(store.hasUsableProvider).toBe(false)
  })

  it('toggleProvider 调 API 并同步本地状态', async () => {
    api.setProviderEnabled.mockResolvedValue({})
    const store = useProvidersStore()
    await store.loadProviders()

    await store.toggleProvider('siliconflow', true)

    expect(api.setProviderEnabled).toHaveBeenCalledWith('siliconflow', true)
    expect(store.providers[1].enabled).toBe(true)
  })

  it('selectProvider 加载该家模型列表（缓存，不重复请求）', async () => {
    api.listProviderModels.mockResolvedValue([
      { modelId: 'openai/gpt-image-2', enabled: true, isImage: true, groupName: 'openai' },
    ])
    const store = useProvidersStore()
    await store.loadProviders()

    await store.selectProvider('openrouter')
    await store.selectProvider('openrouter')

    expect(api.listProviderModels).toHaveBeenCalledTimes(1)
    expect(store.currentModels).toHaveLength(1)
  })

  it('saveProvider 即时保存名称/地址/Key 数组', async () => {
    api.updateProvider.mockImplementation(async (id, patch) => ({ ...openrouter, ...patch }))
    const store = useProvidersStore()
    await store.loadProviders()

    await store.saveProvider('openrouter', { apiKeys: ['sk-a', 'sk-b'], baseUrl: 'https://new/v1' })

    expect(api.updateProvider).toHaveBeenCalledWith('openrouter', {
      apiKeys: ['sk-a', 'sk-b'],
      baseUrl: 'https://new/v1',
    })
    expect(store.providers[0].baseUrl).toBe('https://new/v1')
  })

  it('fetchModels 拉取合并后刷新模型列表并返回统计', async () => {
    api.listProviderModels.mockResolvedValue([])
    api.fetchProviderModels.mockResolvedValue({
      added: 2,
      updated: 0,
      total: 2,
      autoEnabled: 1,
      staleModelIds: [],
    })
    const store = useProvidersStore()
    await store.loadProviders()
    await store.selectProvider('openrouter')
    api.listProviderModels.mockResolvedValue([
      { modelId: 'openai/gpt-image-2', enabled: true, isImage: true, groupName: 'openai' },
    ])

    const result = await store.fetchModels('openrouter')

    expect(api.fetchProviderModels).toHaveBeenCalledWith('openrouter')
    expect(result.autoEnabled).toBe(1)
    expect(store.currentModels).toHaveLength(1)
  })

  it('toggleModel 乐观更新开关', async () => {
    api.listProviderModels.mockResolvedValue([
      { modelId: 'openai/gpt-4o', enabled: false, isImage: false, groupName: 'openai' },
    ])
    api.setProviderModelEnabled.mockResolvedValue({})
    const store = useProvidersStore()
    await store.loadProviders()
    await store.selectProvider('openrouter')

    await store.toggleModel('openrouter', 'openai/gpt-4o', true)

    expect(api.setProviderModelEnabled).toHaveBeenCalledWith('openrouter', 'openai/gpt-4o', true)
    expect(store.currentModels[0].enabled).toBe(true)
  })

  it('removeProvider 删除后重置选中项', async () => {
    api.deleteProvider.mockResolvedValue({})
    api.listProviderModels.mockResolvedValue([])
    const store = useProvidersStore()
    await store.loadProviders()
    // 删除后列表接口只剩 siliconflow（removeProvider 内部会强制刷新列表）
    api.listProviders.mockResolvedValue([siliconflow])

    await store.removeProvider('openrouter')

    expect(api.deleteProvider).toHaveBeenCalledWith('openrouter')
    expect(store.providers.map((p) => p.id)).toEqual(['siliconflow'])
    expect(store.selectedProviderId).toBe('siliconflow')
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npm run test -- --run src/store/providers.test.js`
Expected: FAIL（Cannot find module './providers'）

- [ ] **Step 4: 实现 providers store**

创建 `src/store/providers.js`：

```js
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  addProviderModel,
  checkProvider,
  createProvider,
  deleteProvider,
  deleteProviderModel,
  fetchProviderModels,
  listProviderModels,
  listProviders,
  setProviderEnabled,
  setProviderModelEnabled,
  updateProvider,
} from '@/services/providersApi'

/**
 * 中转站 store
 *
 * 状态：providers（列表，含每家 enabledModels 简表）、selectedProviderId、
 * modelsByProvider（设置页选中家的全量模型，按 providerId 缓存）。
 * 聊天输入框的分组选择器直接用 providers[].enabledModels，无需额外请求。
 */
export const useProvidersStore = defineStore('providers', () => {
  const providers = ref([])
  const selectedProviderId = ref('')
  /** @type {import('vue').Ref<Record<string, Array<object>>>} 各家全量模型缓存 */
  const modelsByProvider = ref({})
  const loadingProviders = ref(false)
  const loadingModels = ref(false)
  const checking = ref(false)
  const fetching = ref(false)
  /** @type {import('vue').Ref<object|null>} 最近一次 Key 检测报告 */
  const checkResult = ref(null)

  const enabledProviders = computed(() => providers.value.filter((p) => p.enabled))

  /** 是否存在「启用且有 Key」的可用中转站（chat store 的 hasConfig 读它） */
  const hasUsableProvider = computed(() =>
    enabledProviders.value.some((p) => p.apiKeys?.length > 0),
  )

  const selectedProvider = computed(
    () => providers.value.find((p) => p.id === selectedProviderId.value) || null,
  )

  /** 当前选中家的全量模型（设置页用） */
  const currentModels = computed(() => modelsByProvider.value[selectedProviderId.value] || [])

  /**
   * 加载中转站列表（含 enabledModels 简表）
   * @param {boolean} force 强制刷新
   */
  async function loadProviders(force = false) {
    if (providers.value.length && !force) return
    loadingProviders.value = true
    try {
      providers.value = await listProviders()
      if (!providers.value.find((p) => p.id === selectedProviderId.value)) {
        selectedProviderId.value = providers.value[0]?.id || ''
      }
    } finally {
      loadingProviders.value = false
    }
  }

  /**
   * 选中一家并加载其全量模型（有缓存则不重复请求）
   * @param {string} id
   * @param {boolean} force 强制刷新模型
   */
  async function selectProvider(id, force = false) {
    selectedProviderId.value = id
    checkResult.value = null
    if (!id) return
    if (!force && modelsByProvider.value[id]) return
    loadingModels.value = true
    try {
      modelsByProvider.value[id] = await listProviderModels(id)
    } finally {
      loadingModels.value = false
    }
  }

  /** 新建自定义中转站并选中 */
  async function addProvider(payload) {
    const created = await createProvider(payload)
    providers.value.push(created)
    await selectProvider(created.id, true)
    return created
  }

  /** 即时保存名称/地址/Key 数组/请求模式 */
  async function saveProvider(id, patch) {
    const updated = await updateProvider(id, patch)
    const index = providers.value.findIndex((p) => p.id === id)
    if (index >= 0) providers.value[index] = { ...providers.value[index], ...updated }
    return updated
  }

  /** 整家开关 */
  async function toggleProvider(id, enabled) {
    await setProviderEnabled(id, enabled)
    const provider = providers.value.find((p) => p.id === id)
    if (provider) provider.enabled = enabled
  }

  /** 删除中转站（连带其模型缓存），重置选中项 */
  async function removeProvider(id) {
    await deleteProvider(id)
    providers.value = providers.value.filter((p) => p.id !== id)
    delete modelsByProvider.value[id]
    if (selectedProviderId.value === id) {
      selectedProviderId.value = providers.value[0]?.id || ''
    }
    // 列表变化会影响聊天选择器，整体强制刷新一次拿最新 enabledModels
    await loadProviders(true)
  }

  /** 检测当前选中家的 Key */
  async function check(id) {
    checking.value = true
    checkResult.value = null
    try {
      checkResult.value = await checkProvider(id)
      return checkResult.value
    } finally {
      checking.value = false
    }
  }

  /** 代理拉取上游模型并合并，刷新缓存与列表统计 */
  async function fetchModels(id) {
    fetching.value = true
    try {
      const result = await fetchProviderModels(id)
      modelsByProvider.value[id] = await listProviderModels(id)
      await loadProviders(true) // enabledModels 简表已变，刷新
      return result
    } finally {
      fetching.value = false
    }
  }

  /** 手动添加模型 */
  async function addModel(id, payload) {
    await addProviderModel(id, payload)
    modelsByProvider.value[id] = await listProviderModels(id)
    await loadProviders(true)
  }

  /** 单模型开关（乐观更新缓存） */
  async function toggleModel(id, modelId, enabled) {
    await setProviderModelEnabled(id, modelId, enabled)
    const models = modelsByProvider.value[id] || []
    const model = models.find((m) => m.modelId === modelId)
    if (model) model.enabled = enabled
    // enabledModels 简表变化，刷新列表（不阻塞 UI）
    loadProviders(true)
  }

  /** 移除模型 */
  async function removeModel(id, modelId) {
    await deleteProviderModel(id, modelId)
    modelsByProvider.value[id] = (modelsByProvider.value[id] || []).filter(
      (m) => m.modelId !== modelId,
    )
    loadProviders(true)
  }

  return {
    providers,
    selectedProviderId,
    modelsByProvider,
    loadingProviders,
    loadingModels,
    checking,
    fetching,
    checkResult,
    enabledProviders,
    hasUsableProvider,
    selectedProvider,
    currentModels,
    loadProviders,
    selectProvider,
    addProvider,
    saveProvider,
    toggleProvider,
    removeProvider,
    check,
    fetchModels,
    addModel,
    toggleModel,
    removeModel,
  }
})
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm run test -- --run src/store/providers.test.js`
Expected: PASS（8 tests）

---

## Task 7: 前端 — SettingsModal 骨架 + 左栏 ProviderList

**Files:**

- Create: `src/components/settings/SettingsModal.vue`
- Create: `src/components/settings/ProviderList.vue`
- Create: `src/components/settings/CreateProviderForm.vue`
- Create: `src/components/settings/GeneralSettings.vue`
- Test: `src/components/settings/SettingsModal.test.js`

> 说明：不用 n-modal（其 teleport 到 body 导致测试脆弱、样式受限），改为自绘 overlay 模态（fixed 遮罩 + 居中容器 + Esc 关闭），测试可直接断言。

- [ ] **Step 1: 写失败测试**

创建 `src/components/settings/SettingsModal.test.js`：

```js
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import SettingsModal from './SettingsModal.vue'
import ProviderList from './ProviderList.vue'
import { useProvidersStore } from '@/store/providers'
import * as api from '@/services/providersApi'

vi.mock('@/services/providersApi', () => ({
  listProviders: vi.fn(),
  createProvider: vi.fn(),
  updateProvider: vi.fn(),
  setProviderEnabled: vi.fn(),
  deleteProvider: vi.fn(),
  checkProvider: vi.fn(),
  listProviderModels: vi.fn(),
  fetchProviderModels: vi.fn(),
  addProviderModel: vi.fn(),
  setProviderModelEnabled: vi.fn(),
  deleteProviderModel: vi.fn(),
}))

const providers = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeys: ['sk-a'],
    enabled: true,
    color: '#6366f1',
    enabledModels: [],
    modelCount: 0,
    enabledModelCount: 0,
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKeys: [],
    enabled: false,
    color: '#7c3aed',
    enabledModels: [],
    modelCount: 0,
    enabledModelCount: 0,
  },
]

function mountModal() {
  return mount(SettingsModal, {
    props: { show: true },
    attachTo: document.body,
    global: { plugins: [createPinia()] },
  })
}

describe('SettingsModal 骨架', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    api.listProviders.mockResolvedValue(providers)
    api.listProviderModels.mockResolvedValue([])
    document.body.innerHTML = ''
  })

  it('show=false 时不渲染模态', () => {
    mount(SettingsModal, {
      props: { show: false },
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    })
    expect(document.body.querySelector('[data-role="settings-modal"]')).toBeNull()
  })

  it('打开时加载中转站列表并渲染左栏', async () => {
    mountModal()
    await flushPromises()

    expect(api.listProviders).toHaveBeenCalled()
    const items = document.body.querySelectorAll('[data-role="provider-item"]')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain('OpenRouter')
    // 启用的显示 ON 徽标
    expect(items[0].querySelector('[data-role="on-badge"]')).not.toBeNull()
    expect(items[1].querySelector('[data-role="on-badge"]')).toBeNull()
  })

  it('搜索框按名称过滤列表', async () => {
    mountModal()
    await flushPromises()

    const search = document.body.querySelector('[data-role="provider-search"] input')
    search.value = '硅基'
    search.dispatchEvent(new Event('input'))
    await flushPromises()

    const items = document.body.querySelectorAll('[data-role="provider-item"]')
    expect(items).toHaveLength(1)
    expect(items[0].textContent).toContain('硅基流动')
  })

  it('点击列表项选中并加载该家模型', async () => {
    mountModal()
    await flushPromises()

    const items = document.body.querySelectorAll('[data-role="provider-item"]')
    items[1].click()
    await flushPromises()

    expect(api.listProviderModels).toHaveBeenCalledWith('siliconflow')
    expect(items[1].classList.contains('is-active')).toBe(true)
  })

  it('左栏开关切换整家启用状态', async () => {
    api.setProviderEnabled.mockResolvedValue({})
    mountModal()
    await flushPromises()

    const switchEl = document.body.querySelectorAll('[data-action="toggle-provider"]')[1]
    switchEl.click()
    await flushPromises()

    expect(api.setProviderEnabled).toHaveBeenCalledWith('siliconflow', true)
  })

  it('底部「通用」切换到通用设置视图', async () => {
    mountModal()
    await flushPromises()

    document.body.querySelector('[data-action="open-general"]').click()
    await flushPromises()

    expect(document.body.querySelector('[data-role="general-settings"]')).not.toBeNull()
  })

  it('底部「+ 添加」切换到新建视图，提交后创建并返回详情', async () => {
    api.createProvider.mockResolvedValue({
      id: 'custom-1',
      name: '我的站',
      baseUrl: 'https://x.example.com/v1',
      apiKeys: [],
      enabled: true,
      enabledModels: [],
    })
    mountModal()
    await flushPromises()

    document.body.querySelector('[data-action="add-provider"]').click()
    await flushPromises()
    expect(document.body.querySelector('[data-role="create-provider"]')).not.toBeNull()

    // 填名称和地址后提交
    const nameInput = document.body.querySelector('[data-role="create-name"] input')
    nameInput.value = '我的站'
    nameInput.dispatchEvent(new Event('input'))
    const urlInput = document.body.querySelector('[data-role="create-baseurl"] input')
    urlInput.value = 'https://x.example.com/v1'
    urlInput.dispatchEvent(new Event('input'))
    document.body.querySelector('[data-action="submit-create"]').click()
    await flushPromises()

    expect(api.createProvider).toHaveBeenCalledWith({
      name: '我的站',
      baseUrl: 'https://x.example.com/v1',
    })
  })

  it('Esc 关闭模态', async () => {
    const wrapper = mountModal()
    await flushPromises()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()

    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })
})

describe('ProviderList 单元', () => {
  it('无匹配时显示空态', async () => {
    const wrapper = mount(ProviderList, {
      props: { providers, selectedId: '' },
    })

    const search = wrapper.find('[data-role="provider-search"] input')
    await search.setValue('不存在的名字')

    expect(wrapper.text()).toContain('没有匹配的中转站')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- --run src/components/settings/SettingsModal.test.js`
Expected: FAIL（Cannot find module）

- [ ] **Step 3: 实现 ProviderList.vue**

创建 `src/components/settings/ProviderList.vue`：

```vue
<script setup>
import { computed, ref } from 'vue'
import { NSwitch } from 'naive-ui'

/**
 * 设置模态左栏：中转站列表
 * 搜索过滤 / 点击选中 / 整家开关（CherryStudio 同款 ON 徽标）
 */
const props = defineProps({
  providers: { type: Array, default: () => [] },
  selectedId: { type: String, default: '' },
})
const emit = defineEmits(['select', 'toggle'])

const keyword = ref('')

/** 按名称关键词过滤 */
const filteredProviders = computed(() => {
  const key = keyword.value.trim().toLowerCase()
  if (!key) return props.providers
  return props.providers.filter((p) => p.name.toLowerCase().includes(key))
})

/** 名称首字符作为色块图标占位 */
function avatarText(name) {
  return String(name || '?')
    .trim()
    .charAt(0)
    .toUpperCase()
}
</script>

<template>
  <div class="provider-list">
    <div class="list-search">
      <n-input
        v-model:value="keyword"
        size="small"
        placeholder="搜索中转站..."
        data-role="provider-search"
      />
    </div>

    <div class="list-items">
      <div
        v-for="provider in filteredProviders"
        :key="provider.id"
        class="provider-item"
        :class="{ 'is-active': provider.id === selectedId, 'is-off': !provider.enabled }"
        data-role="provider-item"
        @click="emit('select', provider.id)"
      >
        <span
          class="provider-avatar"
          :style="{ background: provider.color || 'rgba(255,255,255,0.12)' }"
          >{{ avatarText(provider.name) }}</span
        >
        <span class="provider-name" :title="provider.name">{{ provider.name }}</span>
        <span v-if="provider.enabled" class="on-badge" data-role="on-badge">ON</span>
        <n-switch
          :value="provider.enabled"
          size="small"
          class="provider-switch"
          data-action="toggle-provider"
          @click.stop
          @update:value="emit('toggle', provider.id, $event)"
        />
      </div>

      <div v-if="!filteredProviders.length" class="list-empty">没有匹配的中转站</div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.provider-list {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.list-search {
  padding: 14px 14px 10px;
}

.list-items {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 8px;
}

.provider-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  &.is-active {
    background: rgba(99, 102, 241, 0.14);
  }

  &.is-off .provider-name {
    opacity: 0.55;
  }
}

.provider-avatar {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  flex-shrink: 0;
}

.provider-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.88);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.on-badge {
  font-size: 10px;
  font-weight: 700;
  color: rgba(16, 185, 129, 0.95);
  letter-spacing: 0.4px;
}

.list-empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}
</style>
```

（顶部补 `import { NInput, NSwitch } from 'naive-ui'`。）

- [ ] **Step 4: 实现 CreateProviderForm.vue**

创建 `src/components/settings/CreateProviderForm.vue`：

```vue
<script setup>
import { reactive, ref } from 'vue'
import { NButton, NInput } from 'naive-ui'
import { useProvidersStore } from '@/store/providers'

/** 新建自定义中转站表单（创建后自动选中进入详情） */
const emit = defineEmits(['created', 'cancel'])
const providersStore = useProvidersStore()

const form = reactive({ name: '', baseUrl: '' })
const saving = ref(false)
const error = ref('')

/** 提交创建：校验非空 → 调 store.addProvider → 通知父级切回详情视图 */
async function handleSubmit() {
  if (!form.name.trim() || !form.baseUrl.trim()) {
    error.value = '名称和 API 地址不能为空'
    return
  }
  saving.value = true
  error.value = ''
  try {
    await providersStore.addProvider({ name: form.name.trim(), baseUrl: form.baseUrl.trim() })
    emit('created')
  } catch (err) {
    error.value = err?.response?.data?.message || '创建失败，请稍后重试'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="create-provider" data-role="create-provider">
    <h3 class="panel-title">添加中转站</h3>
    <div class="field">
      <label>名称</label>
      <n-input v-model:value="form.name" placeholder="如：我的中转站" data-role="create-name" />
    </div>
    <div class="field">
      <label>API 地址</label>
      <n-input
        v-model:value="form.baseUrl"
        placeholder="https://your-gateway.example.com/v1"
        data-role="create-baseurl"
      />
    </div>
    <p v-if="error" class="form-error" data-role="create-error">{{ error }}</p>
    <div class="form-actions">
      <n-button size="small" @click="emit('cancel')">取消</n-button>
      <n-button
        size="small"
        type="primary"
        :loading="saving"
        data-action="submit-create"
        @click="handleSubmit"
        >创建</n-button
      >
    </div>
  </div>
</template>

<style lang="scss" scoped>
.create-provider {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;

  label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.62);
  }
}

.form-error {
  margin: 0;
  font-size: 12px;
  color: rgba(248, 113, 113, 0.92);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
```

- [ ] **Step 5: 实现 GeneralSettings.vue**

创建 `src/components/settings/GeneralSettings.vue`：

```vue
<script setup>
import { NInputNumber, NSelect } from 'naive-ui'
import { useChatStore } from '@/store/chat'

/**
 * 通用设置：请求模式 / 超时 / 默认张数
 * 字段失焦即时保存（复用 chat store 的 saveSettings 链路）
 */
const chatStore = useChatStore()

const requestModeOptions = [
  { label: 'OpenRouter 图片模式', value: 'openrouter-image' },
  { label: '聊天封装模式', value: 'openai-chat' },
]

/** 失焦即时保存 */
async function handleBlur() {
  await chatStore.saveSettings()
}
</script>

<template>
  <div class="general-settings" data-role="general-settings">
    <h3 class="panel-title">通用设置</h3>
    <div class="field">
      <label>请求模式</label>
      <n-select
        v-model:value="chatStore.appConfig.requestMode"
        :options="requestModeOptions"
        @blur="handleBlur"
      />
    </div>
    <div class="field">
      <label>超时时间（毫秒）</label>
      <n-input-number
        v-model:value="chatStore.appConfig.timeout"
        :min="30000"
        :step="1000"
        @blur="handleBlur"
      />
    </div>
    <div class="field">
      <label>默认张数</label>
      <n-input-number
        v-model:value="chatStore.appConfig.defaultN"
        :min="1"
        :max="4"
        @blur="handleBlur"
      />
    </div>
    <p class="field-hint">修改失焦后自动保存</p>
  </div>
</template>

<style lang="scss" scoped>
.general-settings {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;

  label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.62);
  }
}

.field-hint {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}
</style>
```

- [ ] **Step 6: 实现 SettingsModal.vue 骨架**

创建 `src/components/settings/SettingsModal.vue`：

```vue
<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useProvidersStore } from '@/store/providers'
import ProviderList from './ProviderList.vue'
import ProviderDetail from './ProviderDetail.vue'
import CreateProviderForm from './CreateProviderForm.vue'
import GeneralSettings from './GeneralSettings.vue'

/**
 * 设置模态（CherryStudio 式模型广场）
 *
 * 自绘 overlay 模态（不用 n-modal，便于测试与样式控制）：
 * - 左栏：中转站列表（搜索/开关/添加）+ 通用设置入口
 * - 右栏：详情 / 通用 / 新建 三个视图切换
 * - 即时保存语义：各字段变更即调 API，无保存按钮
 */
const props = defineProps({
  show: { type: Boolean, default: false },
})
const emit = defineEmits(['update:show'])

const providersStore = useProvidersStore()

/** 右栏视图：provider（详情）/ general（通用设置）/ create（新建中转站） */
const view = ref('provider')

// 模态打开时加载列表并重置视图
watch(
  () => props.show,
  (show) => {
    if (show) {
      view.value = 'provider'
      providersStore.loadProviders()
    }
  },
)

/** 选中一家 → 切详情视图并加载其模型 */
function handleSelect(id) {
  view.value = 'provider'
  providersStore.selectProvider(id)
}

/** 整家开关 */
function handleToggle(id, enabled) {
  providersStore.toggleProvider(id, enabled)
}

/** Esc 关闭 */
function handleKeydown(event) {
  if (event.key === 'Escape' && props.show) {
    emit('update:show', false)
  }
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="settings-overlay"
      data-role="settings-overlay"
      @click.self="emit('update:show', false)"
    >
      <div class="settings-modal" data-role="settings-modal">
        <aside class="settings-sidebar">
          <ProviderList
            :providers="providersStore.providers"
            :selected-id="view === 'provider' ? providersStore.selectedProviderId : ''"
            @select="handleSelect"
            @toggle="handleToggle"
          />
          <div class="sidebar-footer">
            <button
              type="button"
              class="footer-btn"
              :class="{ 'is-active': view === 'general' }"
              data-action="open-general"
              @click="view = 'general'"
            >
              通用
            </button>
            <button
              type="button"
              class="footer-btn"
              data-action="add-provider"
              @click="view = 'create'"
            >
              + 添加
            </button>
          </div>
        </aside>

        <section class="settings-main">
          <ProviderDetail v-if="view === 'provider'" />
          <GeneralSettings v-else-if="view === 'general'" />
          <CreateProviderForm
            v-else-if="view === 'create'"
            @created="view = 'provider'"
            @cancel="view = 'provider'"
          />
        </section>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.settings-modal {
  width: min(1100px, calc(100vw - 48px));
  height: min(720px, calc(100vh - 48px));
  border-radius: 16px;
  background: rgba(18, 18, 20, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6);
  display: flex;
  overflow: hidden;
}

.settings-sidebar {
  width: 260px;
  flex-shrink: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.07);
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.02);
}

.sidebar-footer {
  display: flex;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.footer-btn {
  flex: 1;
  padding: 8px 0;
  border: none;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.75);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.95);
  }

  &.is-active {
    background: rgba(99, 102, 241, 0.2);
    color: rgba(165, 180, 252, 0.95);
  }
}

.settings-main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
}
</style>
```

（ProviderDetail 在 Task 8 实现；本任务先建一个同名占位组件会污染后续步骤——跳过，直接让 Task 8 创建。为让本任务测试能跑通，先在 `src/components/settings/ProviderDetail.vue` 放最小实现：`<template><div data-role="provider-detail"></div></template>`，Task 8 Step 1 的测试会驱动它重写。）

- [ ] **Step 7: 跑测试确认通过**

Run: `npm run test -- --run src/components/settings/SettingsModal.test.js`
Expected: PASS（8 tests）

---

## Task 8: 前端 — ProviderDetail 右栏（Key/地址/检测/模型区）

**Files:**

- Create: `src/components/settings/ProviderDetail.vue`（重写 Task 7 的占位）
- Test: `src/components/settings/ProviderDetail.test.js`

- [ ] **Step 1: 写失败测试**

创建 `src/components/settings/ProviderDetail.test.js`：

```js
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import ProviderDetail from './ProviderDetail.vue'
import { useProvidersStore } from '@/store/providers'
import * as api from '@/services/providersApi'

vi.mock('@/services/providersApi', () => ({
  listProviders: vi.fn(),
  createProvider: vi.fn(),
  updateProvider: vi.fn(),
  setProviderEnabled: vi.fn(),
  deleteProvider: vi.fn(),
  checkProvider: vi.fn(),
  listProviderModels: vi.fn(),
  fetchProviderModels: vi.fn(),
  addProviderModel: vi.fn(),
  setProviderModelEnabled: vi.fn(),
  deleteProviderModel: vi.fn(),
}))

const openrouter = {
  id: 'openrouter',
  name: 'OpenRouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKeys: ['sk-first', 'sk-second'],
  enabled: true,
  color: '#6366f1',
  enabledModels: [],
  modelCount: 3,
  enabledModelCount: 2,
}

async function mountDetail() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useProvidersStore()
  await store.loadProviders()
  await store.selectProvider('openrouter')
  const wrapper = mount(ProviderDetail, {
    attachTo: document.body,
    global: { plugins: [pinia] },
  })
  return { wrapper, store }
}

describe('ProviderDetail', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    api.listProviders.mockResolvedValue([openrouter])
    api.listProviderModels.mockResolvedValue([
      {
        modelId: 'openai/gpt-image-2',
        displayName: 'GPT Image 2',
        enabled: true,
        isImage: true,
        groupName: 'openai',
      },
      {
        modelId: 'openai/gpt-4o',
        displayName: 'GPT-4o',
        enabled: false,
        isImage: false,
        groupName: 'openai',
      },
      {
        modelId: 'flux/dev',
        displayName: 'Flux Dev',
        enabled: true,
        isImage: true,
        groupName: 'flux',
      },
    ])
    document.body.innerHTML = ''
  })

  it('渲染名称、地址、Key（每行一把）与整家开关', async () => {
    mount(ProviderDetail, {
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    })
    // 无选中时的空态
    expect(document.body.querySelector('[data-role="detail-empty"]')).not.toBeNull()

    const { wrapper } = await mountDetail()
    expect(wrapper.find('[data-role="detail-title"]').text()).toContain('OpenRouter')
    expect(wrapper.find('[data-role="base-url"] input').element.value).toBe(
      'https://openrouter.ai/api/v1',
    )
    expect(wrapper.find('[data-role="api-keys"] textarea').element.value).toBe(
      'sk-first\nsk-second',
    )
    // 地址预览
    expect(wrapper.text()).toContain('https://openrouter.ai/api/v1/images')
  })

  it('Key 编辑失焦后按行拆分即时保存', async () => {
    api.updateProvider.mockImplementation(async (id, patch) => ({ ...openrouter, ...patch }))
    const { wrapper } = await mountDetail()

    const textarea = wrapper.find('[data-role="api-keys"] textarea')
    await textarea.setValue('sk-a\n\nsk-b\n')
    await textarea.trigger('blur')
    await flushPromises()

    expect(api.updateProvider).toHaveBeenCalledWith('openrouter', {
      apiKeys: ['sk-a', 'sk-b'],
    })
  })

  it('baseUrl 失焦即时保存', async () => {
    api.updateProvider.mockImplementation(async (id, patch) => ({ ...openrouter, ...patch }))
    const { wrapper } = await mountDetail()

    const input = wrapper.find('[data-role="base-url"] input')
    await input.setValue('https://new-gateway.example.com/v1')
    await input.trigger('blur')
    await flushPromises()

    expect(api.updateProvider).toHaveBeenCalledWith('openrouter', {
      baseUrl: 'https://new-gateway.example.com/v1',
    })
  })

  it('检测按钮展示可用数与延迟', async () => {
    api.checkProvider.mockResolvedValue({
      total: 2,
      available: 1,
      results: [
        { tail: '1234', ok: true, latencyMs: 120 },
        { tail: '5678', ok: false, status: 401, latencyMs: 80 },
      ],
    })
    const { wrapper } = await mountDetail()

    await wrapper.find('[data-action="check-keys"]').trigger('click')
    await flushPromises()

    expect(api.checkProvider).toHaveBeenCalledWith('openrouter')
    expect(wrapper.find('[data-role="check-result"]').text()).toContain('1/2 可用')
    expect(wrapper.find('[data-role="check-result"]').text()).toContain('120ms')
    expect(wrapper.find('[data-role="check-result"]').text()).toContain('5678')
  })

  it('模型按组渲染，图像模型带标签，开关即时生效', async () => {
    api.setProviderModelEnabled.mockResolvedValue({})
    const { wrapper } = await mountDetail()

    // 两个分组
    expect(wrapper.findAll('[data-role="model-group"]')).toHaveLength(2)
    // 三行模型
    const rows = wrapper.findAll('[data-role="model-row"]')
    expect(rows).toHaveLength(3)
    // 图像模型标签
    expect(rows[0].find('[data-role="image-tag"]').exists()).toBe(true)
    expect(rows[1].find('[data-role="image-tag"]').exists()).toBe(false)

    // 开关第二行（gpt-4o 启用）
    await rows[1].find('[data-action="toggle-model"]').trigger('click')
    await flushPromises()
    expect(api.setProviderModelEnabled).toHaveBeenCalledWith('openrouter', 'openai/gpt-4o', true)
  })

  it('模型搜索过滤', async () => {
    const { wrapper } = await mountDetail()

    const search = wrapper.find('[data-role="model-search"] input')
    await search.setValue('flux')
    await flushPromises()

    const rows = wrapper.findAll('[data-role="model-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('flux/dev')
  })

  it('获取模型列表按钮触发 fetch 并展示统计 toast', async () => {
    api.fetchProviderModels.mockResolvedValue({
      added: 2,
      updated: 1,
      total: 3,
      autoEnabled: 1,
      staleModelIds: [],
    })
    const { wrapper } = await mountDetail()

    await wrapper.find('[data-action="fetch-models"]').trigger('click')
    await flushPromises()

    expect(api.fetchProviderModels).toHaveBeenCalledWith('openrouter')
    expect(wrapper.find('[data-role="fetch-result"]').text()).toContain('新增 2 个模型')
    expect(wrapper.find('[data-role="fetch-result"]').text()).toContain('自动启用 1 个图像模型')
  })

  it('手动添加模型', async () => {
    api.addProviderModel.mockResolvedValue({ modelId: 'flux/pro', enabled: true })
    const { wrapper } = await mountDetail()

    const input = wrapper.find('[data-role="add-model-input"] input')
    await input.setValue('flux/pro')
    await wrapper.find('[data-action="add-model"]').trigger('click')
    await flushPromises()

    expect(api.addProviderModel).toHaveBeenCalledWith('openrouter', { modelId: 'flux/pro' })
  })

  it('删除模型', async () => {
    api.deleteProviderModel.mockResolvedValue({})
    const { wrapper } = await mountDetail()

    await wrapper.findAll('[data-action="remove-model"]')[0].trigger('click')
    await flushPromises()

    expect(api.deleteProviderModel).toHaveBeenCalledWith('openrouter', 'openai/gpt-image-2')
  })

  it('删除中转站：二次确认后调删除 API', async () => {
    api.deleteProvider.mockResolvedValue({})
    api.listProviderModels.mockResolvedValue([])
    const confirmSpy = vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const { wrapper } = await mountDetail()

    await wrapper.find('[data-action="remove-provider"]').trigger('click')
    await flushPromises()

    expect(confirmSpy).toHaveBeenCalled()
    expect(api.deleteProvider).toHaveBeenCalledWith('openrouter')
    vi.unstubAllGlobals()
  })

  it('删除中转站：取消确认时不调 API', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false))
    const { wrapper } = await mountDetail()

    await wrapper.find('[data-action="remove-provider"]').trigger('click')
    await flushPromises()

    expect(api.deleteProvider).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- --run src/components/settings/ProviderDetail.test.js`
Expected: FAIL（现有占位组件无这些元素）

- [ ] **Step 3: 实现 ProviderDetail.vue**

创建 `src/components/settings/ProviderDetail.vue`（覆盖 Task 7 占位）：

```vue
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { NButton, NInput, NSwitch } from 'naive-ui'
import { useProvidersStore } from '@/store/providers'

/**
 * 设置模态右栏：中转站详情
 *
 * 即时保存语义：名称/地址/Key 失焦即保存；开关类即点即存。
 * Key 用多行输入（每行一把，空行忽略），密码遮蔽可切换。
 */
const providersStore = useProvidersStore()

const provider = computed(() => providersStore.selectedProvider)

/** 本地编辑态（与 store 同步，失焦时写回） */
const form = reactive({ name: '', baseUrl: '', apiKeysText: '' })
const showKeys = ref(false)
const modelKeyword = ref('')
const newModelId = ref('')
const fetchResult = ref('')

// 切换选中家时同步本地表单，并清空一次性状态
watch(
  () => provider.value?.id,
  () => {
    syncForm()
    fetchResult.value = ''
    providersStore.checkResult = null
  },
  { immediate: true },
)

/** 把 store 的选中家数据同步进本地表单 */
function syncForm() {
  form.name = provider.value?.name || ''
  form.baseUrl = provider.value?.baseUrl || ''
  form.apiKeysText = (provider.value?.apiKeys || []).join('\n')
}

/** 失焦保存名称 */
async function saveName() {
  if (!provider.value || form.name.trim() === provider.value.name) return
  if (!form.name.trim()) return
  await providersStore.saveProvider(provider.value.id, { name: form.name.trim() })
}

/** 失焦保存地址 */
async function saveBaseUrl() {
  if (!provider.value || form.baseUrl.trim() === provider.value.baseUrl) return
  if (!form.baseUrl.trim()) return
  await providersStore.saveProvider(provider.value.id, { baseUrl: form.baseUrl.trim() })
}

/** 失焦保存 Key：按行拆分、去空行 */
async function saveApiKeys() {
  if (!provider.value) return
  const apiKeys = form.apiKeysText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (apiKeys.join('\n') === (provider.value.apiKeys || []).join('\n')) return
  await providersStore.saveProvider(provider.value.id, { apiKeys })
}

/** 检测全部 Key */
async function handleCheck() {
  if (!provider.value) return
  await providersStore.check(provider.value.id)
}

/** 拉取模型列表并展示统计 */
async function handleFetch() {
  if (!provider.value) return
  fetchResult.value = ''
  try {
    const result = await providersStore.fetchModels(provider.value.id)
    fetchResult.value = `新增 ${result.added} 个模型，自动启用 ${result.autoEnabled} 个图像模型`
  } catch (err) {
    fetchResult.value = `获取失败：${err?.response?.data?.message || err?.message || '网络错误'}`
  }
}

/** 手动添加模型 */
async function handleAddModel() {
  const modelId = newModelId.value.trim()
  if (!modelId || !provider.value) return
  await providersStore.addModel(provider.value.id, { modelId })
  newModelId.value = ''
}

/** 删除整家中转站：window.confirm 二次确认（自绘模态内嵌套 n-dialog 层级/测试都更复杂，从简） */
async function handleRemoveProvider() {
  if (!provider.value) return
  const ok = window.confirm(
    `确定删除「${provider.value.name}」吗？其模型配置将一并删除，引用它的草稿会回退到默认中转站。`,
  )
  if (!ok) return
  await providersStore.removeProvider(provider.value.id)
}

/** 按关键词过滤 + 按组归类的模型列表 */
const modelGroups = computed(() => {
  const key = modelKeyword.value.trim().toLowerCase()
  const groups = new Map()
  for (const model of providersStore.currentModels) {
    if (key && !model.modelId.toLowerCase().includes(key)) continue
    const group = model.groupName || '其他'
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push(model)
  }
  return [...groups.entries()].map(([name, models]) => ({ name, models }))
})

/** 检测报告的汇总文案 */
const checkSummary = computed(() => {
  const report = providersStore.checkResult
  if (!report) return ''
  return `${report.available}/${report.total} 可用`
})
</script>

<template>
  <div v-if="!provider" class="detail-empty" data-role="detail-empty">
    <p>选择左侧中转站查看详情，或点击「+ 添加」创建新的中转站</p>
  </div>

  <div v-else class="provider-detail" data-role="provider-detail">
    <!-- 顶行：名称 + 整家开关 -->
    <div class="detail-header">
      <h3 class="detail-title" data-role="detail-title">
        <n-input
          v-model:value="form.name"
          size="small"
          class="name-input"
          data-role="provider-name"
          @blur="saveName"
        />
      </h3>
      <n-switch
        :value="provider.enabled"
        data-action="toggle-detail-provider"
        @update:value="providersStore.toggleProvider(provider.id, $event)"
      />
      <button
        type="button"
        class="remove-provider-btn"
        data-action="remove-provider"
        @click="handleRemoveProvider"
      >
        删除
      </button>
    </div>

    <!-- API 密钥 -->
    <div class="field">
      <div class="field-label-row">
        <label>API 密钥</label>
        <div class="field-actions">
          <button
            type="button"
            class="link-btn"
            data-action="toggle-keys-visibility"
            @click="showKeys = !showKeys"
          >
            {{ showKeys ? '隐藏' : '显示' }}
          </button>
          <n-button
            size="tiny"
            :loading="providersStore.checking"
            data-action="check-keys"
            @click="handleCheck"
            >检测</n-button
          >
        </div>
      </div>
      <n-input
        v-model:value="form.apiKeysText"
        :type="showKeys ? 'textarea' : 'password'"
        :autosize="{ minRows: 2, maxRows: 5 }"
        placeholder="每行一把密钥，多把轮询使用"
        data-role="api-keys"
        @blur="saveApiKeys"
      />
      <p class="field-hint">多个密钥换行分隔，请求时轮询使用</p>
      <div v-if="providersStore.checkResult" class="check-result" data-role="check-result">
        <span :class="{ ok: providersStore.checkResult.available > 0 }">{{ checkSummary }}</span>
        <span
          v-for="item in providersStore.checkResult.results"
          :key="item.tail"
          class="check-item"
          :class="{ ok: item.ok }"
        >
          …{{ item.tail }} ·
          {{ item.ok ? `${item.latencyMs}ms` : `失败${item.status ? ` (${item.status})` : ''}` }}
        </span>
      </div>
    </div>

    <!-- API 地址 -->
    <div class="field">
      <label>API 地址</label>
      <n-input
        v-model:value="form.baseUrl"
        placeholder="https://your-gateway.example.com/v1"
        data-role="base-url"
        @blur="saveBaseUrl"
      />
      <p class="field-hint">预览：{{ form.baseUrl || '…' }}/images</p>
    </div>

    <!-- 模型区 -->
    <div class="models-section">
      <div class="models-header">
        <span class="models-title">模型 · {{ providersStore.currentModels.length }}</span>
        <n-input
          v-model:value="modelKeyword"
          size="small"
          placeholder="搜索模型"
          class="model-search"
          data-role="model-search"
        />
        <n-button
          size="small"
          :loading="providersStore.fetching"
          data-action="fetch-models"
          @click="handleFetch"
          >获取模型列表</n-button
        >
      </div>
      <p v-if="fetchResult" class="fetch-result" data-role="fetch-result">{{ fetchResult }}</p>

      <div class="add-model-row">
        <n-input
          v-model:value="newModelId"
          size="small"
          placeholder="手动添加模型 ID，如 flux/pro"
          data-role="add-model-input"
          @keydown.enter="handleAddModel"
        />
        <n-button size="small" data-action="add-model" @click="handleAddModel">+ 添加</n-button>
      </div>

      <div v-if="providersStore.loadingModels" class="models-empty">加载中…</div>
      <div v-else-if="!providersStore.currentModels.length" class="models-empty">
        暂无模型，点击「获取模型列表」或手动添加
      </div>

      <div
        v-for="group in modelGroups"
        :key="group.name"
        class="model-group"
        data-role="model-group"
      >
        <div class="group-name">{{ group.name }}</div>
        <div
          v-for="model in group.models"
          :key="model.modelId"
          class="model-row"
          :class="{ 'is-off': !model.enabled }"
          data-role="model-row"
        >
          <span class="model-id" :title="model.modelId">{{ model.modelId }}</span>
          <span v-if="model.isImage" class="image-tag" data-role="image-tag">图像</span>
          <n-switch
            :value="model.enabled"
            size="small"
            data-action="toggle-model"
            @update:value="providersStore.toggleModel(provider.id, model.modelId, $event)"
          />
          <button
            type="button"
            class="remove-btn"
            data-action="remove-model"
            @click="providersStore.removeModel(provider.id, model.modelId)"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.detail-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.4);
  font-size: 13px;
}

.provider-detail {
  padding: 20px 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.detail-title {
  margin: 0;
  flex: 1;
  min-width: 0;
}

.name-input {
  max-width: 320px;
  font-size: 15px;
  font-weight: 600;
}

.remove-provider-btn {
  border: 1px solid rgba(248, 113, 113, 0.25);
  background: rgba(248, 113, 113, 0.08);
  color: rgba(248, 113, 113, 0.85);
  padding: 5px 12px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    background: rgba(248, 113, 113, 0.16);
    color: rgba(248, 113, 113, 1);
  }
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;

  label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.62);
  }
}

.field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.field-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.link-btn {
  border: none;
  background: none;
  padding: 0;
  font-size: 12px;
  color: rgba(119, 168, 255, 0.85);
  cursor: pointer;
}

.field-hint {
  margin: 0;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.38);
}

.check-result {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);

  .ok {
    color: rgba(16, 185, 129, 0.95);
  }
}

.check-item {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(248, 113, 113, 0.12);

  &.ok {
    background: rgba(16, 185, 129, 0.12);
  }
}

.models-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  padding-top: 16px;
}

.models-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.models-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
}

.model-search {
  flex: 1;
  max-width: 220px;
  margin-left: auto;
}

.fetch-result {
  margin: 0;
  font-size: 12px;
  color: rgba(16, 185, 129, 0.9);
}

.add-model-row {
  display: flex;
  gap: 8px;
}

.models-empty {
  padding: 20px;
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}

.model-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.group-name {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.45);
  padding: 6px 4px 2px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.model-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 9px;

  &:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  &.is-off .model-id {
    opacity: 0.5;
  }
}

.model-id {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.85);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.image-tag {
  font-size: 10px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.18);
  color: rgba(165, 180, 252, 0.95);
  flex-shrink: 0;
}

.remove-btn {
  border: none;
  background: none;
  padding: 2px 6px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  border-radius: 6px;

  &:hover {
    color: rgba(248, 113, 113, 0.95);
    background: rgba(248, 113, 113, 0.1);
  }
}
</style>
```

（store 的 `checkResult` 是 ref，setup store return 后自动解包——`providersStore.checkResult = null` 直接赋值有效。）

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test -- --run src/components/settings/`
Expected: PASS（SettingsModal 8 + ProviderDetail 11）

---

## Task 9: 前端 — chat store 改造（providerId 草稿 + hasConfig 新语义）

**Files:**

- Modify: `src/store/chat.js`
- Modify: `src/store/chat.test.js`（加 providersApi / download mock + 3 个新用例）
- Modify: `src/components/ChatArea.test.js`（加 providersApi mock，stub 换 SettingsModal）

> 说明：chat store 通过 `useProvidersStore()` 读 providers 状态（Pinia 支持 store 互引，providers store 不反向依赖 chat，无循环）。`hasConfig` 从「baseURL 非空」改为「存在启用且有 Key 的中转站」（spec 5.4）。

- [ ] **Step 1: chat.test.js 加 mock 与失败用例**

`src/store/chat.test.js` 顶部 mock 区追加（与现有 mock 并列）：

```js
vi.mock('@/services/providersApi', () => ({
  listProviders: vi.fn().mockResolvedValue([
    {
      id: 'openrouter',
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKeys: ['sk-a'],
      enabled: true,
      enabledModels: [{ modelId: 'openai/gpt-image-2', displayName: 'GPT Image 2' }],
    },
  ]),
  createProvider: vi.fn(),
  updateProvider: vi.fn(),
  setProviderEnabled: vi.fn(),
  deleteProvider: vi.fn(),
  checkProvider: vi.fn(),
  listProviderModels: vi.fn().mockResolvedValue([]),
  fetchProviderModels: vi.fn(),
  addProviderModel: vi.fn(),
  setProviderModelEnabled: vi.fn(),
  deleteProviderModel: vi.fn(),
}))

// completeImageGeneration 会触发浏览器下载，jsdom 里替换为空实现
vi.mock('@/utils/download', () => ({
  buildImageFileName: vi.fn(() => 'test.png'),
  buildTimestamp: vi.fn(() => '20260722'),
  triggerBrowserDownload: vi.fn(),
}))
```

（beforeEach 的 `vi.clearAllMocks()` 只清调用记录不清实现，工厂内的 `mockResolvedValue` 仍有效。）

describe 内追加 3 个用例：

```js
it('hasConfig 反映是否存在「启用且有 Key」的中转站', async () => {
  const { useProvidersStore } = await import('./providers')
  const store = useChatStore()
  const providersStore = useProvidersStore()

  await store.bootstrap()
  expect(store.hasConfig).toBe(true)

  // 唯一一家的 Key 清空后变为不可用
  providersStore.providers[0].apiKeys = []
  expect(store.hasConfig).toBe(false)
})

it('草稿序列化携带 providerId，防抖保存传给后端', async () => {
  const store = useChatStore()
  await store.createTopic('海报概念')

  store.currentDraft.providerId = 'siliconflow'
  vi.advanceTimersByTime(300)

  expect(saveDraftMock).toHaveBeenCalledWith(
    'topic-1',
    expect.objectContaining({ providerId: 'siliconflow' }),
  )
})

it('completeImageGeneration 把 providerName 写入消息 meta', async () => {
  const store = useChatStore()
  await store.createTopic('海报概念')
  await store.addUserPrompt('画一只猫')

  await store.completeImageGeneration(
    {
      images: [{ id: 'img-1', url: 'data:image/png;base64,x' }],
      revisedPrompt: '',
      providerName: '硅基流动',
    },
    '画一只猫',
  )

  const assistant = store.currentMessages.find((m) => m.type === 'assistant_images')
  expect(assistant.meta.providerName).toBe('硅基流动')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- --run src/store/chat.test.js`
Expected: FAIL（3 个新用例：hasConfig 仍读 baseURL / saveDraft 无 providerId / 消息无 meta）

- [ ] **Step 3: 改造 chat.js**

`src/store/chat.js` 共 7 处改动：

① 顶部 import 追加：

```js
import { useProvidersStore } from '@/store/providers'
```

② setup 内 `const defaults = getDefaultAppConfig()` 之后加：

```js
// hasConfig 改为读 providers store：存在「启用且有 Key」的中转站才可用
const providersStore = useProvidersStore()
```

③ `transientDraft` 与 `ensureDraft` 的默认对象各加一行 `providerId: '',`（与 model/size 同级）。

④ hasConfig 改语义：

```js
const hasConfig = computed(() => providersStore.hasUsableProvider)
```

⑤ bootstrap 并行加载 providers 与 settings（providers 列表供输入框分组选择器与 hasConfig 使用）：

```js
    try {
      const [settings] = await Promise.all([getSettings(), providersStore.loadProviders()])
      Object.assign(appConfig, defaults, settings)
      topics.value = await listTopics()
      // ...后续不变
```

⑥ `serializeDraft` 返回对象加一行：

```js
      providerId: draft.providerId || '',
```

⑦ `completeImageGeneration` 的 assistant 消息 push 对象加 meta（与后端 listMessages 的 meta 结构对齐，ImageMessageCard 统一读 `message.meta.providerName`）：

```js
      sourceMessageId: draft.referenceImages[0]?.sourceMessageId || null,
      meta: { providerName: result.providerName || '' },
      createdAt: Date.now(),
```

- [ ] **Step 4: ChatArea.test.js 补 providersApi mock**

`src/components/ChatArea.test.js` 在现有 mock 后追加（bootstrap 现在会调 listProviders，不 mock 会发真实请求）：

```js
vi.mock('@/services/providersApi', () => ({
  listProviders: vi.fn().mockResolvedValue([]),
  createProvider: vi.fn(),
  updateProvider: vi.fn(),
  setProviderEnabled: vi.fn(),
  deleteProvider: vi.fn(),
  checkProvider: vi.fn(),
  listProviderModels: vi.fn().mockResolvedValue([]),
  fetchProviderModels: vi.fn(),
  addProviderModel: vi.fn(),
  setProviderModelEnabled: vi.fn(),
  deleteProviderModel: vi.fn(),
}))
```

同时把 stubs 里的 `SettingsDrawer: true` 换成 `SettingsModal: true`（组件在 Task 11 替换，此处先改 stub 名会导致本步骤测试失败——因此本步骤只加 mock；stub 替换放在 Task 11 一起做）。

- [ ] **Step 5: 跑测试确认通过**

Run: `npm run test -- --run src/store/ src/components/ChatArea.test.js`
Expected: PASS（chat.test 8+3、ChatArea.test 1）

---

## Task 10: 前端 — InputConsole 分组模型选择器

**Files:**

- Modify: `src/components/InputConsole.vue`
- Modify: `src/components/InputConsole.test.js`

> 说明（spec 5.3）：单 `n-select` 换成分组下拉——组标题 = 启用中的中转站名（带色块圆点），选项 = 该家已启用模型；option value 为复合键 `${providerId}::${modelId}`，选中拆存 `draft.providerId` + `draft.model`；无可用模型时显示「去设置添加模型」引导。`handleSend` 无需改动——`draft` 展开已自动携带 providerId（Task 9 已加）。

- [ ] **Step 1: InputConsole.test.js 加 mock、seed 助手与 4 个失败用例**

`src/components/InputConsole.test.js` 顶部 import 区追加：

```js
import { requestImages } from '@/services/imageSession'
import { useProvidersStore } from '@/store/providers'
```

顶部 mock 区追加（`requestImages` 工厂只给 `vi.fn()`，具体返回值在用例内现设——本文件 beforeEach 用 `vi.restoreAllMocks()`，会把工厂里的 `mockResolvedValue` 一并还原）：

```js
vi.mock('@/services/imageSession', () => ({
  requestImages: vi.fn(),
}))
```

`describe` 之前追加 seed 助手：

```js
/**
 * 向 providers store 注入两家中转站：
 * openrouter 启用（含 2 个启用模型）；siliconflow 停用（不应出现在选择器）
 */
function seedProviders() {
  const providersStore = useProvidersStore()
  providersStore.providers = [
    {
      id: 'openrouter',
      name: 'OpenRouter',
      color: '#6366f1',
      enabled: true,
      apiKeys: ['sk-a'],
      enabledModels: [
        { modelId: 'openai/gpt-image-2', displayName: 'GPT Image 2' },
        { modelId: 'flux/dev', displayName: '' },
      ],
    },
    {
      id: 'siliconflow',
      name: '硅基流动',
      color: '#10b981',
      enabled: false,
      apiKeys: [],
      enabledModels: [{ modelId: 'qwen/image', displayName: 'Qwen Image' }],
    },
  ]
}
```

**改造 2 个既有用例**（无可用模型时模型 n-select 不渲染，会导致旧断言 `n-base-selection × 2` / `NSelect × 2` 失败）：

- 用例「将输入同步到当前草稿并启用发送按钮」：`setActivePinia(pinia)` 之后加一行 `seedProviders()`
- 用例「点击尺寸触发器后显示网格弹层」：`setActivePinia(pinia)` 之后加一行 `seedProviders()`

describe 内追加 4 个新用例：

```js
it('模型选择器按中转站分组渲染选项', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  seedProviders()

  const wrapper = mount(InputConsole, {
    global: { plugins: [pinia] },
  })

  const modelSelect = wrapper.findAllComponents(NSelect)[0]
  const options = modelSelect.props('options')

  // 停用的一家不出现在选项里
  expect(options).toHaveLength(1)
  expect(options[0].type).toBe('group')
  expect(options[0].label).toBe('OpenRouter')
  expect(options[0].children).toHaveLength(2)
  expect(options[0].children[0]).toMatchObject({
    label: 'GPT Image 2 · OpenRouter',
    value: 'openrouter::openai/gpt-image-2',
  })
  // 无 displayName 的模型回退显示 modelId
  expect(options[0].children[1].label).toBe('flux/dev · OpenRouter')
})

it('选中模型拆存为 draft.providerId + draft.model', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  seedProviders()

  const wrapper = mount(InputConsole, {
    global: { plugins: [pinia] },
  })
  const store = useChatStore()

  const modelSelect = wrapper.findAllComponents(NSelect)[0]
  modelSelect.vm.$emit('update:value', 'openrouter::flux/dev')

  expect(store.currentDraft.providerId).toBe('openrouter')
  expect(store.currentDraft.model).toBe('flux/dev')
})

it('无任何启用模型时显示引导入口，点击打开设置模态', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  // 不 seed：providers 为空 → 无可用模型

  const wrapper = mount(InputConsole, {
    global: { plugins: [pinia] },
  })
  const store = useChatStore()

  const entry = wrapper.find('[data-action="open-settings-empty"]')
  expect(entry.exists()).toBe(true)
  await entry.trigger('click')
  expect(store.settingsVisible).toBe(true)
})

it('发送时 requestImages 的 draft 携带 providerId', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  seedProviders()

  const wrapper = mount(InputConsole, {
    global: { plugins: [pinia] },
  })
  const store = useChatStore()
  vi.spyOn(store, 'addUserPrompt').mockResolvedValue('topic-1')
  vi.spyOn(store, 'completeImageGeneration').mockResolvedValue()
  requestImages.mockResolvedValue({ images: [], revisedPrompt: '' })

  store.currentDraft.providerId = 'openrouter'
  store.currentDraft.model = 'openai/gpt-image-2'
  await wrapper.find('textarea').setValue('画一只猫')
  await wrapper.find('.send-btn').trigger('click')
  await flushPromises()

  expect(requestImages).toHaveBeenCalledWith(
    'topic-1',
    expect.objectContaining({
      draft: expect.objectContaining({
        providerId: 'openrouter',
        model: 'openai/gpt-image-2',
      }),
    }),
  )
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- --run src/components/InputConsole.test.js`
Expected: FAIL（4 个新用例：options 仍是旧平铺数组 / draft 无 providerId / 无引导入口 / requestImages 未带 providerId；2 个改造用例因选择器消失也可能连带失败）

- [ ] **Step 3: 改造 InputConsole.vue**

共 7 处改动：

① 第一行 vue import 改为（加 `h`）：

```js
import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue'
```

② `import { useChatStore } from '@/store/chat'` 之后追加：

```js
import { useProvidersStore } from '@/store/providers'
```

③ `const chatStore = useChatStore()` 之后追加：

```js
const providersStore = useProvidersStore()
```

④ 删除写死的模型常量整行（含其后空行）：

```js
const models = [{ label: 'GPT Image 2', value: 'openai/gpt-image-2' }]
```

⑤ `const draft = computed(() => chatStore.currentDraft)` 之后追加：

```js
/**
 * 模型分组下拉选项：组 = 启用中的中转站，选项 = 该家已启用模型
 * option value 为复合键 `${providerId}::${modelId}`；
 * option label 带「· 中转站名」后缀用于触发器回显（spec 5.3），下拉里由 renderLabel 只显示模型名
 */
const modelGroups = computed(() =>
  providersStore.enabledProviders
    .filter((provider) => provider.enabledModels?.length)
    .map((provider) => ({
      type: 'group',
      label: provider.name,
      key: provider.id,
      color: provider.color || '',
      children: provider.enabledModels.map((model) => ({
        label: `${model.displayName || model.modelId} · ${provider.name}`,
        value: `${provider.id}::${model.modelId}`,
        modelLabel: model.displayName || model.modelId,
      })),
    })),
)

/**
 * 复合选中值 <-> draft.providerId + draft.model 双向拆合
 * 用 indexOf 而非 split：providerId 是 slug 不含 '::'，modelId 理论上可能含冒号
 */
const selectedModelKey = computed({
  get: () =>
    draft.value.providerId && draft.value.model
      ? `${draft.value.providerId}::${draft.value.model}`
      : null,
  set: (key) => {
    if (!key) return
    const separatorIndex = key.indexOf('::')
    draft.value.providerId = key.slice(0, separatorIndex)
    draft.value.model = key.slice(separatorIndex + 2)
  },
})

/**
 * 下拉项渲染：组标题前加中转站色块圆点，模型项只显示模型名
 * 下拉菜单 teleport 到 body，scoped 样式不生效——圆点样式全部内联
 */
function renderModelLabel(option) {
  if (option.type === 'group') {
    return [
      h('span', {
        style: {
          display: 'inline-block',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          marginRight: '6px',
          background: option.color || 'rgba(255, 255, 255, 0.35)',
        },
      }),
      option.label,
    ]
  }
  return option.modelLabel
}
```

⑥ 模板中整个 `model-chip` 块替换为：

```html
<div class="tool-chip model-chip">
  <ImageIcon :size="15" />
  <n-select
    v-if="modelGroups.length"
    v-model:value="selectedModelKey"
    :options="modelGroups"
    :render-label="renderModelLabel"
    class="tool-picker model-select"
    size="small"
    placeholder="选择模型"
    data-role="model-select"
  />
  <button
    v-else
    type="button"
    class="empty-model-btn"
    data-action="open-settings-empty"
    @click="chatStore.openSettings"
  >
    去设置添加模型
  </button>
</div>
```

⑦ 样式区追加（`.empty-model-btn` 放在 `.model-select` 规则之后即可）：

```scss
.empty-model-btn {
  border: none;
  background: transparent;
  color: rgba(119, 168, 255, 0.9);
  font-size: 13px;
  cursor: pointer;
  padding: 0 2px;
  white-space: nowrap;

  &:hover {
    text-decoration: underline;
  }
}
```

> 备注：旧草稿可能 `model` 有值但 `providerId` 为空（迁移前数据），此时 `selectedModelKey` 为 null、选择器显示 placeholder；后端对空 providerId 会回退默认中转站（Task 5 已实现），生成不受影响。

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test -- --run src/components/InputConsole.test.js`
Expected: PASS（7 旧 + 4 新 = 11）

---

## Task 11: 前端 — ChatArea / ImageMessageCard 联动 + 删除 SettingsDrawer

**Files:**

- Modify: `src/components/ImageMessageCard.vue`（meta 行加中转站名）
- Modify: `src/components/ImageMessageCard.test.js`（+2 用例）
- Modify: `src/components/ChatArea.vue`（SettingsDrawer → SettingsModal）
- Modify: `src/components/ChatArea.test.js`（stub 名替换）
- Delete: `src/components/SettingsDrawer.vue`

> 说明（spec 5.4）：消息卡片 meta 行显示「模型 · 中转站名」（读 `messages.meta_json`，即 `message.meta.providerName`）；全项目仅 ChatArea 引用 SettingsDrawer（已 grep 确认），替换为 Task 7 的 SettingsModal 后删除旧文件。设置入口（InputConsole 齿轮 / helper 按钮、ConnectionBadge 点击）都走 `chatStore.openSettings()`，只控制 `settingsVisible`，无需改动。

- [ ] **Step 1: ImageMessageCard.test.js 加失败用例**

`src/components/ImageMessageCard.test.js` describe 内追加：

```js
it('meta 含 providerName 时在模型名后展示中转站名', () => {
  const wrapper = mount(ImageMessageCard, {
    props: {
      message: {
        images: [{ id: '1', url: 'https://img.example.com/1.png' }],
        model: 'openai/gpt-image-2',
        size: '1024x1024',
        meta: { providerName: '硅基流动' },
      },
    },
  })

  expect(wrapper.get('[data-role="provider-name"]').text()).toBe('硅基流动')
})

it('meta 无 providerName 时不渲染中转站位（旧消息兼容）', () => {
  const wrapper = mount(ImageMessageCard, {
    props: {
      message: {
        images: [{ id: '1', url: 'https://img.example.com/1.png' }],
        model: 'openai/gpt-image-2',
        size: '1024x1024',
      },
    },
  })

  expect(wrapper.find('[data-role="provider-name"]').exists()).toBe(false)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- --run src/components/ImageMessageCard.test.js`
Expected: FAIL（第 1 个新用例找不到 `[data-role="provider-name"]`）

- [ ] **Step 3: 实现三处改动 + 删除旧文件**

① `src/components/ImageMessageCard.vue` 的 card-header 块替换为（在模型名后条件插入中转站名）：

```html
<div class="card-header">
  <span class="role-tag">AI</span>
  <span class="role-title">图像结果</span>
  <span class="meta-sep">·</span>
  <span class="meta-item">{{ message.model }}</span>
  <template v-if="message.meta?.providerName">
    <span class="meta-sep">·</span>
    <span class="meta-item" data-role="provider-name">{{ message.meta.providerName }}</span>
  </template>
  <span class="meta-sep">·</span>
  <span class="meta-item">{{ message.size }}</span>
</div>
```

② `src/components/ChatArea.vue` 两处替换：

import 行：

```js
import SettingsModal from './settings/SettingsModal.vue'
```

（替换 `import SettingsDrawer from './SettingsDrawer.vue'`）

模板尾部：

```html
<SettingsModal
  :show="chatStore.settingsVisible"
  @update:show="chatStore.settingsVisible = $event"
/>
```

（替换 `<SettingsDrawer ... />` 块）

③ `src/components/ChatArea.test.js` stubs 里的 `SettingsDrawer: true,` 替换为：

```js
          SettingsModal: true,
```

④ 删除文件 `src/components/SettingsDrawer.vue`（无对应测试文件，已确认）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test -- --run src/components/`
Expected: PASS（ImageMessageCard 2 旧 + 2 新、ChatArea 1、InputConsole 11，其余组件用例不回归）

---

## Task 12: 全量回归 + 手动验证

**Files:** 无（纯验证任务）

- [ ] **Step 1: 后端全量测试**

Run: `cd server && npm test`
Expected: PASS 全部（既有 46 + 新增 providersRepository / providerRoutes / keyRotation / generationRouting 等）

- [ ] **Step 2: 前端全量测试**

Run: `npm run test -- --run`
Expected: PASS 全部（既有 58 + 新增 providers store / SettingsModal / ProviderDetail / chat / InputConsole / ImageMessageCard 用例）

- [ ] **Step 3: 前端构建**

Run: `npm run build`
Expected: 构建成功无报错（确认 SettingsDrawer 删除后无残留引用）

- [ ] **Step 4: 手动验证清单**

启动 `npm run dev:db` + `npm run dev`（前后端），按序验证：

1. 首次启动后打开设置模态 → 左栏出现 seed 预设中转站（OpenRouter 等），旧 `.env` 的 Key 与 `app_settings.base_url` 已被吸收
2. 整家开关关闭 → 聊天输入框模型选择器中该家消失；开启 → 恢复
3. 「检测」→ 显示各 Key 可用数与延迟；「获取模型列表」→ 显示新增/自动启用统计，模型按组出现
4. 手动添加模型 + 单模型开关，聊天选择器实时反映
5. 聊天框选「模型 · 中转站」复合选项 → 发送 → 消息卡片 meta 行显示「模型 · 中转站名 · 尺寸」
6. 删除某家中转站（二次确认）→ 引用它的旧草稿重新打开时选择器回退 placeholder，发送仍走默认中转站（后端回退逻辑）
7. 全部停用所有中转站 → 输入框显示「去设置添加模型」与「去配置」，发送引导打开设置模态
