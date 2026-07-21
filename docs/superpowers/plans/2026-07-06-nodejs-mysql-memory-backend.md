# Node.js 后台、Docker MySQL 与数据库记忆改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为当前 AI 图像工作台补齐 Node.js 后台、Docker MySQL 和数据库记忆链路，让前端不再依赖 `localStorage` 和直连 OpenRouter。

**Architecture:** 后台使用 `Express + mysql2 + multer + axios`，通过 `Docker Compose` 提供 `mysql` 与 `backend` 两个服务，图片继续落本地目录并通过静态路由暴露。前端保留现有 Vue 组件结构，只把远程数据状态和提交链路迁移到后台 API，移除聊天记忆的本地持久化主路径。

**Tech Stack:** Vue 3、JavaScript、Sass、Pinia、Naive UI、Node.js、Express、mysql2、multer、axios、Docker Compose、Vitest

---

## 文件结构

- 创建：`server/package.json`
  - 后台独立依赖与脚本。
- 创建：`server/Dockerfile`
  - 后台容器镜像。
- 创建：`docker-compose.yml`
  - `mysql` 与 `backend` 服务定义。
- 创建：`server/.env.example`
  - 后台环境变量模板。
- 创建：`server/sql/init.sql`
  - MySQL 初始化建表脚本。
- 创建：`server/src/config/env.js`
  - 后台环境变量读取与校验。
- 创建：`server/src/db/pool.js`
  - mysql2 连接池。
- 创建：`server/src/db/init.js`
  - 启动期数据库联通检查。
- 创建：`server/src/db/repositories/settingsRepository.js`
  - 设置表读写。
- 创建：`server/src/db/repositories/topicRepository.js`
  - 主题与消息读写。
- 创建：`server/src/db/repositories/draftRepository.js`
  - 草稿与参考图读写。
- 创建：`server/src/modules/settings/routes.js`
  - 设置 API。
- 创建：`server/src/modules/topics/routes.js`
  - 主题、消息、草稿 API。
- 创建：`server/src/modules/images/routes.js`
  - 参考图上传与图片生成 API。
- 创建：`server/src/modules/images/openrouterClient.js`
  - OpenRouter 请求代理。
- 创建：`server/src/modules/images/fileStorage.js`
  - 参考图与生成图本地写盘。
- 创建：`server/src/app.js`
  - Express 应用组装。
- 创建：`server/src/server.js`
  - 启动入口。
- 创建：`server/storage/references/.gitkeep`
  - 参考图目录占位。
- 创建：`server/storage/generated/.gitkeep`
  - 生成图目录占位。
- 创建：`server/src/test/server.test.js`
  - 后台健康检查与设置接口基础测试。
- 创建：`server/src/test/topicRoutes.test.js`
  - 主题、草稿、消息接口测试。
- 创建：`server/src/test/imageRoutes.test.js`
  - 上传与图片生成接口测试。
- 修改：`package.json`
  - 新增联调脚本。
- 修改：`vite.config.js`
  - 修正异常字符并配置 `/api`、`/files` 代理。
- 创建：`src/services/backendClient.js`
  - 前端统一请求实例。
- 创建：`src/services/settingsApi.js`
  - 设置 API 封装。
- 创建：`src/services/chatApi.js`
  - 主题、消息、草稿 API 封装。
- 创建：`src/services/uploadApi.js`
  - 参考图上传 API 封装。
- 修改：`src/services/imageSession.js`
  - 改为请求本地后台图片生成接口。
- 修改：`src/store/chat.js`
  - 从本地持久化 store 改成远程数据 store。
- 修改：`src/config/env.js`
  - 改为前端 API 基础地址配置。
- 修改：`src/components/SettingsDrawer.vue`
  - 移除前端 `API Key` 输入，仅保留数据库配置项。
- 修改：`src/components/InputConsole.vue`
  - 草稿更新与提交改为后台接口。
- 修改：`src/components/Sidebar.vue`
  - 主题列表改为后台数据。
- 修改：`src/components/ChatArea.vue`
  - 初始化与消息刷新改为后台接口。
- 修改：`src/components/ConnectionBadge.vue`
  - 展示后端/数据库可用状态。
- 修改：`src/utils/storage.js`
  - 降级为轻量 UI 偏好工具或删除。
- 修改：`src/store/chat.test.js`
  - 迁移为远程数据测试。
