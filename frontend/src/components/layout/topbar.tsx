/* 頂欄：側欄開合按鈕＋麵包屑（控制台／當前頁）＋語言切換 */
import { Languages } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { setLang, type UiLang } from '@/i18n'
import { NAV_ITEMS } from './nav-items'

/* 語言切換循環：簡體 → 繁體 → English → 簡體 */
const LANG_CYCLE: UiLang[] = ['zh-CN', 'zh-TW', 'en']
const LANG_LABEL: Record<UiLang, string> = { 'zh-CN': '简', 'zh-TW': '繁', en: 'EN' }

export function Topbar() {
  const { pathname } = useLocation()
  const { t, i18n } = useTranslation()
  const current = NAV_ITEMS.find((item) => item.href === pathname)

  function cycleLang() {
    const idx = LANG_CYCLE.indexOf(i18n.language as UiLang)
    setLang(LANG_CYCLE[(idx + 1) % LANG_CYCLE.length])
  }

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>{t('app.console')}</BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{current ? t(current.label) : t('app.admin_panel')}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <button
        type="button"
        onClick={cycleLang}
        title={t('app.switch_language')}
        className="ml-auto inline-flex h-7 min-w-9 items-center justify-center gap-1 rounded-md border px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <Languages className="size-3.5" />
        {LANG_LABEL[i18n.language as UiLang] ?? 'EN'}
      </button>
    </header>
  )
}
