/* 代理設定頁：線路清單、目前出口測試、新增／編輯／刪除／測試線路 */
import { Activity, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { useConfirm } from '@/components/confirm'
import { Empty, PanelCard } from '@/components/panel'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, errMsg } from '@/lib/api'
import { proxyScheme } from '@/lib/format'
import type { EgressInfo, ProxyProfile } from '@/lib/types'

interface ProxiesResponse {
  profiles: ProxyProfile[]
}

/* 目前出口測試狀態 */
type CurrentResult =
  | { state: 'idle' }
  | { state: 'testing' }
  | { state: 'ok'; main: string; sub: string }
  | { state: 'error'; text: string }

/* 單線路測試結果 */
interface RowResult {
  state: 'testing' | 'ok' | 'error'
  text: string
}

function maskUrl(url: string): string {
  return String(url || '').replace(/\/\/([^@/]+)@/, '//***@')
}

function formatProbe(d: EgressInfo): string {
  return [d.ip, d.asn, d.operator, d.latency_ms != null ? d.latency_ms + ' ms' : ''].filter(Boolean).join(' · ')
}

function countryLabel(d: EgressInfo): string {
  return [d.country_code, d.country].filter(Boolean).join(' ')
}

export function ProxiesPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { confirm, element: confirmElement } = useConfirm()

  const { data } = useQuery({
    queryKey: ['proxies'],
    queryFn: () => api<ProxiesResponse>('GET', '/proxies'),
  })
  const profiles = data?.profiles ?? []

  const [current, setCurrent] = useState<CurrentResult>({ state: 'idle' })
  const [testingCurrent, setTestingCurrent] = useState(false)
  const [rowResults, setRowResults] = useState<Record<string, RowResult>>({})

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['proxies'] })
  }

  function openModal(p?: ProxyProfile) {
    setEditingId(p?.id ?? '')
    setName(p?.name ?? '')
    setUrl(p?.url ?? '')
    setModalOpen(true)
  }

  async function save() {
    if (!url.trim()) {
      toast.error(t('proxies.url_required'))
      return
    }
    setSaving(true)
    try {
      await api(editingId ? 'PUT' : 'POST', editingId ? '/proxies/' + encodeURIComponent(editingId) : '/proxies', {
        name: name.trim(),
        url: url.trim(),
        enabled: true,
      })
      setModalOpen(false)
      toast.success(editingId ? t('proxies.updated') : t('proxies.created'))
      invalidate()
    } catch (e) {
      toast.error(t('proxies.save_failed', { msg: errMsg(e) }))
    } finally {
      setSaving(false)
    }
  }

  function deleteProxy(p: ProxyProfile) {
    confirm({
      title: t('proxies.delete_title'),
      danger: true,
      description: (
        <>
          {t('proxies.delete_desc_before')} <code className="rounded bg-muted px-1 py-0.5">{p.name}</code>
          {t('proxies.delete_desc_after')}
        </>
      ),
      onConfirm: async () => {
        try {
          await api('DELETE', '/proxies/' + encodeURIComponent(p.id))
          toast.success(t('proxies.deleted'))
          invalidate()
        } catch (e) {
          toast.error(t('proxies.delete_failed', { msg: errMsg(e) }))
        }
      },
    })
  }

  async function testProxy(p: ProxyProfile) {
    setRowResults((m) => ({ ...m, [p.id]: { state: 'testing', text: t('proxies.testing_row') } }))
    try {
      const d = await api<EgressInfo>('POST', '/proxies/' + encodeURIComponent(p.id) + '/test')
      setRowResults((m) => ({ ...m, [p.id]: { state: 'ok', text: formatProbe(d) } }))
      toast.success(t('proxies.test_ok'))
    } catch (e) {
      setRowResults((m) => ({ ...m, [p.id]: { state: 'error', text: errMsg(e) } }))
      toast.error(t('proxies.test_failed', { msg: errMsg(e) }))
    }
  }

  async function testCurrentLine() {
    setTestingCurrent(true)
    setCurrent({ state: 'testing' })
    try {
      const d = await api<EgressInfo>('POST', '/proxies/test-current')
      setCurrent({
        state: 'ok',
        main: [d.ip, d.asn, d.operator].filter(Boolean).join(' · '),
        sub: [countryLabel(d), d.latency_ms != null ? d.latency_ms + ' ms' : '', d.source ? t('proxies.source', { source: d.source }) : '']
          .filter(Boolean)
          .join(' · '),
      })
      toast.success(t('proxies.current_test_ok'))
    } catch (e) {
      setCurrent({ state: 'error', text: errMsg(e) })
      toast.error(t('proxies.current_test_failed', { msg: errMsg(e) }))
    } finally {
      setTestingCurrent(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* 頁首 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('proxies.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('proxies.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void testCurrentLine()} disabled={testingCurrent}>
            <Activity /> {t('proxies.test_current')}
          </Button>
          <Button size="sm" onClick={() => openModal()}>
            <Plus /> {t('proxies.add')}
          </Button>
        </div>
      </div>

      {/* 伺服器目前出口 */}
      <div
        aria-live="polite"
        className={
          'flex items-center gap-3 rounded-xl border bg-card px-4 py-3 ' +
          (current.state === 'error' ? 'border-destructive/40' : '')
        }
      >
        <span
          className={
            'size-2.5 shrink-0 rounded-full ' +
            (current.state === 'ok'
              ? 'bg-emerald-500'
              : current.state === 'error'
                ? 'bg-red-500'
                : current.state === 'testing'
                  ? 'animate-pulse bg-amber-500'
                  : 'bg-muted-foreground/30')
          }
        />
        <div className="min-w-0 flex-1 leading-tight">
          <span className="block text-xs text-muted-foreground">{t('proxies.current_egress')}</span>
          <strong className="block truncate text-sm">
            {current.state === 'ok'
              ? current.main
              : current.state === 'testing'
                ? t('proxies.querying')
                : current.state === 'error'
                  ? t('proxies.query_failed')
                  : t('proxies.not_tested')}
          </strong>
          <small className="block truncate text-xs text-muted-foreground">
            {current.state === 'ok'
              ? current.sub
              : current.state === 'testing'
                ? t('proxies.querying_ip')
                : current.state === 'error'
                  ? current.text
                  : t('proxies.query_hint')}
          </small>
        </div>
      </div>

      {/* 線路清單＋連線格式說明 */}
      <div className="grid gap-4 lg:grid-cols-5">
        <PanelCard title={t('proxies.list_title')} subtitle={t('proxies.list_subtitle')} badge={t('proxies.profile_count', { n: profiles.length })} className="lg:col-span-3">
          {profiles.length ? (
            <div className="flex flex-col divide-y">
              {profiles.map((p) => {
                const result = rowResults[p.id]
                return (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&>svg]:size-4">
                      <Activity />
                    </span>
                    <div className="min-w-0 flex-1 leading-tight">
                      <strong className="block truncate text-sm">{p.name}</strong>
                      <small className="block truncate font-mono text-xs text-muted-foreground">{maskUrl(p.url)}</small>
                      {result && (
                        <em
                          className={
                            'mt-0.5 block truncate text-xs not-italic ' +
                            (result.state === 'ok'
                              ? 'text-emerald-600'
                              : result.state === 'error'
                                ? 'text-destructive'
                                : 'text-muted-foreground')
                          }
                        >
                          {result.text}
                        </em>
                      )}
                    </div>
                    <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">{proxyScheme(p.url)}</span>
                    <span
                      className={
                        'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ' +
                        (p.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground')
                      }
                    >
                      <span className={'size-1.5 rounded-full ' + (p.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/50')} />
                      {p.enabled ? t('proxies.state_enabled') : t('proxies.state_disabled')}
                    </span>
                    <span className="flex gap-0.5">
                      <Button variant="ghost" size="icon-sm" title={t('proxies.test_line')} onClick={() => void testProxy(p)}>
                        <Activity />
                      </Button>
                      <Button variant="ghost" size="icon-sm" title={t('common.edit')} onClick={() => openModal(p)}>
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        title={t('common.delete')}
                        onClick={() => deleteProxy(p)}
                      >
                        <Trash2 />
                      </Button>
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <Empty>{t('proxies.empty')}</Empty>
          )}
        </PanelCard>

        <PanelCard title={t('proxies.format_title')} subtitle={t('proxies.format_subtitle')} className="lg:col-span-2">
          <div className="flex flex-col gap-3">
            {(
              [
                ['HTTP', 'http://host:port', 'bg-blue-100 text-blue-700'],
                ['S5', 'socks5://host:port', 'bg-violet-100 text-violet-700'],
                ['AUTH', 'http://user:pass@host:port', 'bg-amber-100 text-amber-700'],
              ] as [string, string, string][]
            ).map(([mark, sample, cls]) => (
              <div key={mark} className="flex items-center gap-3">
                <span className={'w-12 shrink-0 rounded-md px-2 py-1 text-center text-xs font-semibold ' + cls}>{mark}</span>
                <code className="truncate rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs">{sample}</code>
              </div>
            ))}
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              {t('proxies.format_note')}
            </p>
          </div>
        </PanelCard>
      </div>

      {/* 新增／編輯代理對話框 */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? t('proxies.edit_modal_title') : t('proxies.add_modal_title')}</DialogTitle>
            <DialogDescription>{t('proxies.modal_desc')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="proxy-name">{t('proxies.name_label')}</Label>
              <Input id="proxy-name" placeholder={t('proxies.name_placeholder')} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="proxy-url">{t('proxies.url_label')}</Label>
              <Input
                id="proxy-url"
                placeholder={t('proxies.url_placeholder')}
                autoComplete="off"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t('proxies.accept_note')}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>{t('common.cancel')}</Button>
            <Button disabled={saving} onClick={() => void save()}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmElement}
    </div>
  )
}
