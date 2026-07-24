# 聊天输入框重构：参数收纳到弹出面板

## 背景

当前 InputConsole 工具栏把所有参数控件平铺在一行 flex-wrap 容器里：

- **图像模式**：模型选择器(188px) + 尺寸触发器(172px) + 张数(132px) + 上传(~100px) + 状态(~100px) + 发送(36px) ≈ **728px**
- **视频模式**：模型选择器(188px) + 比例(132px) + 时长(132px) + 清晰度(92px) + 上传(~100px) + 状态(~100px) + 发送(36px) ≈ **780px**

ChatArea 容器最大宽度 1040px，但减去侧栏(288px)和内边距后实际可用宽度经常不足 750px。宽度不够时工具栏换行，发送按钮掉到第二行，视觉割裂。

## 方案：参数收纳到弹出面板

将模型相关参数（图像的尺寸/张数，视频的比例/时长/清晰度）从工具栏移入一个「参数」按钮触发的弹出面板。工具栏精简为 4 个元素，无论参数多少都不换行：

```
┌────────────────────────────────────────────────────┐
│ [参考图缩略条（如有）]                                │
├────────────────────────────────────────────────────┤
│ [⚙] [textarea......................................] │
├────────────────────────────────────────────────────┤
│ [🖼 模型 ▾] [⚙ 16:9·5秒·720p ▾] [📎 参考图]  [➤]  │
└────────────────────────────────────────────────────┘
```

点击「参数」按钮时，面板从按钮上方弹出：

**图像模式面板**：
```
┌──────────────────────────────────┐
│  自动  方图  横图  超宽  竖图      │
│  □    □    ▢    ▭    ▯          │
│  auto 1:1  4:3  21:9 9:16       │
│  张数 [1 ▾]                      │
└──────────────────────────────────┘
```

**视频模式面板**：
```
┌──────────────────────────────────┐
│  比例 [16:9 ▾]  时长 [5秒 ▾]     │
│  清晰度 [720p ▾]                 │
└──────────────────────────────────┘
```

### 关键设计点

1. **参数按钮显示摘要文案**：按钮上直接展示当前参数值（如 `16:9 · 5秒 · 720p`），无需点开就能看到当前设置
2. **复用现有尺寸网格**：图像模式的尺寸网格面板（`size-grid-panel`）直接移入弹出面板内部，保留 `data-action="open-size-grid"` 和 `data-panel="size-grid"` 等 data 属性
3. **点击外部/Escape 关闭**：复用现有的 `handleWindowKeydown` Escape 监听 + 新增 click-outside 逻辑
4. **移除「已连接」状态按钮**：工具栏右侧只保留发送按钮，连接状态信息整合到设置按钮的 tooltip 或移除（设置入口已在输入区左上角）
5. **样式微调**：圆角从 16px/999px 收窄到 12px/8px，更干练

## 修改文件

### 1. `src/components/InputConsole.vue`（核心改动）

**Script 部分：**
- 新增 `isParamPanelVisible` ref（替代 `isSizePanelVisible`，控制统一参数面板）
- 新增 `paramSummary` computed：根据 isVideoModel 返回摘要文案
  - 图像：`selectedSizeLabel + ' · ' + draft.n + '张'`
  - 视频：`draft.ratio + ' · ' + draft.duration + '秒' + ' · ' + draft.resolution`
- 新增 `closeParamPanel` 函数（Escape + click-outside 共用）
- 修改 `handleWindowKeydown`：Escape 关闭参数面板
- 新增 `onDocumentClick` 闭包：点击面板外部时关闭

**Template 部分：**
- 工具栏 `.left-tools` 精简为：模型选择器 + 参数按钮 + 上传按钮
- 参数按钮：`<button data-action="open-params" @click="toggleParamPanel">` 显示 `paramSummary`
- 参数面板 `data-panel="params"`：根据 isVideoModel 条件渲染图像或视频参数控件
  - 图像分支：复用现有 `size-grid-panel` 内部结构 + 张数选择器
  - 视频分支：比例 + 时长 + 清晰度三个 n-select
- 移除 `.right-tools` 中的「已连接/去配置」按钮，只保留发送按钮

**Style 部分：**
- `.input-console` 圆角 16px → 12px
- `.tool-chip` 圆角 10px → 8px
- 按钮圆角 999px → 8px（发送按钮保持 8px）
- 新增 `.param-panel` 样式（弹出面板，复用 size-grid-panel 视觉风格）
- 新增 `.param-summary` 样式（参数按钮摘要文案）

### 2. `src/components/InputConsole.test.js`（测试更新）

- 测试「点击尺寸触发器后显示网格弹层」：改为先点击 `data-action="open-params"` 打开参数面板，再验证 `data-panel="size-grid"` 存在
- 测试 `findAllComponents(NSelect)` 数量：面板默认关闭时只有模型选择器 1 个；打开后增加张数/比例等
- 新增测试：参数按钮显示摘要文案、视频模式下面板内容切换

### 3. `src/components/ChatArea.vue`（移除连接状态引用）

- 如果 ChatArea 中有引用 InputConsole 的事件或属性，确认无需修改

## 不变的部分

- 模型选择器逻辑（`modelGroups`、`selectedModelKey`、`renderModelLabel`）不变
- 参考图上传逻辑（`uploadReferenceFiles`、`handlePaste`）不变
- 发送逻辑（`handleSend`）不变
- 草稿状态管理（`chat.js`）不变
- 尺寸选项数据结构（`sizeOptions`、`sizeGroups`）不变
- 视频参数选项（`videoRatioOptions`、`videoDurationOptions`、`videoResolutionOptions`）不变

## 验证

1. `npx vitest run src/components/InputConsole.test.js` — 确认测试通过
2. `npx vitest run` — 全量测试无回归
3. 浏览器手动验证：
   - 图像模式：工具栏只有 模型 + 参数 + 参考图 + 发送 4 个元素
   - 视频模式：参数按钮显示「16:9 · 5秒 · 720p」摘要
   - 点击参数按钮弹出面板，图像模式显示尺寸网格 + 张数，视频模式显示比例/时长/清晰度
   - 点击外部或按 Escape 关闭面板
   - 窗口缩小时工具栏不换行
