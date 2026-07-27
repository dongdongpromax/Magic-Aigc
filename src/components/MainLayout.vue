<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Sidebar from './Sidebar.vue'
import TopNav from './TopNav.vue'
import { useChatStore } from '@/store/chat'

const route = useRoute()
const chatStore = useChatStore()
// 改动2: 聊天区全屏时隐藏侧栏与顶栏，内容区铺满整个窗口
const isFullscreen = computed(() => chatStore.isChatFullscreen)
// 仅聊天页显示左侧会话列表侧栏，其他页面内容区铺满
const showSidebar = computed(() => route?.path?.startsWith('/chat') ?? false)
</script>

<template>
  <div class="main-layout" :class="{ 'is-fullscreen': isFullscreen }">
    <TopNav />
    <div class="body-wrapper">
      <Sidebar v-if="showSidebar" />
      <div class="content-wrapper">
        <div class="background-scene" aria-hidden="true">
          <div class="cyber-grid-bg"></div>
          <div class="ambient-glow"></div>
          <div class="particle-orbit"></div>
          <div class="particle-dust"></div>
          <div class="particle-vignette"></div>
        </div>
        <router-view />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@import '@/styles/variables.scss';

.main-layout {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background-color: $bg-base;
}

/* 顶栏 + 侧栏 + 内容区的横向容器 */
.body-wrapper {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* 改动2: 全屏时把侧栏滑出视口、顶栏上移隐藏，内容区自动铺满；:deep 穿透到子组件根元素 */
:deep(.top-nav) {
  transition: transform 0.3s ease;
}

:deep(.sidebar) {
  transition: margin-left 0.3s ease;
}

.main-layout.is-fullscreen :deep(.top-nav) {
  transform: translateY(-100%);
}

.main-layout.is-fullscreen :deep(.sidebar) {
  margin-left: -$sidebar-width;
}

.content-wrapper {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  isolation: isolate;
  background:
    radial-gradient(circle at 18% 22%, rgba(35, 255, 188, 0.08), transparent 26%),
    radial-gradient(circle at 82% 18%, rgba(80, 147, 255, 0.12), transparent 28%),
    radial-gradient(circle at 64% 72%, rgba(113, 255, 213, 0.08), transparent 22%), $bg-base;
}

.background-scene {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.content-wrapper > :not(.background-scene) {
  position: relative;
  z-index: 1;
}

.cyber-grid-bg,
.ambient-glow,
.particle-orbit,
.particle-dust,
.particle-vignette {
  position: absolute;
  inset: -12%;
}

.cyber-grid-bg {
  background-image:
    linear-gradient(rgba(120, 255, 219, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(120, 255, 219, 0.08) 1px, transparent 1px);
  background-size: 54px 54px;
  opacity: 0.16;
  mask-image: radial-gradient(circle at center, rgba(0, 0, 0, 0.9), transparent 78%);
  animation: gridDrift 22s linear infinite;
}

.ambient-glow {
  background:
    radial-gradient(circle at 60% 24%, rgba(108, 255, 214, 0.34), transparent 18%),
    radial-gradient(circle at 58% 56%, rgba(140, 255, 227, 0.26), transparent 16%),
    radial-gradient(circle at 82% 32%, rgba(94, 165, 255, 0.18), transparent 20%);
  filter: blur(26px);
  opacity: 1;
  animation: glowPulse 11s ease-in-out infinite alternate;
}

.particle-orbit {
  background-image:
    radial-gradient(circle at 22px 20px, rgba(173, 255, 231, 0.95) 0 1.1px, transparent 1.8px),
    radial-gradient(circle at 110px 54px, rgba(104, 255, 201, 0.72) 0 1px, transparent 1.7px),
    radial-gradient(circle at 156px 132px, rgba(94, 165, 255, 0.5) 0 1px, transparent 1.8px);
  background-size:
    180px 180px,
    220px 220px,
    260px 260px;
  background-position:
    0 0,
    30px 10px,
    60px 20px;
  mix-blend-mode: screen;
  opacity: 0.82;
  filter: drop-shadow(0 0 10px rgba(111, 255, 219, 0.24));
  mask-image:
    radial-gradient(circle at 48% 22%, black 0 18%, transparent 26%),
    radial-gradient(circle at 66% 62%, black 0 16%, transparent 24%),
    radial-gradient(circle at 82% 14%, transparent 0 4%, black 12%, transparent 36%);
  animation:
    particleSweep 18s linear infinite,
    particleWave 16s ease-in-out infinite alternate;
}

.particle-dust {
  background-image:
    radial-gradient(circle at 12px 16px, rgba(255, 255, 255, 0.88) 0 0.8px, transparent 1.5px),
    radial-gradient(circle at 72px 94px, rgba(96, 255, 206, 0.56) 0 0.9px, transparent 1.5px),
    radial-gradient(circle at 142px 44px, rgba(255, 255, 255, 0.66) 0 0.8px, transparent 1.4px);
  background-size:
    120px 120px,
    160px 160px,
    210px 210px;
  opacity: 0.58;
  filter: blur(0.15px);
  mix-blend-mode: screen;
  animation: particleDrift 26s linear infinite;
}

.particle-vignette {
  inset: 0;
  background:
    radial-gradient(circle at 44% 18%, rgba(0, 0, 0, 0.88) 0 14%, transparent 20%),
    radial-gradient(circle at 66% 62%, rgba(0, 0, 0, 0.9) 0 15%, transparent 21%),
    linear-gradient(180deg, rgba(5, 7, 11, 0.08), rgba(5, 7, 11, 0.42));
}

@keyframes gridDrift {
  from {
    transform: translate3d(0, 0, 0);
  }
  to {
    transform: translate3d(-32px, -24px, 0);
  }
}

@keyframes glowPulse {
  from {
    transform: scale(1) translate3d(0, 0, 0);
    opacity: 0.78;
  }
  to {
    transform: scale(1.06) translate3d(1%, -1%, 0);
    opacity: 1;
  }
}

@keyframes particleSweep {
  from {
    transform: translate3d(2%, -2%, 0) rotate(0deg) scale(1);
  }
  to {
    transform: translate3d(-4%, 3%, 0) rotate(-4deg) scale(1.04);
  }
}

@keyframes particleWave {
  from {
    clip-path: ellipse(48% 62% at 66% 34%);
  }
  to {
    clip-path: ellipse(54% 68% at 62% 38%);
  }
}

@keyframes particleDrift {
  from {
    transform: translate3d(0, 0, 0);
  }
  to {
    transform: translate3d(-48px, 28px, 0);
  }
}
</style>