- 修改：`src/store/chat.references.test.js`
  - 移除 localStorage 假设，改测 API 驱动。
- 修改：`src/store/chat.preview.test.js`
  - 移除 localStorage 假设，改测后端返回数据。
- 创建：`src/services/chatApi.test.js`
  - 前端 API 封装测试。
- 创建：`src/services/settingsApi.test.js`
  - 设置 API 测试。
- 修改：`README.md`
  - 更新启动、Docker、后端和数据库说明。
- 修改：`.env.example`
  - 保留前端 API 地址类配置，不再放 OpenRouter 密钥。

## 任务切分原则

- 先搭后端和数据库骨架，再接结构化数据，再接图片链路，最后切前端。
- 每个任务都先写失败测试，再做最小实现。
- 每个任务结束后都能形成一个可运行、可验证的子里程碑。

### Task 1: 后台脚手架与 Docker 基础设施

**Files:**
- Create: `server/package.json`
- Create: `server/Dockerfile`
- Create: `docker-compose.yml`
- Create: `server/.env.example`
- Create: `server/sql/init.sql`
- Create: `server/src/config/env.js`
- Create: `server/src/db/pool.js`
- Create: `server/src/db/init.js`
- Create: `server/src/app.js`
- Create: `server/src/server.js`
- Create: `server/src/test/server.test.js`
- Modify: `package.json`

- [ ] **Step 1: 写失败测试，锁定后台健康检查与设置接口骨架**

```js
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app'

describe('server bootstrap', () => {
  it('提供健康检查接口', async () => {
    const app = createApp({
      settingsRepository: {
        getSettings: async () => ({
          baseURL: 'https://openrouter.ai/api/v1',
          defaultModel: 'openai/gpt-image-2',
          defaultSize: 'auto',
          defaultQuality: 'high',
          defaultN: 1,
          requestMode: 'openrouter-image',
          timeout: 120000,
        }),
      },
    })

    const response = await request(app).get('/api/health')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ ok: true })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd server && npm run test -- src/test/server.test.js`
Expected: FAIL，提示 `createApp` 或 `/api/health` 尚不存在

- [ ] **Step 3: 写最小后台骨架**

```json
{
  "name": "ai-chat-draw-server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch src/server.js",
    "start": "node src/server.js",
    "test": "vitest run"
  },
  "dependencies": {
    "axios": "^1.6.8",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "multer": "^1.4.5-lts.1",
    "mysql2": "^3.11.0"
  },
  "devDependencies": {
    "supertest": "^7.0.0",
    "vitest": "^3.2.4"
  }
}
```

```js
// server/src/app.js
import cors from 'cors'
import express from 'express'

export function createApp(deps = {}) {
  const app = express()

  app.use(cors())
  app.use(express.json({ limit: '10mb' }))
  app.get('/api/health', (_req, res) => res.json({ ok: true }))

  app.get('/api/settings', async (_req, res) => {
    const settings = await deps.settingsRepository.getSettings()
    res.json(settings)
  })

  return app
}
```

```js
// server/src/server.js
import { createApp } from './app.js'

const app = createApp({
  settingsRepository: {
    getSettings: async () => ({
      baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      defaultModel: 'openai/gpt-image-2',
      defaultSize: 'auto',
      defaultQuality: 'high',
      defaultN: 1,
      requestMode: 'openrouter-image',
      timeout: 120000,
    }),
  },
})

app.listen(process.env.PORT || 4398, () => {
  console.log(`backend listening on http://127.0.0.1:${process.env.PORT || 4398}`)
})
```

```yaml
# docker-compose.yml
services:
  mysql:
    image: mysql:8.4
    environment:
      MYSQL_DATABASE: ai_chat_draw
      MYSQL_ROOT_PASSWORD: root
    ports:
      - "3306:3306"
    volumes:
      - mysql-data:/var/lib/mysql
      - ./server/sql/init.sql:/docker-entrypoint-initdb.d/init.sql:ro

  backend:
    build:
      context: ./server
    env_file:
      - ./server/.env
    depends_on:
      - mysql
    ports:
      - "4398:4398"

volumes:
  mysql-data:
