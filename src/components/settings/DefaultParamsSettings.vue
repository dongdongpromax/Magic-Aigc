<script setup>
import { NInputNumber, NSelect } from 'naive-ui'
import { useChatStore } from '@/store/chat'
import {
  videoRatioOptions,
  videoDurationOptions,
  videoResolutionOptions,
  videoRefModeOptions,
} from '@/config/videoOptions'

/**
 * 默认参数：按模型类型分区的默认生成参数
 *
 * 与「通用」面板拆分后，这里集中图像/视频模型的默认生成参数，
 * 让每类模型的专业配置各归其位：
 * - 图像模型：请求模式、默认尺寸、默认质量、默认张数
 * - 视频模型：默认比例、默认时长、默认清晰度、默认参考模式
 *
 * 注：应用当前仅支持图像 / 视频两类生成，文本 / 嵌入 / 语音模型
 * 在模型列表里有分类标签但无生成配置，故不单设分区。
 *
 * 字段失焦即时保存（复用 chat store 的 saveSettings 链路）。
 */
const chatStore = useChatStore()

const requestModeOptions = [
  { label: 'OpenRouter 图片模式', value: 'openrouter-image' },
  { label: '聊天封装模式', value: 'openai-chat' },
]

/** 图像默认尺寸选项（与 InputConsole sizeOptions 的 value 对齐） */
const imageSizeOptions = [
  { label: '自动', value: 'auto' },
  { label: '1024×1024', value: '1024x1024' },
  { label: '1536×1536', value: '1536x1536' },
  { label: '1536×864（16:9）', value: '1536x864' },
  { label: '864×1536（9:16）', value: '864x1536' },
  { label: '1536×1152（4:3）', value: '1536x1152' },
  { label: '1152×1536（3:4）', value: '1152x1536' },
]

/** 图像默认质量选项 */
const imageQualityOptions = [
  { label: '自动', value: 'auto' },
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' },
]

/** 失焦即时保存 */
async function handleBlur() {
  await chatStore.saveSettings()
}
</script>

<template>
  <div class="default-params-settings" data-role="default-params-settings">
    <!-- 图像模型默认配置 -->
    <section class="config-section">
      <h3 class="section-title">图像模型</h3>
      <div class="field-grid">
        <div class="field">
          <label>请求模式</label>
          <n-select
            v-model:value="chatStore.appConfig.requestMode"
            :options="requestModeOptions"
            @blur="handleBlur"
          />
        </div>
        <div class="field">
          <label>默认尺寸</label>
          <n-select
            v-model:value="chatStore.appConfig.defaultSize"
            :options="imageSizeOptions"
            @blur="handleBlur"
          />
        </div>
        <div class="field">
          <label>默认质量</label>
          <n-select
            v-model:value="chatStore.appConfig.defaultQuality"
            :options="imageQualityOptions"
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
      </div>
    </section>

    <!-- 视频模型默认配置 -->
    <section class="config-section">
      <h3 class="section-title">视频模型</h3>
      <div class="field-grid">
        <div class="field">
          <label>默认比例</label>
          <n-select
            v-model:value="chatStore.appConfig.defaultRatio"
            :options="videoRatioOptions"
            @blur="handleBlur"
          />
        </div>
        <div class="field">
          <label>默认时长</label>
          <n-select
            v-model:value="chatStore.appConfig.defaultDuration"
            :options="videoDurationOptions"
            @blur="handleBlur"
          />
        </div>
        <div class="field">
          <label>默认清晰度</label>
          <n-select
            v-model:value="chatStore.appConfig.defaultResolution"
            :options="videoResolutionOptions"
            @blur="handleBlur"
          />
        </div>
        <div class="field">
          <label>默认参考模式</label>
          <n-select
            v-model:value="chatStore.appConfig.defaultVideoRefMode"
            :options="videoRefModeOptions"
            @blur="handleBlur"
          />
        </div>
      </div>
    </section>

    <p class="field-hint">修改失焦后自动保存</p>
  </div>
</template>

<style lang="scss" scoped>
.default-params-settings {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 分区：标题 + 字段网格，区间用细分隔线建立层次 */
.config-section {
  display: flex;
  flex-direction: column;
  gap: 12px;

  & + .config-section {
    padding-top: 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
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

/* 字段网格：2 列紧凑排列 */
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

.field-hint {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}
</style>
