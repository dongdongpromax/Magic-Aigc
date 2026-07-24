<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore } from '@/store/chat'
import { Plus, Search, Image as ImageIcon, Aperture, Trash2, ScrollText } from 'lucide-vue-next'
import ConfirmDialog from './ConfirmDialog.vue'

const chatStore = useChatStore()
const route = useRoute()
const router = useRouter()
const keyword = ref('')

// 当前是否处于使用日志页，用于高亮侧栏入口
const isLogsRoute = computed(() => route.path.startsWith('/logs'))
// 正在删除的主题 ID，用于禁用对应按钮防重复点击
const deletingTopicId = ref('')
// 删除二次确认弹窗状态（替代原生 window.confirm，确保确认动作可见可靠）
const deleteConfirm = reactive({ show: false, topicId: '', title: '' })

const filteredTopics = computed(() => {
  const search = keyword.value.trim().toLowerCase()
  if (!search) return chatStore.topics

  return chatStore.topics.filter((topic) => topic.title.toLowerCase().includes(search))
})

const handleNewTopic = () => {
  chatStore.createTopic('新建创作')
}

/**
 * 跳转到使用日志页
 */
const goToLogs = () => {
  router.push('/logs')
}

const handleSelectTopic = (topicId) => {
  chatStore.selectTopic(topicId)
}

/**
 * 判断封面是否为视频文件
 *
 * 视频生成消息的封面是 .mp4 路径，<img> 无法渲染会裂图，
 * 改用 <video> 取首帧作缩略图。
 * @param {string} url 封面路径
 * @returns {boolean}
 */
function isVideoCover(url) {
  return /\.(mp4|webm|mov|m4v)$/i.test(url || '')
}

/**
 * P0-8: 删除主题
 *
 * 点击删除按钮只打开二次确认弹窗，不直接删除（防止误删）。
 * 确认后由 handleConfirmDelete 调 chatStore.deleteTopic，后端事务级联清理 5 表 + 文件。
 *
 * @param {Event} event 点击事件（用于 stopPropagation 防止触发选中）
 * @param {string} topicId 主题 ID
 */
const handleDeleteTopic = (event, topicId) => {
  // 阻止冒泡，避免触发 topic-item 的 selectTopic
  event?.stopPropagation()

  const topic = chatStore.topics.find((t) => t.id === topicId)
  deleteConfirm.topicId = topicId
  deleteConfirm.title = topic?.title || '该主题'
  deleteConfirm.show = true
}

/**
 * 确认删除：执行事务级联清理
 */
const handleConfirmDelete = async () => {
  const topicId = deleteConfirm.topicId
  deleteConfirm.show = false
  // 防重复点击
  if (!topicId || deletingTopicId.value) return
  deletingTopicId.value = topicId

  try {
    await chatStore.deleteTopic(topicId)
  } catch (err) {
    // 删除失败时通过 store 的 lastError 显示
    chatStore.lastError = `删除主题失败：${err?.message || ''}`
  } finally {
    deletingTopicId.value = ''
  }
}
</script>

