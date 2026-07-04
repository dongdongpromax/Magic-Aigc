<script setup>
import { darkTheme, NConfigProvider, NMessageProvider } from 'naive-ui'
import MainLayout from './components/MainLayout.vue'

const themeOverrides = {
  common: {
    baseColor: '#0A0A0A',
    primaryColor: '#3b82f6',
    primaryColorHover: '#60a5fa',
    borderRadius: '8px',
  },
}
</script>

<template>
  <n-config-provider :theme="darkTheme" :theme-overrides="themeOverrides" class="provider-wrap">
    <n-message-provider>
      <MainLayout />
    </n-message-provider>
  </n-config-provider>
</template>

<style lang="scss">
#app {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.provider-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
}
</style>
