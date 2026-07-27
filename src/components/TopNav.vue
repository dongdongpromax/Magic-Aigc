<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Aperture } from 'lucide-vue-next'
import ConnectionBadge from './ConnectionBadge.vue'
import { useChatStore } from '@/store/chat'
import { NAV_MENU } from './topNavConfig'

const route = useRoute()
const router = useRouter()
const chatStore = useChatStore()

/** 当前展开的父菜单 label（hover 控制，离开清空） */
const openMenu = ref('')

/** 判断菜单项是否对应当前路由（前缀匹配） */
function isActive(path) {
  return route.path.startsWith(path)
}

/** 点击子菜单项跳转并收起菜单 */
function go(path) {
  router.push(path)
  openMenu.value = ''
}
</script>

<template>
  <div class="top-nav" data-role="top-nav">
    <!-- 左侧：品牌 -->
    <div class="brand">
      <div class="brand-icon">
        <Aperture :size="18" />
      </div>
      <span class="brand-title">创作工坊</span>
    </div>

    <!-- 中部：父子下拉菜单 -->
    <nav class="nav-menu">
      <div
        v-for="group in NAV_MENU"
        :key="group.label"
        class="nav-group"
        data-role="nav-group"
        @mouseenter="openMenu = group.label"
        @mouseleave="openMenu = ''"
      >
        <span class="nav-group-label">{{ group.label }}</span>

        <!-- 子菜单浮层：hover 时渲染 -->
        <div v-if="openMenu === group.label" class="submenu" data-role="submenu">
          <button
            v-for="item in group.items"
            :key="item.path"
            type="button"
            class="submenu-item"
            :class="{ active: isActive(item.path) }"
            data-action="nav-item"
            :data-path="item.path"
            @click="go(item.path)"
          >
            <component :is="item.icon" :size="15" />
            <span>{{ item.label }}</span>
          </button>
        </div>
      </div>
    </nav>

    <!-- 右侧：连接状态徽标 -->
    <div class="nav-actions">
      <ConnectionBadge
        :has-config="chatStore.hasConfig"
        :has-error="Boolean(chatStore.lastError)"
        @click="chatStore.openSettings"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
@import '@/styles/variables.scss';

.top-nav {
  flex-shrink: 0;
  height: 48px;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 0 20px;
  background: rgba(11, 14, 19, 0.92);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(18px);
  z-index: 20;
  position: relative;
}

/* 品牌区 */
.brand {
  display: flex;
  align-items: center;
  gap: 10px;

  .brand-icon {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, rgba(119, 168, 255, 0.18), rgba(255, 255, 255, 0.04));
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .brand-title {
    font-size: 14px;
    font-weight: 600;
    color: $text-primary;
  }
}

/* 父子菜单 */
.nav-menu {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nav-group {
  position: relative;
  padding: 0 12px;
  height: 48px;
  display: flex;
  align-items: center;
  cursor: default;
}

.nav-group-label {
  font-size: 13px;
  color: $text-secondary;
  transition: color 0.2s ease;
}

.nav-group:hover .nav-group-label {
  color: $text-primary;
}

/* 子菜单浮层 */
.submenu {
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 140px;
  padding: 6px;
  background: rgba(18, 22, 28, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
  z-index: 30;
}

.submenu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: $text-secondary;
  font-size: 13px;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
    color: $text-primary;
  }

  &.active {
    background: rgba(119, 168, 255, 0.12);
    color: $text-primary;
  }
}

/* 右侧操作区 */
.nav-actions {
  margin-left: auto;
}
</style>
