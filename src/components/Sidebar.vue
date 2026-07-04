<script setup>
import { computed, ref } from 'vue'
import { useChatStore } from '@/store/chat'
import { Plus, Search, Image as ImageIcon } from 'lucide-vue-next'

const chatStore = useChatStore()
const keyword = ref('')

const filteredTopics = computed(() => {
  const search = keyword.value.trim().toLowerCase()
  if (!search) return chatStore.topics

  return chatStore.topics.filter((topic) => topic.title.toLowerCase().includes(search))
})

const handleNewTopic = () => {
  chatStore.createTopic('新建创作')
}
</script>

<template>
  <div class="sidebar">
    <div class="sidebar-header">
      <div class="brand">
        <div class="brand-icon">
          <ImageIcon :size="18" />
        </div>
        <div class="brand-copy">
          <span class="brand-title">图像工作台</span>
          <span class="brand-subtitle">GPT Image-2 对话创作</span>
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
      <button
        v-for="topic in filteredTopics"
        :key="topic.id"
        class="topic-item"
        :class="{ active: topic.id === chatStore.currentTopicId }"
        type="button"
        @click="chatStore.currentTopicId = topic.id"
      >
        <img v-if="topic.coverImage" :src="topic.coverImage" alt="thumbnail" class="topic-thumb" />
        <div v-else class="topic-thumb-placeholder">
          <ImageIcon :size="16" />
        </div>
        <div class="topic-meta">
          <span class="topic-title">{{ topic.title }}</span>
          <span class="topic-status">{{
            topic.status === 'generating' ? '生成中' : topic.status === 'error' ? '异常' : '就绪'
          }}</span>
        </div>
      </button>
    </div>
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
</style>