```

- [ ] **Step 4: 写最小建表与配置文件**

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  base_url VARCHAR(255) NOT NULL,
  default_model VARCHAR(120) NOT NULL,
  default_size VARCHAR(60) NOT NULL,
  default_quality VARCHAR(40) NOT NULL,
  default_n INT NOT NULL,
  request_mode VARCHAR(60) NOT NULL,
  timeout INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

```env
PORT=4398
MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_DATABASE=ai_chat_draw
MYSQL_USER=root
MYSQL_PASSWORD=root
OPENROUTER_API_KEY=replace_me
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd server && npm run test -- src/test/server.test.js`
Expected: PASS

- [ ] **Step 6: 本地启动基础设施做烟雾验证**

Run: `docker compose up -d mysql backend`
Expected: `mysql` 与 `backend` 容器都为 `healthy/running` 或 `running`

- [ ] **Step 7: 提交**

```bash
git add server/package.json server/Dockerfile server/.env.example server/sql/init.sql server/src docker-compose.yml package.json
git commit -m "feat: scaffold backend and docker services"
```

### Task 2: MySQL 仓储层与主题、草稿、设置 API

**Files:**
- Create: `server/src/db/repositories/settingsRepository.js`
- Create: `server/src/db/repositories/topicRepository.js`
- Create: `server/src/db/repositories/draftRepository.js`
- Create: `server/src/modules/settings/routes.js`
- Create: `server/src/modules/topics/routes.js`
- Create: `server/src/test/topicRoutes.test.js`
- Modify: `server/sql/init.sql`
- Modify: `server/src/app.js`

- [ ] **Step 1: 写失败测试，锁定主题、草稿和设置接口返回结构**

```js
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app'

