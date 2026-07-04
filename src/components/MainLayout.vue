<script setup>
import Sidebar from './Sidebar.vue'
import ChatArea from './ChatArea.vue'
</script>

<template>
  <div class="main-layout">
    <Sidebar />
    <div class="content-wrapper">
      <div class="cyber-grid-bg"></div>
      <div class="ambient-glow"></div>
      <ChatArea />
    </div>
  </div>
</template>

<style lang="scss" scoped>
@import '@/styles/variables.scss';

.main-layout {
  display: flex;
  width: 100%;
  height: 100%;
  background-color: $bg-base;
}

.content-wrapper {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
