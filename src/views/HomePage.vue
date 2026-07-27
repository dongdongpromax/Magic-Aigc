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
  ArrowRight,
  Clock,
} from 'lucide-vue-next'
import { useChatStore } from '@/store/chat'
import { getStatsSummary } from '@/services/statsApi'

const router = useRouter()
const chatStore = useChatStore()

// 功能入口配置 — 每项带独立强调色，增强视觉层次
const entries = [
  { label: '聊天创作', desc: '对话式生成图像与视频', path: '/chat', icon: MessageSquare, color: '#77a8ff' },
  { label: '创作画布', desc: '漫剧自由编排画布', path: '/canvas', icon: Clapperboard, color: '#9d7cff' },
  { label: '提示词库', desc: '提示词管理与复用', path: '/prompts', icon: Library, color: '#23d4b4' },
  { label: '使用日志', desc: '生成记录与详情', path: '/logs', icon: ScrollText, color: '#f5a623' },
]

// 统计项配置
const statItems = [
  { key: 'totalGenerations', label: '累计生成', icon: Sparkles, color: '#77a8ff' },
  { key: 'imageCount', label: '图片生成', icon: ImageIcon, color: '#23d4b4' },
  { key: 'videoCount', label: '视频生成', icon: VideoIcon, color: '#9d7cff' },
  { key: 'promptCount', label: '提示词数', icon: Library, color: '#f5a623' },
]

const stats = ref({ totalGenerations: 0, imageCount: 0, videoCount: 0, promptCount: 0 })
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

