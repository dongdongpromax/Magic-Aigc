# Node.js 后台、Docker MySQL 与数据库记忆改造设计文档

## 1. 目标

在现有 Vue 3 图像工作台基础上，引入单用户本地版 Node.js 后台和 MySQL 数据库，把当前前端 `Pinia + localStorage` 的记忆链路升级为“前端只负责交互，后端负责模型代理、文件落盘和数据库持久化”的完整架构。

本次设计目标如下：

- 前端不再把聊天记忆、草稿和连接配置存入 `localStorage`。
- 新增 Node.js 后台，作为前端唯一数据入口。
- 新增 MySQL，并通过 Docker Compose 启动。
- 前端不再直连 OpenRouter，由后台代理图片生成请求。
- 图片文件继续落本地目录，数据库只存结构化元数据和路径。
- `API Key` 只存服务端环境变量，不写入数据库，不暴露到前端。

## 2. 范围

### 2.1 必须完成

- Node.js 后台基础服务。
- Docker Compose 中的 MySQL 服务。
- 后台到 MySQL 的连接池与初始化建表。
- 主题、消息、草稿、配置的数据库持久化。
- 前端将主题、消息、草稿、设置改为通过后台 API 读写。
- 图片生成改为前端请求后台，后台再代理 OpenRouter。
- 参考图上传与生成图结果落本地目录。
- 前端移除聊天记忆的 `localStorage` 主链路。

### 2.2 建议完成

- 后台静态托管参考图和生成图目录。
- 启动脚本和 README 一键化说明。
- 数据库初始化脚本与目录结构清晰分层。
- 前端远程状态和本地 UI 状态解耦。

### 2.3 暂不纳入

- 多用户体系。
- 注册、登录、权限控制。
- 云端对象存储。
- 任务队列、异步 worker。
- 数据库中保存图片二进制。
- 服务端缓存、全文检索、向量检索。

## 3. 产品定位

本次不是简单“给前端加个接口”，而是把当前项目从前端演示型工作台升级为具备实际后端支撑的单用户本地创作系统。

定位原则如下：

- UI 保持现在的中文赛博工作台风格，不做大幅重写。
- 前端只做显示、编辑、状态反馈和用户动作收集。
- 后台统一管理模型请求、文件写入、数据库持久化。
- 数据库存结构化记忆，文件系统存图片资产。

## 4. 最终方案

采用“Vue 前端 + Node.js 后台 + Docker MySQL + 本地文件目录”的单后端代理方案。

### 4.1 前端

前端保留现有技术栈：

- Vue 3
- JavaScript
- Sass
- Pinia
- Naive UI

前端职责调整为：

- 拉取主题、消息、草稿和设置。
- 提交草稿更新、参考图上传和图片生成请求。
- 渲染聊天流、图片卡片、设置抽屉和输入控制台。
- 管理非持久化的本地 UI 状态。

### 4.2 后台

后台采用 Node.js，建议使用：

- Express
- mysql2
- multer
- axios

后台职责如下：

- 读取服务端环境变量。
- 连接 MySQL。
- 提供主题、消息、草稿和设置 API。
- 接收参考图上传并写入本地目录。
- 代理 OpenRouter 图片生成请求。
- 把生成图写入本地目录并持久化消息关系。

### 4.3 数据层

MySQL 运行在 Docker 中，只保存结构化数据：

- 全局设置
- 主题
- 消息
- 草稿
- 草稿参考图
- 消息图片元数据

图片文件本身不写数据库。

### 4.4 文件层

文件系统保存两类资产：

- 用户上传参考图
- 模型返回生成图

后台对这两个目录提供静态访问能力，让前端直接使用文件 URL 展示和预览。

## 5. 总体架构

### 5.1 请求链路

用户发起一次图像生成时，完整链路如下：

1. 前端更新当前草稿。
2. 前端调用后台生成接口。
3. 后台读取当前主题草稿和参考图路径。
4. 后台把参考图转换为可发送给 OpenRouter 的输入。
5. 后台代理请求 OpenRouter 图片接口。
6. 后台将返回的 base64 图片写入本地生成目录。
7. 后台写入消息主表和消息图片表。
8. 后台返回结构化消息给前端。
9. 前端更新消息流和主题列表。

### 5.2 持久化边界

以下数据进入 MySQL：

- `topics`
- `messages`
- `drafts`
- `draft_reference_images`
- `message_images`
- `app_settings`

以下数据不进入 MySQL：

- `API Key`
- 图片 base64 正文
- 临时 blob URL
- 前端弹层显隐状态
- 前端本地 hover / loading 细粒度视觉状态

## 6. 数据结构设计

### 6.1 app_settings

存储单用户全局配置。

建议字段如下：

- `id`
- `base_url`
- `default_model`
- `default_size`
- `default_quality`
- `default_n`
- `request_mode`
- `timeout`
- `created_at`
- `updated_at`

约束如下：

- 只保留一条有效配置记录。
- 不保存 `api_key`。

### 6.2 topics

