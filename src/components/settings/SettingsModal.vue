<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useProvidersStore } from '@/store/providers'
import ProviderList from './ProviderList.vue'
import ProviderDetail from './ProviderDetail.vue'
import CreateProviderForm from './CreateProviderForm.vue'
import GeneralSettings from './GeneralSettings.vue'
import DefaultParamsSettings from './DefaultParamsSettings.vue'

/**
 * 设置模态（CherryStudio 式模型广场）
 *
 * 自绘 overlay 模态（不用 n-modal，便于测试与样式控制）：
 * - 左栏：中转站列表（搜索/开关/添加）+ 通用设置入口
 * - 右栏：详情 / 通用 / 新建 三个视图切换
 * - 即时保存语义：各字段变更即调 API，无保存按钮
 */
const props = defineProps({
  show: { type: Boolean, default: false },
})
const emit = defineEmits(['update:show'])

const providersStore = useProvidersStore()

/** 右栏视图：provider（详情）/ general（通用设置）/ defaults（默认参数）/ create（新建中转站） */
const view = ref('provider')

// 模态打开时加载列表并重置视图（immediate 覆盖挂载时 show 已为 true 的场景）
watch(
  () => props.show,
  async (show) => {
    if (!show) return
    view.value = 'provider'
    // loadProviders 有缓存：若聊天区已加载过列表会早退，此时选中家的模型可能从未加载，
    // 需补一次 selectProvider（其自身带模型缓存，不会重复请求）
    await providersStore.loadProviders()
    if (providersStore.selectedProviderId) {
      await providersStore.selectProvider(providersStore.selectedProviderId)
    }
  },
  { immediate: true },
)

/** 选中一家 → 切详情视图并加载其模型 */
function handleSelect(id) {
  view.value = 'provider'
  providersStore.selectProvider(id)
}

/** 整家开关 */
function handleToggle(id, enabled) {
  providersStore.toggleProvider(id, enabled)
}

/** Esc 关闭 */
function handleKeydown(event) {
  if (event.key === 'Escape' && props.show) {
    emit('update:show', false)
  }
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="settings-overlay"
      data-role="settings-overlay"
      @click.self="emit('update:show', false)"
    >
      <div class="settings-modal" data-role="settings-modal">
        <aside class="settings-sidebar">
          <ProviderList
            :providers="providersStore.providers"
            :selected-id="view === 'provider' ? providersStore.selectedProviderId : ''"
            @select="handleSelect"
            @toggle="handleToggle"
          />
          <div class="sidebar-footer">
            <div class="footer-settings-row">
              <button
                type="button"
                class="footer-btn"
                :class="{ 'is-active': view === 'general' }"
                data-action="open-general"
                @click="view = 'general'"
              >
                通用
              </button>
              <button
                type="button"
                class="footer-btn"
                :class="{ 'is-active': view === 'defaults' }"
                data-action="open-defaults"
                @click="view = 'defaults'"
              >
                默认参数
              </button>
            </div>
            <button
              type="button"
              class="footer-btn footer-btn--add"
              data-action="add-provider"
              @click="view = 'create'"
            >
              + 添加
            </button>
          </div>
        </aside>

        <section class="settings-main">
          <ProviderDetail v-if="view === 'provider'" />
          <GeneralSettings v-else-if="view === 'general'" />
          <DefaultParamsSettings v-else-if="view === 'defaults'" />
          <CreateProviderForm
            v-else-if="view === 'create'"
            @created="view = 'provider'"
            @cancel="view = 'provider'"
          />
        </section>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.settings-modal {
  width: min(1100px, calc(100vw - 48px));
  height: min(720px, calc(100vh - 48px));
  border-radius: 16px;
  background: rgba(18, 18, 20, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6);
  display: flex;
  overflow: hidden;
}

.settings-sidebar {
  width: 260px;
  flex-shrink: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.07);
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.02);
}

.sidebar-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

/* 设置类入口（通用 / 默认参数）一行平铺 */
.footer-settings-row {
  display: flex;
  gap: 8px;
}

.footer-btn {
  flex: 1;
  padding: 8px 0;
  border: none;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.75);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.95);
  }

  &.is-active {
    background: rgba(99, 102, 241, 0.2);
    color: rgba(165, 180, 252, 0.95);
  }
}

/* 「+ 添加」整行铺满，与设置入口分行避免混淆 */
.footer-btn--add {
  flex: 0 0 auto;
  width: 100%;
}

.settings-main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
}
</style>
