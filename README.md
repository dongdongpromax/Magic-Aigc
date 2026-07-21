# ai-chat-draw

一个基于 Vue 3、Node.js、MySQL、Docker Compose 和 Naive UI 的 GPT Image-2 对话式图像工作台。

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

## 图片文件

- 参考图上传后写入 `server/storage/references/`
- 生成图由后端统一落到 `server/storage/generated/`
- 数据库只保存图片元数据和文件路径，不直接存二进制
- 生成结果仍会触发浏览器下载

## 图生图参考图

- 输入区底栏支持上传参考图，直接进入图生图链路
- 最多上传 `16` 张参考图
- 支持 `png`、`jpg`、`jpeg`、`webp`
- 历史生成图可通过“设为参考图”回填到当前输入区
- 生成结果点击后使用 Naive UI 原生图片预览，不再走自定义弹层

## 构建

```bash
npm run build
```