存储会话主题。

建议字段如下：

- `id`
- `title`
- `cover_image_path`
- `last_prompt`
- `message_count`
- `status`
- `updated_at`
- `created_at`

### 6.3 messages

存储消息主表。

建议字段如下：

- `id`
- `topic_id`
- `type`
- `role`
- `content`
- `prompt`
- `revised_prompt`
- `model`
- `size`
- `quality`
- `n`
- `status`
- `source_message_id`
- `meta_json`
- `created_at`

消息类型沿用现有强类型设计：

- `user_prompt`
- `assistant_images`
- `assistant_text`
- `system_status`

### 6.4 message_images

存储图片消息下挂的图片元数据。

建议字段如下：

- `id`
- `message_id`
- `file_path`
- `file_name`
- `mime_type`
- `width`
- `height`
- `saved_to_project`
- `created_at`

说明如下：

- `file_path` 为前端可访问的静态路径。
- 不保存 `data:` URL 和 `b64`。

### 6.5 drafts

存储每个主题的当前草稿。

建议字段如下：

- `topic_id`
- `prompt`
- `model`
- `size`
- `quality`
- `n`
- `updated_at`

### 6.6 draft_reference_images

存储草稿参考图。

建议字段如下：

- `id`
- `topic_id`
- `name`
- `mime_type`
- `file_path`
- `source_message_id`
- `sort_order`
- `created_at`

说明如下：

- 对于本地上传图，`file_path` 指向参考图目录文件。
- 对于历史生成图，`file_path` 指向已生成图片路径。

## 7. 文件目录设计

建议新增以下目录：

- `server/`
- `server/src/`
- `server/src/config/`
- `server/src/db/`
- `server/src/modules/settings/`
- `server/src/modules/topics/`
- `server/src/modules/messages/`
- `server/src/modules/drafts/`
- `server/src/modules/images/`
- `server/src/middleware/`
- `server/src/utils/`
- `server/sql/`
- `server/storage/references/`
- `server/storage/generated/`

### 7.1 后台入口

建议入口文件如下：

- `server/src/app.js`
- `server/src/server.js`

### 7.2 数据库层

建议拆为：

- `db/pool.js`
- `db/init.js`
- `db/repositories/*.js`

### 7.3 模块层

建议按业务拆分：

- `settings`
- `topics`
- `drafts`
- `images`

避免把所有逻辑堆进一个超长 `server.js`。

## 8. API 设计

### 8.1 设置接口

- `GET /api/settings`
  - 返回当前全局设置
- `PUT /api/settings`
  - 更新 `baseURL`、默认模型、默认尺寸、默认质量、默认张数、超时、请求模式

说明：

- `API Key` 不在此接口中暴露或保存。

### 8.2 主题接口

- `GET /api/topics`
  - 返回主题列表
- `POST /api/topics`
  - 新建主题
- `PATCH /api/topics/:topicId`
  - 更新主题名
- `DELETE /api/topics/:topicId`
  - 删除主题及关联数据

### 8.3 消息接口

- `GET /api/topics/:topicId/messages`
  - 返回指定主题的消息流

### 8.4 草稿接口

- `GET /api/topics/:topicId/draft`
  - 返回当前主题草稿
- `PUT /api/topics/:topicId/draft`
  - 更新提示词、模型、尺寸、质量、张数

### 8.5 参考图接口

- `POST /api/topics/:topicId/references`
  - 上传参考图文件并加入草稿
- `DELETE /api/topics/:topicId/references/:id`
  - 删除某张参考图

### 8.6 图像生成接口

- `POST /api/topics/:topicId/messages/image`
  - 发起一次图像生成

接口职责如下：

- 写入用户提示词消息
- 读取当前草稿和参考图
- 请求 OpenRouter
- 保存生成图到本地目录
- 写入图片消息及图片元数据
- 更新主题封面、最后提示词和状态
- 返回完整新增消息

### 8.7 静态文件接口

- `GET /files/generated/*`
- `GET /files/references/*`

用于图片展示、预览和下载。

## 9. OpenRouter 代理设计

### 9.1 代理原则

- 前端不再持有 OpenRouter `API Key`
- 前端不再直连 OpenRouter
- 后台统一代理图片生成请求

### 9.2 配置来源

后台从 `.env` 读取：

- `OPENROUTER_API_KEY`
- 可选 `OPENROUTER_DEFAULT_BASE_URL`

数据库保存的是单用户工作台设置：

- `base_url`
- `default_model`
- `default_size`
- `default_quality`
- `default_n`
- `request_mode`
- `timeout`

优先级如下：

- 后台 `.env` 负责敏感值
- 数据库负责业务默认值

### 9.3 参考图处理

后台在发起 OpenRouter 请求前，把参考图转成模型可接受格式。

规则如下：

- 本地上传参考图：读取文件并编码为 data URL 或 base64
- 历史生成图：直接读取已落盘文件并编码
- 不让前端再维护 `dataUrl` 持久化

## 10. 前端改造设计

