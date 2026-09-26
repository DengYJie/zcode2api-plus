/* i18n 初始化：简体/繁体/英文三语，语言记忆于 localStorage('lang')。
 * 未设置时按浏览器语言回退：zh-TW/zh-HK/zh-MO → zh-TW，其余 zh* → zh-CN，
 * 非中文 → en。组件内用 useTranslation() + t('key')，语言切换调用
 * i18n.changeLanguage()（见设置页与顶栏）。 */
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'
import zhTW from './locales/zh-TW.json'

export type UiLang = 'zh-CN' | 'zh-TW' | 'en'

const LANG_KEY = 'lang'

export function detectLang(): UiLang {
  const saved = localStorage.getItem(LANG_KEY)
  if (saved === 'zh-CN' || saved === 'zh-TW' || saved === 'en') return saved
  const nav = (navigator.language || 'en').toLowerCase()
  if (nav.startsWith('zh')) {
    if (/tw|hk|mo|hant/.test(nav)) return 'zh-TW'
    return 'zh-CN'
  }
  return 'en'
}

export function setLang(lang: UiLang) {
  localStorage.setItem(LANG_KEY, lang)
  void i18next.changeLanguage(lang)
}

void i18next.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'zh-TW': { translation: zhTW },
    en: { translation: en },
  },
  lng: detectLang(),
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
})

export default i18next
