<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  MessageSquare,
  Clapperboard,
  Library,
  ScrollText,
  ImageIcon,
  VideoIcon,
  Sparkles,
} from 'lucide-vue-next'
import { useChatStore } from '@/store/chat'
import { getStatsSummary } from '@/services/statsApi'

const router = useRouter()
const chatStore = useChatStore()

// 功能入口配置
const entries = [
  { label: '聊天创作', desc: '对话式图像/视频生成', path: '/chat', icon: MessageSquare },
  { label: '创作画布', desc: '漫剧自由画布', path: '/canvas', icon: Clapperboard },
  { label: '提示词库', desc: '提示词管理与复用', path: '/prompts', icon: Library },
  { label: '使用日志', desc: '生成记录与详情', path: '/logs', icon: ScrollText },
]

// 使用统计
const stats = ref({ totalGenerations: 0, imageCount: 0, videoCount: 0 })

// 最近创作会话（取最近 8 个）
const recentTopics = ref([])

onMounted(async () => {
  // 加载统计（失败不阻塞页面）
  try {
    stats.value = await getStatsSummary()
  } catch {
    // 统计加载失败时保持默认 0 值
  }

  // 从 chatStore 取最近会话，按 updatedAt 降序取前 8
  recentTopics.value = [...chatStore.topics]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 8)
})

/** 点击功能入口跳转 */
function goEntry(path) {
  router.push(path)
}

/** 点击最近会话跳转并选中 */
function goTopic(topicId) {
  router.push('/chat')
  chatStore.selectTopic(topicId)
}

/** 取会话封面（图/视频首帧） */
function topicCover(topic) {
  return topic.coverImage || ''
}
</script>

<template>
  <div class="home-page">
    <!-- ① 功能入口卡片 -->
    <section class="section">
      <h3 class="section-title">功能入口</h3>
      <div class="entry-grid">
        <button
          v-for="entry in entries"
          :key="entry.path"
          type="button"
          class="entry-card"
          data-role="entry-card"
          :data-path="entry.path"
          @click="goEntry(entry.path)"
        >
          <div class="entry-icon">
            <component :is="entry.icon" :size="22" />
          </div>
          <div class="entry-text">
            <span class="entry-label">{{ entry.label }}</span>
            <span class="entry-desc">{{ entry.desc }}</span>
          </div>
        </button>
      </div>
    </section>

    <!-- ② 使用统计 -->
    <section class="section">
      <h3 class="section-title">使用统计</h3>
      <div class="stats-grid">
        <div class="stat-card">
          <Sparkles :size="18" class="stat-icon" />
          <div class="stat-body">
            <span class="stat-value">{{ stats.totalGenerations }}</span>
            <span class="stat-label">累计生成</span>
          </div>
        </div>
        <div class="stat-card">
          <ImageIcon :size="18" class="stat-icon" />
          <div class="stat-body">
            <span class="stat-value">{{ stats.imageCount }}</span>
            <span class="stat-label">图片生成</span>
          </div>
        </div>
        <div class="stat-card">
          <VideoIcon :size="18" class="stat-icon" />
          <div class="stat-body">
            <span class="stat-value">{{ stats.videoCount }}</span>
            <span class="stat-label">视频生成</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ③ 最近创作会话 -->
    <section class="section">
      <h3 class="section-title">最近创作</h3>
      <div v-if="recentTopics.length" class="recent-row">
        <button
          v-for="topic in recentTopics"
          :key="topic.id"
          type="button"
          class="recent-item"
          @click="goTopic(topic.id)"
        >
          <div class="recent-cover">
            <img v-if="topicCover(topic)" :src="topicCover(topic)" :alt="topic.title" loading="lazy" />
            <MessageSquare v-else :size="20" class="recent-placeholder" />
          </div>
          <span class="recent-title">{{ topic.title }}</span>
        </button>
      </div>
      <p v-else class="empty-hint">暂无创作会话，点击「聊天创作」开始</p>
    </section>
  </div>
</template>

<style lang="scss" scoped>
@import '@/styles/variables.scss';

.home-page {
  height: 100%;
  overflow-y: auto;
  padding: 32px 40px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: $text-primary;
  padding-left: 8px;
  border-left: 2px solid rgba(119, 168, 255, 0.6);
  line-height: 1.2;
}

/* 功能入口卡片网格 */
.entry-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.entry-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  background: rgba(18, 22, 28, 0.6);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;

  &:hover {
    border-color: rgba(119, 168, 255, 0.3);
    background: rgba(119, 168, 255, 0.06);
  }
}

.entry-icon {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(119, 168, 255, 0.1);
  color: rgba(119, 168, 255, 0.9);
  flex-shrink: 0;
}

.entry-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.entry-label {
  font-size: 14px;
  font-weight: 600;
  color: $text-primary;
}

.entry-desc {
  font-size: 12px;
  color: $text-secondary;
}

/* 统计卡片 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  background: rgba(18, 22, 28, 0.6);
}

.stat-icon {
  color: rgba(119, 168, 255, 0.8);
  flex-shrink: 0;
}

.stat-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: $text-primary;
  line-height: 1.1;
}

.stat-label {
  font-size: 12px;
  color: $text-secondary;
}

/* 最近创作会话 */
.recent-row {
  display: flex;
  gap: 14px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.recent-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
  width: 140px;
}

.recent-cover {
  width: 140px;
  height: 100px;
  border-radius: 3px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(18, 22, 28, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.recent-placeholder {
  color: $text-secondary;
}

.recent-title {
  font-size: 12px;
  color: $text-secondary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
}

.empty-hint {
  margin: 0;
  font-size: 13px;
  color: $text-secondary;
}
</style>
