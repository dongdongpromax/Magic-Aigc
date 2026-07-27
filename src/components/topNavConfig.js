import { MessageSquare, Clapperboard, ScrollText, Library } from 'lucide-vue-next'

/**
 * 顶部导航父子菜单配置
 *
 * 两组：
 * - 创作组：聊天 / 画布
 * - 管理组：提示词库 / 使用日志
 *
 * 每项：label 显示文案，path 路由路径，icon lucide 图标组件
 */
export const NAV_MENU = [
  {
    label: '创作',
    items: [
      { label: '聊天', path: '/chat', icon: MessageSquare },
      { label: '画布', path: '/canvas', icon: Clapperboard },
    ],
  },
  {
    label: '管理',
    items: [
      { label: '提示词库', path: '/prompts', icon: Library },
      { label: '使用日志', path: '/logs', icon: ScrollText },
    ],
  },
]
