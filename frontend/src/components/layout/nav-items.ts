/* 後台導覽定義：總覽（儀表板，含原用量分析內容）／營運／設定三分組。
 * label 為 i18n key（nav.*），由 app-sidebar / topbar 以 t() 翻譯後呈現。 */
import {
  LayoutDashboard,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from 'lucide-react'

export type NavGroup = 'overview' | 'ops' | 'settings'

export interface NavItem {
  href: string
  label: string
  group: NavGroup
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/admin/dashboard', label: 'nav.dashboard', group: 'overview', icon: LayoutDashboard },
  { href: '/admin/accounts', label: 'nav.accounts', group: 'ops', icon: Users },
  { href: '/admin/proxies', label: 'nav.proxies', group: 'ops', icon: SlidersHorizontal },
  { href: '/admin/captcha', label: 'nav.captcha', group: 'ops', icon: ShieldCheck },
  { href: '/admin/settings', label: 'nav.settings', group: 'settings', icon: Settings },
]

export const NAV_GROUPS = ['overview', 'ops', 'settings'] as const satisfies readonly NavGroup[]
