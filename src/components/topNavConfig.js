import { MessageSquare, Clapperboard, ScrollText } from 'lucide-vue-next'

/**
 * 顶部导航父子菜单配置
 *
 * 阶段 1 仅含「创作」（聊天/画布）和「管理」（使用日志）两组。
 * 阶段 3 提示词库上线后，在「管理」组追加 { label: '提示词库', path: '/prompts', icon: Library }。
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
    items: [{ label: '使用日志', path: '/logs', icon: ScrollText }],
  },
]