<template>
  <div class="sidebar">
    <div class="sidebar-header">
      <div class="brand">
        <div class="brand-icon">
          <Aperture :size="18" />
        </div>
        <div class="brand-copy">
          <span class="brand-title">创作工坊</span>
          <span class="brand-subtitle">图像 · 视频 对话创作</span>
        </div>
      </div>

      <button class="action-btn" type="button" @click="handleNewTopic">
        <Plus :size="16" />
        <span>新建创作</span>
      </button>

      <label class="search-box">
        <Search :size="16" class="search-icon" />
        <input v-model="keyword" type="text" placeholder="搜索主题" />
      </label>
    </div>

    <div class="topic-list">
      <div class="topic-list-title">创作会话</div>
      <div
        v-for="topic in filteredTopics"
        :key="topic.id"
        class="topic-item"
        :class="{ active: topic.id === chatStore.currentTopicId }"
        role="button"
        tabindex="0"
        @click="handleSelectTopic(topic.id)"
        @keydown.enter.prevent="handleSelectTopic(topic.id)"
      >
        <video
          v-if="topic.coverImage && isVideoCover(topic.coverImage)"
          :src="`${topic.coverImage}#t=0.1`"
          muted
          preload="metadata"
          class="topic-thumb"
        ></video>
        <img v-else-if="topic.coverImage" :src="topic.coverImage" alt="thumbnail" class="topic-thumb" />
        <div v-else class="topic-thumb-placeholder">
          <ImageIcon :size="16" />
        </div>
        <div class="topic-meta">
          <span class="topic-title">{{ topic.title }}</span>
          <span class="topic-status">{{
            topic.status === 'generating' ? '生成中' : topic.status === 'error' ? '异常' : '就绪'
          }}</span>
        </div>
        <!-- P0-8: 删除按钮，hover 时显示，删除中禁用 -->
        <button
          class="topic-delete"
          type="button"
          data-action="delete-topic"
          :disabled="deletingTopicId === topic.id"
          :title="deletingTopicId === topic.id ? '删除中...' : '删除主题'"
          @click="handleDeleteTopic($event, topic.id)"
        >
          <Trash2 :size="14" />
        </button>
      </div>
    </div>

    <!-- 底部导航：使用日志入口 -->
    <div class="sidebar-footer">
      <button
        class="nav-entry"
        type="button"
        :class="{ active: isLogsRoute }"
        data-action="open-logs"
        @click="goToLogs"
      >
        <ScrollText :size="16" />
        <span>使用日志</span>
      </button>
    </div>

    <!-- 删除二次确认 -->
    <ConfirmDialog
      v-model:show="deleteConfirm.show"
      title="确定删除？"
      :content="`将删除「${deleteConfirm.title}」及其所有消息和文件，且不可恢复。`"
      confirm-text="删除"
      danger
      @confirm="handleConfirmDelete"
    />
  </div>
</template>

<style lang="scss" scoped>
@import '@/styles/variables.scss';

.sidebar {
  width: $sidebar-width;
  height: 100%;
  background: rgba(11, 14, 19, 0.88);
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  z-index: 10;
  position: relative;
  backdrop-filter: blur(18px);
}

.sidebar-header {
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;

  .brand-icon {
    width: 34px;
    height: 34px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, rgba(119, 168, 255, 0.18), rgba(255, 255, 255, 0.04));
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
  }
}

.brand-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.brand-title {
  font-size: 15px;
  font-weight: 600;
  color: $text-primary;
}

.brand-subtitle {
  font-size: 12px;
  color: $text-secondary;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(119, 168, 255, 0.1);
  color: $text-primary;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(119, 168, 255, 0.16);
    box-shadow: 0 0 18px rgba(119, 168, 255, 0.18);
  }
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;

  .search-icon {
    position: absolute;
    left: 10px;
    color: $text-secondary;
  }

  input {
    width: 100%;
    background-color: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 9px 10px 9px 34px;
    color: $text-primary;
    font-size: 13px;
    outline: none;
    border-radius: 12px;

    &::placeholder {
      color: $text-secondary;
    }
  }
}

.topic-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 12px 14px;
}

.topic-list-title {
  font-size: 12px;
  color: $text-muted;
  margin-bottom: 8px;
  padding-left: 8px;
  font-weight: 500;
}

.topic-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
  margin-bottom: 6px;
  background: transparent;
  text-align: left;

  &:hover {
    background-color: rgba(255, 255, 255, 0.03);

    .topic-delete {
      opacity: 1;
    }
  }

  &.active {
    background-color: rgba(119, 168, 255, 0.08);
    border-color: rgba(119, 168, 255, 0.12);
    box-shadow: inset 0 0 18px rgba(119, 168, 255, 0.08);
  }
}

.topic-thumb,
.topic-thumb-placeholder {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  object-fit: cover;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.topic-thumb-placeholder {
  background-color: rgba(255, 255, 255, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-secondary;
}

.topic-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.topic-title {
  font-size: 13px;
  color: $text-primary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topic-status {
  font-size: 11px;
  color: $text-secondary;
}

.topic-delete {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: $text-secondary;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  // 默认隐藏，hover topic-item 时显示
  opacity: 0;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    color: #ff6b6b;
    border-color: rgba(255, 107, 107, 0.4);
    background: rgba(255, 107, 107, 0.12);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

/* 底部导航：使用日志入口 */
.sidebar-footer {
  flex-shrink: 0;
  padding: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.nav-entry {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  color: $text-secondary;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background-color: rgba(255, 255, 255, 0.04);
    color: $text-primary;
  }

  &.active {
    background-color: rgba(119, 168, 255, 0.08);
    border-color: rgba(119, 168, 255, 0.14);
    color: $text-primary;
  }
}

@media (max-width: 860px) {
  .topic-delete {
    // 移动端常驻显示，因为无 hover
    opacity: 1;
  }
}
</style>
