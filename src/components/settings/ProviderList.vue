<script setup>
import { computed, ref } from 'vue'
import { NInput, NSwitch } from 'naive-ui'

/**
 * 设置模态左栏：中转站列表
 * 搜索过滤 / 点击选中 / 整家开关（CherryStudio 同款 ON 徽标）
 */
const props = defineProps({
  providers: { type: Array, default: () => [] },
  selectedId: { type: String, default: '' },
})
const emit = defineEmits(['select', 'toggle'])

const keyword = ref('')

/** 按名称关键词过滤 */
const filteredProviders = computed(() => {
  const key = keyword.value.trim().toLowerCase()
  if (!key) return props.providers
  return props.providers.filter((p) => p.name.toLowerCase().includes(key))
})

/** 名称首字符作为色块图标占位 */
function avatarText(name) {
  return String(name || '?')
    .trim()
    .charAt(0)
    .toUpperCase()
}
</script>

<template>
  <div class="provider-list">
    <div class="list-search">
      <n-input
        v-model:value="keyword"
        size="small"
        placeholder="搜索中转站..."
        data-role="provider-search"
      />
    </div>

    <div class="list-items">
      <div
        v-for="provider in filteredProviders"
        :key="provider.id"
        class="provider-item"
        :class="{ 'is-active': provider.id === selectedId, 'is-off': !provider.enabled }"
        data-role="provider-item"
        @click="emit('select', provider.id)"
      >
        <span
          class="provider-avatar"
          :style="{ background: provider.color || 'rgba(255,255,255,0.12)' }"
          >{{ avatarText(provider.name) }}</span
        >
        <span class="provider-name" :title="provider.name">{{ provider.name }}</span>
        <span v-if="provider.enabled" class="on-badge" data-role="on-badge">ON</span>
        <n-switch
          :value="provider.enabled"
          size="small"
          class="provider-switch"
          data-action="toggle-provider"
          @click.stop
          @update:value="emit('toggle', provider.id, $event)"
        />
      </div>

      <div v-if="!filteredProviders.length" class="list-empty">没有匹配的中转站</div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.provider-list {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.list-search {
  padding: 14px 14px 10px;
}

.list-items {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 8px;
}

.provider-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  &.is-active {
    background: rgba(99, 102, 241, 0.14);
  }

  &.is-off .provider-name {
    opacity: 0.55;
  }
}

.provider-avatar {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  flex-shrink: 0;
}

.provider-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.88);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.on-badge {
  font-size: 10px;
  font-weight: 700;
  color: rgba(16, 185, 129, 0.95);
  letter-spacing: 0.4px;
}

.list-empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}
</style>