describe('topic routes', () => {
  it('读取主题列表和草稿', async () => {
    const app = createApp({
      settingsRepository: {
        getSettings: async () => ({
          baseURL: 'https://openrouter.ai/api/v1',
          defaultModel: 'openai/gpt-image-2',
          defaultSize: 'auto',
          defaultQuality: 'high',
          defaultN: 1,
          requestMode: 'openrouter-image',
          timeout: 120000,
        }),
      },
      topicRepository: {
        listTopics: async () => [
          {
            id: 'topic-1',
            title: '本地主题',
            coverImage: null,
            lastPrompt: '赛博大厅',
            messageCount: 1,
            status: 'idle',
            updatedAt: 1,
            createdAt: 1,
          },
        ],
        listMessages: async () => [],
      },
      draftRepository: {
        getDraft: async () => ({
          topicId: 'topic-1',
          prompt: '',
          model: 'openai/gpt-image-2',
          size: 'auto',
          quality: 'high',
          n: 1,
          referenceImages: [],
        }),
      },
    })

    const topicsResponse = await request(app).get('/api/topics')
    const draftResponse = await request(app).get('/api/topics/topic-1/draft')

    expect(topicsResponse.status).toBe(200)
    expect(topicsResponse.body[0].title).toBe('本地主题')
    expect(draftResponse.status).toBe(200)
    expect(draftResponse.body.size).toBe('auto')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd server && npm run test -- src/test/topicRoutes.test.js`
Expected: FAIL，提示 `/api/topics` 或 `/api/topics/:topicId/draft` 尚不存在

- [ ] **Step 3: 扩展 SQL，加入主题、消息、草稿和参考图表**

```sql
CREATE TABLE IF NOT EXISTS topics (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  cover_image_path VARCHAR(255) NULL,
  last_prompt TEXT NULL,
  message_count INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'idle',
  updated_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(64) PRIMARY KEY,
  topic_id VARCHAR(64) NOT NULL,
  type VARCHAR(40) NOT NULL,
  role VARCHAR(20) NOT NULL,
  content TEXT NULL,
  prompt TEXT NULL,
  revised_prompt TEXT NULL,
  model VARCHAR(120) NULL,
  size VARCHAR(60) NULL,
  quality VARCHAR(40) NULL,
  n INT NULL,
  status VARCHAR(20) NULL,
  source_message_id VARCHAR(64) NULL,
  meta_json JSON NULL,
  created_at BIGINT NOT NULL,
  INDEX idx_messages_topic_created (topic_id, created_at)
);

CREATE TABLE IF NOT EXISTS drafts (
  topic_id VARCHAR(64) PRIMARY KEY,
  prompt TEXT NULL,
  model VARCHAR(120) NOT NULL,
  size VARCHAR(60) NOT NULL,
  quality VARCHAR(40) NOT NULL,
  n INT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS draft_reference_images (
  id VARCHAR(64) PRIMARY KEY,
  topic_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  source_message_id VARCHAR(64) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  INDEX idx_reference_topic_order (topic_id, sort_order)
);
```

- [ ] **Step 4: 写最小仓储与路由实现**

```js
// server/src/db/repositories/settingsRepository.js
export function createSettingsRepository(pool) {
  return {
    async getSettings() {
      const [rows] = await pool.query('SELECT * FROM app_settings ORDER BY id ASC LIMIT 1')
      const row = rows[0]
      return row
        ? {
            baseURL: row.base_url,
            defaultModel: row.default_model,
            defaultSize: row.default_size,
            defaultQuality: row.default_quality,
            defaultN: row.default_n,
            requestMode: row.request_mode,
            timeout: row.timeout,
          }
        : {
            baseURL: 'https://openrouter.ai/api/v1',
            defaultModel: 'openai/gpt-image-2',
            defaultSize: 'auto',
            defaultQuality: 'high',
            defaultN: 1,
            requestMode: 'openrouter-image',
            timeout: 120000,
          }
    },
  }
}
```

```js
// server/src/modules/topics/routes.js
import { Router } from 'express'

export function createTopicRoutes({ topicRepository, draftRepository }) {
  const router = Router()

  router.get('/topics', async (_req, res) => {
    res.json(await topicRepository.listTopics())
  })

  router.get('/topics/:topicId/messages', async (req, res) => {
    res.json(await topicRepository.listMessages(req.params.topicId))
  })

  router.get('/topics/:topicId/draft', async (req, res) => {
    res.json(await draftRepository.getDraft(req.params.topicId))
  })

  return router
}
```

```js
// server/src/app.js
import { createTopicRoutes } from './modules/topics/routes.js'

app.use('/api', createTopicRoutes({
  topicRepository: deps.topicRepository,
  draftRepository: deps.draftRepository,
}))
```

- [ ] **Step 5: 增加设置更新与主题创建接口**

```js
router.post('/topics', async (req, res) => {
  const topic = await topicRepository.createTopic(req.body.title || '新主题')
  res.status(201).json(topic)
})

router.put('/topics/:topicId/draft', async (req, res) => {
  const draft = await draftRepository.saveDraft(req.params.topicId, req.body)
  res.json(draft)
})
```

- [ ] **Step 6: 运行测试确认通过**

Run: `cd server && npm run test -- src/test/topicRoutes.test.js`
Expected: PASS

- [ ] **Step 7: 手工验证数据库读写**

Run: `curl http://127.0.0.1:4398/api/topics`
Expected: 返回 `[]` 或有效主题列表 JSON

- [ ] **Step 8: 提交**

```bash
git add server/sql/init.sql server/src/db/repositories server/src/modules/settings server/src/modules/topics server/src/test/topicRoutes.test.js server/src/app.js
git commit -m "feat: add mysql repositories and topic routes"
```

### Task 3: 图片上传、OpenRouter 代理与本地文件落盘

**Files:**
- Create: `server/src/modules/images/routes.js`
- Create: `server/src/modules/images/openrouterClient.js`
- Create: `server/src/modules/images/fileStorage.js`
- Create: `server/src/test/imageRoutes.test.js`
- Create: `server/storage/references/.gitkeep`
- Create: `server/storage/generated/.gitkeep`
- Modify: `server/sql/init.sql`
- Modify: `server/src/app.js`

- [ ] **Step 1: 写失败测试，锁定参考图上传和图片生成接口**

```js
import fs from 'node:fs/promises'
import path from 'node:path'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app'

describe('image routes', () => {
  it('上传参考图后返回文件路径', async () => {
    const app = createApp({
      imageService: {
        saveReferenceUpload: async () => ({
          id: 'ref-1',
          name: 'scene.png',
          filePath: '/files/references/scene.png',
          mimeType: 'image/png',
          sourceMessageId: null,
        }),
      },
    })

    const tempPath = path.resolve('src/test/temp-scene.png')
    await fs.writeFile(tempPath, 'fake')

    const response = await request(app)
      .post('/api/topics/topic-1/references')
      .attach('files', tempPath)

    expect(response.status).toBe(201)
    expect(response.body[0].filePath).toBe('/files/references/scene.png')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd server && npm run test -- src/test/imageRoutes.test.js`
Expected: FAIL，提示 `/api/topics/:topicId/references` 尚不存在

- [ ] **Step 3: 扩展 SQL，加入图片元数据表**

```sql
CREATE TABLE IF NOT EXISTS message_images (
  id VARCHAR(64) PRIMARY KEY,
  message_id VARCHAR(64) NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  width INT NULL,
  height INT NULL,
  saved_to_project TINYINT(1) NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL,
  INDEX idx_message_images_message (message_id)
);
```

- [ ] **Step 4: 写最小文件存储实现**

```js
// server/src/modules/images/fileStorage.js
import fs from 'node:fs/promises'
import path from 'node:path'

export function createFileStorage({ rootDir }) {
  const referencesDir = path.join(rootDir, 'references')
  const generatedDir = path.join(rootDir, 'generated')

  return {
    async ensureDirs() {
      await fs.mkdir(referencesDir, { recursive: true })
      await fs.mkdir(generatedDir, { recursive: true })
    },
    async writeReferenceFile(file) {
      const fileName = `${Date.now()}-${file.originalname}`
      const absolutePath = path.join(referencesDir, fileName)
      await fs.writeFile(absolutePath, file.buffer)
      return {
        fileName,
        filePath: `/files/references/${fileName}`,
      }
    },
    async writeGeneratedBase64(fileName, base64) {
      const absolutePath = path.join(generatedDir, fileName)
      await fs.writeFile(absolutePath, Buffer.from(base64, 'base64'))
      return `/files/generated/${fileName}`
    },
  }
}
```

- [ ] **Step 5: 写最小 OpenRouter 代理与图片路由**

```js
// server/src/modules/images/openrouterClient.js
import axios from 'axios'

export function createOpenRouterClient({ apiKey }) {
  return {
    async generateImages({ baseURL, payload, timeout }) {
      const response = await axios.post(`${baseURL}/images`, payload, {
        timeout,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      })

      return response.data
    },
  }
}
```

```js
// server/src/modules/images/routes.js
import multer from 'multer'
import { Router } from 'express'

const upload = multer({ storage: multer.memoryStorage() })

export function createImageRoutes({ imageService }) {
  const router = Router()

  router.post('/topics/:topicId/references', upload.array('files', 16), async (req, res) => {
    const items = await imageService.saveReferenceUpload(req.params.topicId, req.files || [])
    res.status(201).json(items)
  })

  router.post('/topics/:topicId/messages/image', async (req, res) => {
    const result = await imageService.generateImageMessage(req.params.topicId, req.body)
    res.status(201).json(result)
  })

  return router
}
```

- [ ] **Step 6: 后台挂载静态文件目录**

```js
// server/src/app.js
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const storageRoot = path.resolve(__dirname, '../storage')

app.use('/files', express.static(storageRoot))
```

- [ ] **Step 7: 运行测试确认通过**

Run: `cd server && npm run test -- src/test/imageRoutes.test.js`
Expected: PASS

- [ ] **Step 8: 手工验证上传与静态访问**

Run: `curl -F "files=@./public/favicon.ico" http://127.0.0.1:4398/api/topics/demo/references`
Expected: 返回 `/files/references/...`

- [ ] **Step 9: 提交**

```bash
git add server/src/modules/images server/src/test/imageRoutes.test.js server/storage server/sql/init.sql server/src/app.js
git commit -m "feat: add image upload proxy and file storage"
```

### Task 4: 前端 API 服务层与 Vite 代理

**Files:**
- Create: `src/services/backendClient.js`
- Create: `src/services/chatApi.js`
- Create: `src/services/settingsApi.js`
- Create: `src/services/uploadApi.js`
- Create: `src/services/chatApi.test.js`
- Create: `src/services/settingsApi.test.js`
- Modify: `src/config/env.js`
- Modify: `src/services/imageSession.js`
- Modify: `vite.config.js`
- Modify: `.env.example`

- [ ] **Step 1: 写失败测试，锁定前端通过本地后台地址发请求**

```js
import { describe, expect, it, vi } from 'vitest'

vi.mock('axios', () => {
  return {
    default: {
      create: vi.fn(() => ({
        get: vi.fn(async () => ({ data: [] })),
      })),
    },
  }
})

describe('chatApi', () => {
  it('从 /api/topics 拉主题列表', async () => {
    const { listTopics } = await import('./chatApi')
    const result = await listTopics()
    expect(result).toEqual([])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- src/services/chatApi.test.js src/services/settingsApi.test.js`
Expected: FAIL，提示模块不存在

- [ ] **Step 3: 写最小前端 API 封装**

```js
// src/services/backendClient.js
import axios from 'axios'
import { getDefaultAppConfig } from '@/config/env'

const config = getDefaultAppConfig()

export const backendClient = axios.create({
  baseURL: config.baseURL,
  timeout: config.timeout,
})
```

```js
// src/services/chatApi.js
import { backendClient } from './backendClient'

export async function listTopics() {
  const response = await backendClient.get('/api/topics')
  return response.data
}

export async function getDraft(topicId) {
  const response = await backendClient.get(`/api/topics/${topicId}/draft`)
  return response.data
}
```

```js
// src/services/settingsApi.js
import { backendClient } from './backendClient'

export async function getSettings() {
  const response = await backendClient.get('/api/settings')
  return response.data
}
```

- [ ] **Step 4: 修正前端环境配置和 Vite 代理**

```js
// src/config/env.js
export function getDefaultAppConfig() {
  return {
    baseURL: import.meta.env.VITE_BACKEND_BASE_URL || 'http://127.0.0.1:4398',
    apiKey: '',
    defaultModel: 'openai/gpt-image-2',
    requestMode: 'backend-proxy',
    defaultSize: 'auto',
    defaultQuality: 'high',
    defaultN: 1,
    timeout: 120000,
  }
}
```

```js
// vite.config.js
server: {
  port: 2222,
  proxy: {
    '/api': 'http://127.0.0.1:4398',
    '/files': 'http://127.0.0.1:4398',
  },
},
```

- [ ] **Step 5: 把 `imageSession.js` 切到后台图片生成接口**

```js
import { backendClient } from './backendClient'

export async function requestImages(topicId, payload) {
  const response = await backendClient.post(`/api/topics/${topicId}/messages/image`, payload)
  return response.data
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npm run test -- src/services/chatApi.test.js src/services/settingsApi.test.js src/services/imageSession.test.js`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src/services src/config/env.js vite.config.js .env.example
git commit -m "feat: add frontend backend client and proxy configuration"
```

### Task 5: 前端 store 迁移到数据库记忆

**Files:**
- Modify: `src/store/chat.js`
- Modify: `src/store/chat.test.js`
- Modify: `src/store/chat.references.test.js`
- Modify: `src/store/chat.preview.test.js`
- Modify: `src/components/Sidebar.vue`
- Modify: `src/components/ChatArea.vue`
- Modify: `src/components/InputConsole.vue`
- Modify: `src/components/SettingsDrawer.vue`
- Modify: `src/components/ConnectionBadge.vue`

- [ ] **Step 1: 写失败测试，锁定 store 不再直接依赖 localStorage**

```js
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/chatApi', () => ({
  listTopics: vi.fn(async () => [{ id: 'topic-1', title: '数据库主题' }]),
  getDraft: vi.fn(async () => ({
    topicId: 'topic-1',
    prompt: '',
    model: 'openai/gpt-image-2',
    size: 'auto',
    quality: 'high',
    n: 1,
    referenceImages: [],
  })),
}))

describe('chat store remote mode', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('初始化时从后台加载主题列表', async () => {
    const { useChatStore } = await import('./chat')
    const store = useChatStore()

    await store.bootstrap()

    expect(store.topics[0].title).toBe('数据库主题')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- src/store/chat.test.js src/store/chat.references.test.js src/store/chat.preview.test.js`
Expected: FAIL，提示 `bootstrap` 不存在或仍依赖 `localStorage`

- [ ] **Step 3: 写最小 store 迁移实现**

```js
import { defineStore } from 'pinia'
import { getDraft, listTopics } from '@/services/chatApi'
import { getSettings } from '@/services/settingsApi'

export const useChatStore = defineStore('chat', {
  state: () => ({
    appConfig: {
      baseURL: 'http://127.0.0.1:4398',
      apiKey: '',
      defaultModel: 'openai/gpt-image-2',
      requestMode: 'backend-proxy',
      defaultSize: 'auto',
      defaultQuality: 'high',
      defaultN: 1,
      timeout: 120000,
    },
    topics: [],
    messages: [],
    drafts: {},
    currentTopicId: '',
    settingsVisible: false,
    lastError: '',
    preview: {
      visible: false,
      title: '',
      model: '',
      size: '',
      images: [],
      activeIndex: 0,
    },
  }),
  actions: {
    async bootstrap() {
      this.appConfig = { ...this.appConfig, ...(await getSettings()) }
      this.topics = await listTopics()
      if (this.topics[0]) {
        this.currentTopicId = this.topics[0].id
        this.drafts[this.currentTopicId] = await getDraft(this.currentTopicId)
      }
    },
  },
})
```

- [ ] **Step 4: 把组件初始化和保存动作切到 store 新方法**

```js
// ChatArea.vue
onMounted(() => {
  chatStore.bootstrap()
})
```

```js
// SettingsDrawer.vue
async function handleSaveSettings() {
  await chatStore.saveSettings()
}
```

```js
// InputConsole.vue
await chatStore.saveDraft()
await chatStore.sendImageRequest()
```

- [ ] **Step 5: 删除聊天记忆的 localStorage 主链路**

```js
// src/store/chat.js
// 删除：
// import { loadPersistedState, savePersistedState } from '@/utils/storage'
// watch(() => ..., savePersistedState, ...)
```

```js
// src/utils/storage.js
export function loadUIPreferences() {
  return {}
}

export function saveUIPreferences() {}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npm run test -- src/store/chat.test.js src/store/chat.references.test.js src/store/chat.preview.test.js src/components/ChatArea.test.js`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src/store/chat.js src/store/*.test.js src/components/Sidebar.vue src/components/ChatArea.vue src/components/InputConsole.vue src/components/SettingsDrawer.vue src/components/ConnectionBadge.vue src/utils/storage.js
git commit -m "feat: migrate frontend store to backend persistence"
```

### Task 6: 文档收口与整体验证

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `server/.env.example`

- [ ] **Step 1: 更新 README，明确新的启动方式**

```md
## 启动方式

1. 复制后端环境变量：`cp server/.env.example server/.env`
2. 启动数据库和后台：`docker compose up -d mysql backend`
3. 安装前端依赖：`npm install`
4. 启动前端：`npm run dev`

## 数据持久化

- 主题、消息、草稿、设置保存在 MySQL
- 参考图保存在 `server/storage/references/`
- 生成图保存在 `server/storage/generated/`
- 前端不再使用 `localStorage` 保存聊天记忆
```

- [ ] **Step 2: 运行后台测试**

Run: `cd server && npm run test`
Expected: PASS

- [ ] **Step 3: 运行前端测试**

Run: `npm run test`
Expected: PASS

- [ ] **Step 4: 运行联调验证**

Run: `docker compose up -d mysql backend`
Expected: 后台和数据库启动成功

Run: `npm run dev`
Expected: 前端可正常访问，创建主题、上传参考图、生成图片、刷新恢复均正常

- [ ] **Step 5: 运行构建验证**

Run: `npm run build`
Expected: Build completed successfully

- [ ] **Step 6: 提交**

```bash
git add README.md .env.example server/.env.example
git commit -m "docs: document backend mysql memory workflow"
```

## 自检

### Spec 覆盖

- Node.js 后台与 Docker MySQL：Task 1
- MySQL 结构化记忆与设置、主题、草稿落库：Task 2
- 图片上传、生成图落盘与 OpenRouter 后台代理：Task 3
- 前端统一走后台 API 与 Vite 代理：Task 4
- 前端移除 `localStorage` 记忆主链路：Task 5
- 文档、构建与联调验证：Task 6

### 占位检查

- 已检查无 `TBD`、`TODO`、`类似 Task N` 等占位语句。
- 每个任务都给出了明确文件、测试命令和预期结果。
- 每个实现步骤都落到了具体代码骨架和接口名。

### 类型一致性

- 后台设置字段统一使用 `baseURL / defaultModel / defaultSize / defaultQuality / defaultN / requestMode / timeout`
- 后台图片元数据统一使用 `filePath / fileName / mimeType / savedToProject`
- 前端远程状态统一围绕 `topics / messages / drafts / appConfig`
- 图片生成主接口统一使用 `POST /api/topics/:topicId/messages/image`
