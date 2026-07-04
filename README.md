# ai-chat-draw

一个基于 Vue 3、Pinia、Naive UI 和 OpenAI 兼容中转站的 GPT Image-2 对话式图像工作台。

## 启动方式

1. 复制 `.env.example` 为 `.env.local`
2. 填写中转站 `baseURL` 和 `apiKey`
3. 安装依赖
4. 启动开发环境

```bash
cp .env.example .env.local
npm install
npm run dev
```

## 默认环境变量

```bash
VITE_OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
VITE_OPENROUTER_API_KEY=REMOVED_SECRET-...
VITE_OPENROUTER_MODEL=openai/gpt-image-2
VITE_OPENROUTER_MODE=openrouter-image
VITE_OPENROUTER_DEFAULT_SIZE=1024x1024
VITE_OPENROUTER_DEFAULT_QUALITY=high
VITE_OPENROUTER_DEFAULT_N=1
VITE_OPENROUTER_TIMEOUT=120000
```

## 测试

```bash
npm run test
```

## 图片自动保存

1. 启动前端：`npm run dev`
2. 启动本地写盘桥接：`node scripts/image-bridge.mjs`
3. 生成图片后，系统会：
   - 自动下载到浏览器默认下载目录
   - 尝试写入 `public/generated/`

如果桥接服务未启动，图片仍会正常显示和下载，但不会写入项目目录。

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
