# ai-chat-draw

一个基于 Vue 3、Node.js、MySQL、Docker Compose 和 Naive UI 的 GPT Image-2 对话式图像工作台。

## ⚠️ 安全提示

历史 commit 中曾包含已泄露的 OpenRouter API key（`REMOVED_SECRET-e05e...`）。**部署前必须**：

1. 到 [OpenRouter 控制台](https://openrouter.ai/keys) 撤销该 key
2. 签发新 key 并写入 `server/.env` 的 `OPENROUTER_API_KEY`
3. 确认 `server/.env` 已被 `.gitignore` 忽略（本次已修复）

## 启动方式

1. 安装前端依赖与后端依赖
2. 复制前端和后端环境变量
3. 启动 Docker Compose 中的 `mysql` 和 `backend`
4. 启动前端开发服务器

```bash
cp .env.example .env.local
cp server/.env.example server/.env
npm install
cd server && npm install && cd ..
docker compose up -d mysql backend
npm run dev
```

## 默认环境变量

前端 `.env.local`

```bash
VITE_BACKEND_BASE_URL=http://127.0.0.1:4398
VITE_BACKEND_TIMEOUT=120000
# 可选：本地图片桥接服务地址。仅在需要把生成图额外保存到项目本地目录时配置；
# 默认为空（不启用）。后端 generateImageMessage 已统一把图片写入 server/storage/。
VITE_LOCAL_BRIDGE_URL=
```

后端 `server/.env`

```bash
PORT=4398
MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_DATABASE=ai_chat_draw
MYSQL_USER=root
MYSQL_PASSWORD=root
OPENROUTER_API_KEY=replace_me
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
# 可选：CORS 白名单，逗号分隔多个 origin；默认 * 允许所有来源
CORS_ORIGIN=
```

## 测试

```bash
npm run test
cd server && npm run test
```

## 记忆存储

- 聊天主题、消息、草稿和连接配置不再写入 `localStorage`
- 当前会话记忆统一存入 Docker 中的 MySQL
- 前端仅保留弹层显隐、加载态等轻量 UI 状态
- 参考图通过 `draft_reference_images` 表持久化，「设为参考图」复用 `message_images.file_path`，不复制文件
- 删除主题会事务级联清理 `topics` / `messages` / `message_images` / `drafts` / `draft_reference_images` 5 张表，并 best-effort 清理磁盘文件

## 图片文件

- 参考图上传后写入 `server/storage/references/`
- 生成图由后端统一落到 `server/storage/generated/`
- 数据库只保存图片元数据和文件路径，不直接存二进制
- 生成结果仍会触发浏览器下载
- 上传限制：单文件最大 10MB，最多 16 张，仅支持 `png` / `jpeg` / `webp`

## 图生图参考图

- 输入区底栏支持上传参考图，直接进入图生图链路
- 最多上传 `16` 张参考图
- 支持 `png`、`jpg`、`jpeg`、`webp`
- 历史生成图可通过「设为参考图」回填到当前输入区（后端持久化，刷新不丢失）
- 生成结果点击后使用 Naive UI 原生图片预览，不再走自定义弹层

## 健康检查

后端提供 `GET /api/health`：

- 成功返回 `200 { ok: true, db: 'up' }`
- DB 不可达返回 `503 { ok: false, db: 'down' }`

## 构建

```bash
npm run build
```