/** 相对时间格式化 */
function relativeTime(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} 天前`
  return new Date(ts).toLocaleDateString('zh-CN')
}
</script>

<template>
  <div class="home-page">
    <div class="home-inner">
      <!-- ① Hero 区域 -->
      <section class="hero">
        <div class="hero-badge">
          <Sparkles :size="13" />
          <span>AI 创作工坊</span>
        </div>
        <h1 class="hero-title">让创意触手可及</h1>
        <p class="hero-subtitle">一站式 AI 图像与视频创作平台，从提示词到成品，全流程在线完成</p>
        <div class="hero-actions">
          <button type="button" class="cta-btn" @click="goEntry('/chat')">
            <MessageSquare :size="16" />
            <span>开始创作</span>
            <ArrowRight :size="15" />
          </button>
          <button type="button" class="cta-btn--ghost" @click="goEntry('/prompts')">
            <Library :size="15" />
            <span>浏览提示词</span>
          </button>
        </div>
      </section>

      <!-- ② 功能入口 -->
      <section class="section">
        <div class="section-header">
          <h3 class="section-title">功能入口</h3>
        </div>
        <div class="entry-grid">
          <button
            v-for="entry in entries"
            :key="entry.path"
            type="button"
            class="entry-card"
            data-role="entry-card"
            :data-path="entry.path"
            :style="{ '--card-color': entry.color }"
            @click="goEntry(entry.path)"
          >
            <div class="entry-icon">
              <component :is="entry.icon" :size="22" />
            </div>
            <div class="entry-text">
              <span class="entry-label">{{ entry.label }}</span>
              <span class="entry-desc">{{ entry.desc }}</span>
            </div>
            <ArrowRight :size="15" class="entry-arrow" />
          </button>
        </div>
      </section>

      <!-- ③ 数据概览 -->
      <section class="section">
        <div class="section-header">
          <h3 class="section-title">数据概览</h3>
        </div>
        <div class="stats-row">
          <div
            v-for="item in statItems"
            :key="item.key"
            class="stat-item"
            :style="{ '--stat-color': item.color }"
          >
            <div class="stat-icon">
              <component :is="item.icon" :size="16" />
            </div>
            <span class="stat-value">{{ stats[item.key] }}</span>
            <span class="stat-label">{{ item.label }}</span>
          </div>
        </div>
      </section>

      <!-- ④ 最近创作 -->
      <section class="section">
        <div class="section-header">
          <h3 class="section-title">最近创作</h3>
          <button type="button" class="section-more" @click="goEntry('/chat')">
            <span>查看全部</span>
            <ArrowRight :size="13" />
          </button>
        </div>
        <div v-if="recentTopics.length" class="recent-grid">
          <button
            v-for="topic in recentTopics"
            :key="topic.id"
            type="button"
            class="recent-card"
            @click="goTopic(topic.id)"
          >
            <div class="recent-cover">
              <img v-if="topicCover(topic)" :src="topicCover(topic)" :alt="topic.title" loading="lazy" />
              <MessageSquare v-else :size="22" class="recent-placeholder" />
            </div>
            <div class="recent-info">
              <span class="recent-title">{{ topic.title }}</span>
              <span class="recent-time">
                <Clock :size="11" />
                {{ relativeTime(topic.updatedAt) }}
              </span>
            </div>
          </button>
        </div>
        <div v-else class="empty-state">
          <div class="empty-icon">
            <Clapperboard :size="28" />
          </div>
          <p class="empty-text">还没有创作记录</p>
          <button type="button" class="empty-cta" @click="goEntry('/chat')">
            <MessageSquare :size="14" />
            <span>开始第一次创作</span>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@import '@/styles/variables.scss';

.home-page {
  height: 100%;
  overflow-y: auto;
  /* 半透明实色背景遮盖 MainLayout 粒子动效，营造干净商务感 */
  background: rgba(8, 10, 14, 0.82);
  backdrop-filter: blur(6px);
}

.home-inner {
  max-width: 1120px;
  margin: 0 auto;
  padding: 48px 40px 64px;
  display: flex;
  flex-direction: column;
  gap: 40px;
}

/* ① Hero */
.hero {
  text-align: center;
  padding: 40px 0 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  border: 1px solid rgba(119, 168, 255, 0.25);
  border-radius: 3px;
  background: rgba(119, 168, 255, 0.08);
  color: rgba(119, 168, 255, 0.9);
  font-size: 12px;
  font-weight: 500;
}

.hero-title {
  margin: 0;
  font-size: 36px;
  font-weight: 700;
  letter-spacing: 2px;
  color: $text-primary;
  line-height: 1.2;
}

.hero-subtitle {
  margin: 0;
  max-width: 520px;
  font-size: 14px;
  line-height: 1.7;
  color: $text-secondary;
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}

.cta-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 24px;
  border: none;
  border-radius: 3px;
  background: $accent-color;
  color: #0b0e13;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.15s ease;

  &:hover {
    background: $accent-color-hover;
    transform: translateY(-1px);
  }
}

.cta-btn--ghost {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 24px;
  border: 1px solid $border-color;
  border-radius: 3px;
  background: transparent;
  color: $text-secondary;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: $border-light;
    color: $text-primary;
    background: rgba(255, 255, 255, 0.03);
  }
}

/* 通用 section */
.section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: $text-primary;
  padding-left: 10px;
  border-left: 3px solid $accent-color;
  line-height: 1.2;
}

.section-more {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: $text-secondary;
  font-size: 12px;
  cursor: pointer;
  transition: color 0.2s ease;

  &:hover {
    color: $text-primary;
  }
}

/* ② 功能入口卡片 */
.entry-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.entry-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px;
  border: 1px solid $border-color;
  border-radius: 3px;
  background: rgba(18, 22, 28, 0.7);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
  position: relative;
  overflow: hidden;

  /* 左侧强调色条 */
  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: var(--card-color);
    opacity: 0.5;
    transition: opacity 0.2s ease;
  }

  &:hover {
    border-color: var(--card-color);
    background: rgba(18, 22, 28, 0.9);
    transform: translateY(-2px);

    &::before {
      opacity: 1;
    }

    .entry-arrow {
      opacity: 1;
      transform: translateX(0);
      color: var(--card-color);
    }

    .entry-icon {
      background: color-mix(in srgb, var(--card-color) 18%, transparent);
    }
  }
}

.entry-icon {
  width: 42px;
  height: 42px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--card-color) 10%, transparent);
  color: var(--card-color);
  flex-shrink: 0;
  transition: background 0.2s ease;
}

.entry-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.entry-label {
  font-size: 14px;
  font-weight: 600;
  color: $text-primary;
}

.entry-desc {
  font-size: 12px;
  color: $text-secondary;
  line-height: 1.4;
}

.entry-arrow {
  color: $text-muted;
  opacity: 0;
  transform: translateX(-6px);
  transition: all 0.2s ease;
  flex-shrink: 0;
}

/* ③ 数据概览 */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid $border-color;
  border-radius: 3px;
  background: rgba(18, 22, 28, 0.7);
  overflow: hidden;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px;
  position: relative;

  /* 列间分隔线 */
  &:not(:last-child)::after {
    content: '';
    position: absolute;
    right: 0;
    top: 20%;
    bottom: 20%;
    width: 1px;
    background: $border-color;
  }
}

.stat-icon {
  width: 34px;
  height: 34px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--stat-color) 12%, transparent);
  color: var(--stat-color);
  flex-shrink: 0;
}

.stat-value {
  font-size: 26px;
  font-weight: 700;
  color: $text-primary;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: 12px;
  color: $text-secondary;
  white-space: nowrap;
}

/* ④ 最近创作 */
.recent-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.recent-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: transform 0.2s ease;

  &:hover {
    transform: translateY(-2px);

    .recent-cover {
      border-color: $border-light;
    }
  }
}

.recent-cover {
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 3px;
  overflow: hidden;
  border: 1px solid $border-color;
  background: rgba(18, 22, 28, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.2s ease;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.recent-placeholder {
  color: $text-muted;
}

.recent-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.recent-title {
  font-size: 13px;
  font-weight: 500;
  color: $text-primary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-time {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: $text-muted;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 48px 0;
  border: 1px dashed $border-color;
  border-radius: 3px;
  background: rgba(18, 22, 28, 0.4);
}

.empty-icon {
  width: 56px;
  height: 56px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(119, 168, 255, 0.06);
  color: $text-muted;
}

.empty-text {
  margin: 0;
  font-size: 14px;
  color: $text-secondary;
}

.empty-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border: 1px solid rgba(119, 168, 255, 0.3);
  border-radius: 3px;
  background: rgba(119, 168, 255, 0.08);
  color: rgba(119, 168, 255, 0.9);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(119, 168, 255, 0.14);
    border-color: rgba(119, 168, 255, 0.5);
  }
}
</style>