### 10.1 store 改造方向

当前 `src/store/chat.js` 是“业务状态 + 本地持久化”耦合结构。

迁移后改为：

- 远程数据状态：
  - `topics`
  - `messages`
  - `drafts`
  - `settings`
- 本地 UI 状态：
  - 当前弹层显隐
  - 上传中状态
  - 发送中状态
  - 全屏输入态
  - 图片预览显隐

### 10.2 services 改造方向

建议新增前端服务层：

- `src/services/chatApi.js`
- `src/services/settingsApi.js`
- `src/services/uploadApi.js`

现有模块改造如下：

- `src/services/imageSession.js`
  - 从“直连 OpenRouter”改为“请求本地后台生成接口”
- `src/utils/storage.js`
  - 不再负责聊天记忆主链路
- `src/config/env.js`
  - 前端只保留本地 API 地址等非敏感配置

### 10.3 前端保留原则

- 现有页面组件尽量复用
- 不重做整套 UI
- 只替换数据来源和提交链路

## 11. Docker 设计

### 11.1 运行方式

采用 Docker Compose 统一启动：

- `mysql`
- `backend`

前端开发期可继续本机 `vite` 运行。

### 11.2 docker-compose 服务

#### mysql

- 使用官方 MySQL 镜像
- 映射端口
- 挂载持久卷
- 通过初始化 SQL 创建库表

#### backend

- 基于 Node.js 镜像
- 挂载 `server/`
- 依赖 `mysql`
- 读取服务端 `.env`
- 暴露 API 端口

### 11.3 开发联调

Vite 开发服务器通过代理把 `/api` 和 `/files` 转发到 Node.js 后台。

## 12. 错误处理设计

### 12.1 数据库异常

- 后台返回统一错误格式
- 前端在消息流或设置区显示明确错误
- 不把数据库堆栈直接暴露给用户

### 12.2 OpenRouter 请求失败

- 后台归一化错误响应
- 前端继续沿用现有消息流错误展示方式

### 12.3 文件写入失败

- 参考图上传失败时不写数据库记录
- 生成图保存失败时，本次消息标记失败并返回可读错误

### 12.4 容器未启动

- 前端应显示“后台不可用”或“数据库连接失败”的明确提示

## 13. 迁移策略

### 13.1 第一阶段

- 搭建 `server/` 后台
- 接入 Docker MySQL
- 完成建表与基础健康检查

### 13.2 第二阶段

- 实现主题、消息、草稿、设置 API
- 前端切主题列表和消息读取到后台

### 13.3 第三阶段

- 实现参考图上传和文件静态服务
- 前端切草稿和参考图链路到后台

### 13.4 第四阶段

- 实现 OpenRouter 后台代理
- 前端切图像生成请求到后台

### 13.5 第五阶段

- 删除聊天记忆的 `localStorage` 主链路
- 收口文档、环境变量、README 和 Docker 启动说明

## 14. 测试策略

至少覆盖以下层面：

### 14.1 后台单元测试

- 设置仓储读写
- 主题仓储读写
- 草稿和参考图仓储读写
- 图片生成结果持久化

### 14.2 后台接口测试

- 主题列表读取
- 草稿更新
- 参考图上传
- 图像生成代理成功与失败

### 14.3 前端测试

- store 从后台读取初始主题和消息
- 设置抽屉保存后刷新仍能恢复
- 上传参考图和删除参考图接口联动
- 图像生成成功后消息流更新

### 14.4 联调验证

- `docker compose up` 后数据库和后台正常启动
- 前端可通过代理访问后台
- 生成图文件可被静态访问

## 15. 验收标准

本次改造完成后，应满足以下标准：

- 刷新页面后，主题、消息、草稿和设置均从 MySQL 恢复。
- 前端不再依赖 `localStorage` 保存聊天记忆。
- 前端不再直接请求 OpenRouter。
- 生成图和参考图均能通过后台保存并访问。
- 数据库中可看到主题、消息、草稿和图片元数据。
- `API Key` 不出现在前端代码、前端环境变量和数据库中。
- Docker Compose 能稳定启动 MySQL 和后台。

## 16. 风险与约束

- 现有前端测试大量围绕 `localStorage`，迁移后需要整体更新。
- 当前 `vite.config.js` 存在异常字符，必须在接入代理前修正。
- 单用户本地版不做用户隔离，因此数据库表结构无需预留复杂权限字段。
- 若未来改成多用户体系，需要在几乎所有表中补充 `user_id` 维度。

## 17. 最终结论

本项目应从当前“前端直连模型 + 本地浏览器记忆”的形态，升级为“Vue 前端 + Node.js 单后端代理 + Docker MySQL + 本地图片目录”的完整单用户本地版架构。

核心落点如下：

- 前端只连后台
- 后台代理 OpenRouter
- MySQL 存结构化记忆和配置
- 文件系统存图片
- `API Key` 只在服务端环境变量中存在

这是当前项目从可用 Demo 走向可持续扩展工作台的正确架构边界。
