/* 系統設定頁：分頁籤 + 多欄位佈局。
 *
 * 分成「鑑權」「訪客提交」「使用說明」三個分頁：三組設定彼此獨立，混在單欄
 * 長表單裡要捲很久才能找到目標欄位，而它們的修改時機也完全不同（鑑權是初始
 * 配置，訪客提交是對外開放與否的開關）。
 *
 * 欄位以兩欄網格排列（窄螢幕自動堆疊）：標籤、說明、輸入框為一組，說明放在
 * 標籤下方而非輸入框下方，因為它解釋的是「這個欄位是什麼」而不是輸入格式。 */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { KeyRound, Loader2, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { adminKey } from '@/lib/admin-key'
import { api, errMsg } from '@/lib/api'
import type { SettingsResponse } from '@/lib/types'

export function SettingsPage() {
  const { t } = useTranslation()
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<SettingsResponse>('GET', '/settings'),
  })

  const [adminKeyInput, setAdminKeyInput] = useState('')
  const [gatewayKey, setGatewayKey] = useState('')
  const [quotaInterval, setQuotaInterval] = useState('60')
  const [inviteCode, setInviteCode] = useState('')
  const [capInstance, setCapInstance] = useState('')
  const [capSiteKey, setCapSiteKey] = useState('')
  const [capSecret, setCapSecret] = useState('')
  const [showKeys, setShowKeys] = useState(false)
  const [saving, setSaving] = useState(false)

  /* 載入完成後填入表單（僅在尚未編輯時同步） */
  useEffect(() => {
    if (!data) return
    setAdminKeyInput(data.admin_key || '')
    setGatewayKey(data.gateway_key || '')
    setQuotaInterval(String(data.quota_refresh_interval ?? 60))
    setInviteCode(data.guest_invite_code || '')
    setCapInstance(data.cap_instance || '')
    setCapSiteKey(data.cap_site_key || '')
    setCapSecret(data.cap_secret || '')
  }, [data])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!adminKeyInput.trim()) {
      toast.error(t('settings.admin_key_required'))
      return
    }
    if (!gatewayKey.trim()) {
      toast.error(t('settings.gateway_key_required'))
      return
    }
    const interval = parseInt(quotaInterval, 10)
    if (isNaN(interval) || interval < 0) {
      toast.error(t('settings.invalid_interval'))
      return
    }
    setSaving(true)
    try {
      await api('PUT', '/settings', {
        admin_key: adminKeyInput.trim(),
        gateway_key: gatewayKey.trim(),
        quota_refresh_interval: interval,
        guest_invite_code: inviteCode.trim(),
        cap_instance: capInstance.trim(),
        cap_site_key: capSiteKey.trim(),
        cap_secret: capSecret.trim(),
      })
      /* 同步本機儲存的密鑰，避免改密後被登出 */
      await adminKey.set(adminKeyInput.trim())
      toast.success(t('common.saved'))
    } catch (err) {
      toast.error(t('common.save_failed', { error: errMsg(err) }))
    } finally {
      setSaving(false)
    }
  }

  /* 人機驗證三項的填寫狀態，決定下方提示的內容 */
  const capFilled = [capInstance, capSiteKey, capSecret].filter((v) => v.trim()).length
  const capEndpoint = capInstance.trim() && capSiteKey.trim()
    ? `${capInstance.trim().replace(/\/+$/, '')}/${capSiteKey.trim().replace(/^\/+|\/+$/g, '')}/siteverify`
    : ''

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      {/* 頁首 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('settings.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('settings.subtitle')}</p>
        </div>
        <Button type="submit" form="settings-form" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {t('settings.save')}
        </Button>
      </div>

      <form id="settings-form" onSubmit={save}>
        <Tabs defaultValue="auth" className="gap-5">
          <TabsList className="w-full">
            <TabsTrigger value="auth" className="flex-1">
              <KeyRound className="size-3.5" />
              {t('settings.tab_auth')}
            </TabsTrigger>
            <TabsTrigger value="guest" className="flex-1">
              <UserCheck className="size-3.5" />
              {t('settings.tab_guest')}
            </TabsTrigger>
            <TabsTrigger value="help" className="flex-1">
              {t('settings.tab_help')}
            </TabsTrigger>
          </TabsList>

          {/* ── 鑑權 ── */}
          <TabsContent value="auth">
            <Card>
              <CardContent className="flex flex-col gap-5">
                <SectionHead title={t('settings.auth_title')} desc={t('settings.auth_desc')} />
                <FieldGrid>
                  <Field
                    id="set-admin-key"
                    label={t('settings.admin_key_label')}
                    hint={t('settings.admin_key_hint')}
                  >
                    <Input
                      id="set-admin-key"
                      type={showKeys ? 'text' : 'password'}
                      value={adminKeyInput}
                      onChange={(e) => setAdminKeyInput(e.target.value)}
                    />
                  </Field>
                  <Field
                    id="set-gateway-key"
                    label={t('settings.gateway_key_label')}
                    hint={
                      <>
                        {t('settings.gateway_key_hint_intro')}{' '}
                        <Code>/v1/messages</Code>、<Code>/async/v1/*</Code>、
                        <Code>/v1/models</Code> {t('settings.gateway_key_hint_require')}{' '}
                        <Code>Authorization: Bearer &lt;key&gt;</Code>{' '}
                        {t('settings.gateway_key_hint_or')} <Code>x-api-key</Code>
                        {t('settings.gateway_key_hint_suffix')}
                      </>
                    }
                  >
                    <Input
                      id="set-gateway-key"
                      type={showKeys ? 'text' : 'password'}
                      value={gatewayKey}
                      onChange={(e) => setGatewayKey(e.target.value)}
                    />
                  </Field>
                </FieldGrid>
                <Field
                  id="set-quota-interval"
                  label={t('settings.quota_interval_label')}
                  hint={t('settings.quota_interval_hint')}
                >
                  <Input
                    id="set-quota-interval"
                    type="number"
                    min={0}
                    step={5}
                    value={quotaInterval}
                    onChange={(e) => setQuotaInterval(e.target.value)}
                  />
                </Field>
                <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox checked={showKeys} onCheckedChange={(v) => setShowKeys(v === true)} />
                  {t('settings.show_keys')}
                </label>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── 訪客提交 ── */}
          <TabsContent value="guest" className="flex flex-col gap-5">
            <Card>
              <CardContent className="flex flex-col gap-5">
                <SectionHead title={t('settings.guest_title')} desc={t('settings.guest_desc')} />
                <Field
                  id="set-invite-code"
                  label={t('settings.invite_code_label')}
                  hint={
                    <>
                      {t('settings.invite_code_hint_intro')} <Code>/guest</Code>{' '}
                      {t('settings.invite_code_hint_open')}
                      <span className="font-medium text-foreground">
                        {t('settings.invite_code_hint_closed')}
                      </span>
                      {t('settings.invite_code_hint_suffix')}
                    </>
                  }
                >
                  <Input
                    id="set-invite-code"
                    type={showKeys ? 'text' : 'password'}
                    value={inviteCode}
                    placeholder={t('settings.invite_code_placeholder')}
                    onChange={(e) => setInviteCode(e.target.value)}
                  />
                </Field>
                <p className="text-xs text-muted-foreground">
                  {t('settings.guest_note')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex flex-col gap-5">
                <SectionHead title={t('settings.cap_title')} desc={t('settings.cap_desc')} />
                <FieldGrid>
                  <Field
                    id="set-cap-instance"
                    label={t('settings.cap_instance_label')}
                    hint={
                      <>
                        {t('settings.cap_instance_hint_intro')}{' '}
                        <Code>https://cap.example.com</Code>
                        {t('settings.cap_instance_hint_suffix')}
                      </>
                    }
                  >
                    <Input
                      id="set-cap-instance"
                      type="text"
                      value={capInstance}
                      placeholder="https://cap.example.com"
                      onChange={(e) => setCapInstance(e.target.value)}
                    />
                  </Field>
                  <Field
                    id="set-cap-site-key"
                    label="Site Key"
                    hint={
                      <>
                        {t('settings.cap_site_key_hint_intro')}{' '}
                        <Code>d9256640cb53</Code>
                        {t('settings.cap_site_key_hint_suffix')}
                      </>
                    }
                  >
                    <Input
                      id="set-cap-site-key"
                      type="text"
                      value={capSiteKey}
                      placeholder="d9256640cb53"
                      onChange={(e) => setCapSiteKey(e.target.value)}
                    />
                  </Field>
                </FieldGrid>
                <Field
                  id="set-cap-secret"
                  label={t('settings.cap_secret_label')}
                  hint={
                    <>
                      {t('settings.cap_secret_hint_intro')}
                      <span className="font-medium text-foreground">
                        {t('settings.cap_secret_hint_not')}
                      </span>
                      {t('settings.cap_secret_hint_suffix')}
                    </>
                  }
                >
                  <Input
                    id="set-cap-secret"
                    type={showKeys ? 'text' : 'password'}
                    value={capSecret}
                    onChange={(e) => setCapSecret(e.target.value)}
                  />
                </Field>

                <div
                  className={
                    'rounded-lg px-3 py-2 text-xs ' +
                    (capFilled === 0 || capFilled === 3
                      ? 'bg-muted/50 text-muted-foreground'
                      : 'bg-destructive/10 text-destructive')
                  }
                >
                  {capFilled === 3 ? (
                    <>
                      {t('settings.cap_enabled_hint')}
                      <code className="ml-1 break-all rounded bg-muted px-1 font-mono">
                        {capEndpoint}
                      </code>
                    </>
                  ) : capFilled === 0 ? (
                    t('settings.cap_disabled_hint')
                  ) : (
                    t('settings.cap_partial_hint', { filled: capFilled })
                  )}
                </div>
                <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox checked={showKeys} onCheckedChange={(v) => setShowKeys(v === true)} />
                  {t('settings.show_keys_guest')}
                </label>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── 使用說明 ── */}
          <TabsContent value="help">
            <Card>
              <CardContent className="flex flex-col gap-3">
                <SectionHead title={t('settings.help_title')} desc={t('settings.help_desc')} />
                <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground marker:text-muted-foreground/60">
                  <li>{t('settings.help_item_1')}</li>
                  <li>{t('settings.help_item_2')}</li>
                  <li>{t('settings.help_item_3')}</li>
                  <li>
                    {t('settings.help_endpoint_prefix')}
                    <Code>{location.origin}/v1/messages</Code>
                    {t('settings.help_endpoint_suffix')}
                  </li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </form>
    </div>
  )
}

/* ── 佈局小元件 ─────────────────────────────────────────────────────────── */

/* SectionHead 區段標題：標題 + 一句說明，讓每張卡片自解釋 */
function SectionHead({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground">{desc}</div>
    </div>
  )
}

/* FieldGrid 兩欄網格：窄螢幕自動堆疊為單欄 */
function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-5 sm:grid-cols-2">{children}</div>
}

/* Field 單一欄位：標籤、說明、輸入框為一組。
   說明置於標籤下方而非輸入框下方——它解釋的是欄位用途，不是輸入格式。 */
function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="text-xs leading-relaxed text-muted-foreground">{hint}</div>
      {children}
    </div>
  )
}

/* Code 行內程式碼片段，統一後台各處的呈現 */
function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-muted px-1 font-mono text-[11px]">{children}</code>
}
