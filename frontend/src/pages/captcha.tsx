/* 驗證中心頁：載入阿里雲驗證 SDK，於真實瀏覽器完成無痕驗證並提交結果供 JWT 請求複用 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import i18n from '@/i18n'
import { api, errMsg } from '@/lib/api'
import type { CaptchaConfig } from '@/lib/types'

const SDK_URL = 'https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js'

interface AliyunCaptchaInstance {
  startTracelessVerification?: () => void
  show?: () => void
}

interface AliyunCaptchaOptions {
  SceneId?: string
  mode: string
  region?: string
  prefix?: string
  element: string
  button: string
  captchaLogoImg: string
  showErrorTip: boolean
  getInstance: (inst: AliyunCaptchaInstance | undefined) => void
  success: (param: string) => void
  fail: (err: { message?: string } | unknown) => void
  onError: (err: { message?: string } | unknown) => void
}

declare global {
  interface Window {
    initAliyunCaptcha?: (options: AliyunCaptchaOptions) => void
  }
}

/* SDK 以 selector 綁定 DOM，故此頁固定使用 #cap 與 #btn 兩個 id */
function loadSdk(): Promise<void> {
  if (window.initAliyunCaptcha) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SDK_URL
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(i18n.t('captcha.sdk_load_failed')))
    document.head.appendChild(s)
  })
}

function errText(err: { message?: string } | unknown): string {
  const m = (err as { message?: string })?.message
  return m || (err ? JSON.stringify(err) : 'unknown')
}

export function CaptchaPage() {
  const { t } = useTranslation()
  const [status, setStatus] = useState(t('captcha.loading_config'))
  const [hint, setHint] = useState('')
  const [started, setStarted] = useState(false)
  const cfgRef = useRef<CaptchaConfig | null>(null)
  const startedRef = useRef(false)
  const attemptsRef = useRef(0)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        await loadSdk()
      } catch (e) {
        if (alive) setStatus(errMsg(e))
        return
      }
      try {
        const cfg = await api<CaptchaConfig>('GET', '/captcha/config')
        cfgRef.current = cfg
        if (!alive) return
        setStatus(
          t('captcha.config_status', {
            scene: cfg.sceneId || '-',
            region: cfg.region || '-',
            enabled: cfg.enabled ? t('captcha.enabled') : t('captcha.disabled'),
          }),
        )
        setHint(t('captcha.hint_ready'))
      } catch (e) {
        if (alive) setStatus(t('captcha.load_failed', { error: errMsg(e) }))
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  function reset() {
    startedRef.current = false
    setStarted(false)
  }

  function start() {
    const cfg = cfgRef.current
    if (!cfg || !window.initAliyunCaptcha || startedRef.current) return
    startedRef.current = true
    attemptsRef.current = 0
    setStarted(true)
    setHint(t('captcha.hint_running'))
    window.initAliyunCaptcha({
      SceneId: cfg.sceneId,
      mode: 'popup',
      region: cfg.region,
      prefix: cfg.prefix,
      element: '#cap',
      button: '#btn',
      captchaLogoImg: '',
      showErrorTip: false,
      getInstance: (inst) => {
        /* SDK 驗證失敗後會銷毀重建實例，並以 undefined 回呼本函數，必須防護 */
        if (!inst) return
        if (attemptsRef.current >= 3) {
          toast.error(t('captcha.too_many_attempts'))
          setHint(t('captcha.hint_attempts_exhausted'))
          reset()
          return
        }
        attemptsRef.current++
        try {
          const method = inst.startTracelessVerification ?? inst.show
          method?.call(inst)
        } catch (e) {
          toast.error(t('captcha.start_failed', { error: errMsg(e) }))
          reset()
        }
      },
      success: async (param) => {
        try {
          await api('POST', '/captcha/submit', { verify_param: param })
          toast.success(t('captcha.submitted'))
          setHint(t('captcha.hint_submitted'))
        } catch (e) {
          toast.error(t('captcha.submit_failed', { error: errMsg(e) }))
          setHint(t('captcha.hint_submit_failed'))
        }
        reset()
      },
      fail: (err) => {
        toast.error(t('captcha.verify_failed', { error: errText(err) }))
        setHint(t('captcha.hint_verify_failed'))
        reset()
      },
      onError: (err) => {
        toast.error(t('captcha.init_failed', { error: errText(err) }))
        reset()
      },
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      {/* 頁首 */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t('captcha.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('captcha.subtitle')}
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">{status}</p>
          <div id="cap" />
          <Button id="btn" className="h-10 w-full" disabled={started} onClick={start}>
            {t('captcha.start')}
          </Button>
          {hint ? <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}
