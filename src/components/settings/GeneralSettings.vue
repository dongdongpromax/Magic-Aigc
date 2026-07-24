<script setup>
import { NInput, NInputNumber } from 'naive-ui'
import { useChatStore } from '@/store/chat'

/**
 * 通用设置：仅放真正全局的连接配置
 *
 * 与「默认参数」面板拆分后，这里只保留所有模型共享的全局项：
 * - 后端地址、超时时间
 *
 * 图像/视频模型的默认生成参数已移至 DefaultParamsSettings。
 * 字段失焦即时保存（复用 chat store 的 saveSettings 链路）。
 */
const chatStore = useChatStore()

/** 失焦即时保存 */
async function handleBlur() {
  await chatStore.saveSettings()
}
</script>

<template>
  <div class="general-settings" data-role="general-settings">
    <!-- 连接配置：所有模型共享的后端连接与超时 -->
    <section class="config-section">
      <h3 class="section-title">连接</h3>
      <div class="field-grid">
        <div class="field field--full">
          <label>后端地址</label>
          <n-input
            v-model:value="chatStore.appConfig.baseURL"
            placeholder="http://127.0.0.1:4398"
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
      </div>
    </section>

    <p class="field-hint">修改失焦后自动保存</p>
  </div>
</template>

<style lang="scss" scoped>
.general-settings {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 分区：标题 + 字段网格 */
.config-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 分区标题：左侧色条 + 文字，干练业务感 */
.section-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
  padding-left: 8px;
  border-left: 2px solid rgba(99, 102, 241, 0.6);
  line-height: 1.2;
}

/* 字段网格：2 列紧凑排列，长字段（后端地址）跨满行 */
.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;

  label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.62);
  }
}

.field--full {
  grid-column: 1 / -1;
}

.field-hint {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}
</style>
