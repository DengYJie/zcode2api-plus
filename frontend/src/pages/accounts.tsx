/* 帳號池頁：統計卡、篩選、帳號明細表與新增／編輯對話框（輪詢 5 秒） */
import {
  Archive,
  ArchiveRestore,
  Copy,
  Download,
  Gift,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
  Users,
  XCircle,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useConfirm } from '@/components/confirm'
import { PlanRows, QuotaRows, allPlansExpired } from '@/components/quota-rows'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { api, errMsg } from '@/lib/api'
import { fmt, fmtCompact, fmtDate, normalizeModel, proxyScheme } from '@/lib/format'
import { type Account, type AccountStatus, type AccountsResponse, type ProxyProfile } from '@/lib/types'

/* 頂層「直連」的 Select 哨兵值：Radix Select 不允許空字串 value */
const PROXY_DIRECT = '__direct__'
const PROXY_LEGACY = '__legacy__'

const STATUS_BADGE: Record<AccountStatus, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  exhausted: 'bg-purple-100 text-purple-700',
  cooling: 'bg-amber-100 text-amber-700',
  invalid: 'bg-red-100 text-red-700',
  disabled: 'bg-muted text-muted-foreground',
}

type FilterKey = 'all' | AccountStatus

export function AccountsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { confirm, element: confirmElement } = useConfirm()
  const fileRef = useRef<HTMLInputElement>(null)

  const { data } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api<AccountsResponse>('GET', '/accounts'),
    refetchInterval: 5000,
  })

  const allAccounts = data?.accounts ?? []
  /* 已归档账号独立展示：不计入统计、不参与筛选，只在归档区列出 */
  const archivedAccounts = allAccounts.filter((a) => a.archived_at != null)
  const liveAccounts = allAccounts.filter((a) => a.archived_at == null)
  const proxies = data?.proxies ?? []
  const availableModels = data?.models ?? []

  const [filter, setFilter] = useState<FilterKey>('all')
  const [showArchived, setShowArchived] = useState(false)
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set())

  /* 新增對話框 */
  const [addOpen, setAddOpen] = useState(false)
  const [addTab, setAddTab] = useState<'login' | 'paste'>('login')
  const [addProvider, setAddProvider] = useState<'zai' | 'bigmodel'>('zai')
  const [tokensText, setTokensText] = useState('')
  const [addProxy, setAddProxy] = useState(PROXY_DIRECT)
  const [adding, setAdding] = useState(false)
  /* 授權登入流程狀態 */
  const [flow, setFlow] = useState<{ flowId: string; url: string } | null>(null)
  const [callbackUrl, setCallbackUrl] = useState('')
  const [loginStatus, setLoginStatus] = useState('')
  const [loginErr, setLoginErr] = useState(false)
  const [starting, setStarting] = useState(false)
  const [completing, setCompleting] = useState(false)

  /* 編輯對話框 */
  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState('')
  const [editName, setEditName] = useState('')
  const [editToken, setEditToken] = useState('')
  const [editProxy, setEditProxy] = useState(PROXY_DIRECT)
  const [editLegacy, setEditLegacy] = useState(false)
  const [editModels, setEditModels] = useState<string[]>([])
  const [editModelOptions, setEditModelOptions] = useState<[string, string][]>([])
  const [saving, setSaving] = useState(false)

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['accounts'] })
  }

  /* ── 統計計算（語義照搬舊版 renderStats） ── */
  let totalRem = 0
  let totalQuota = 0
  liveAccounts.forEach((a) => {
    Object.values(a.quota || {}).forEach((w) => {
      totalRem += Number(w.remaining) || 0
      totalQuota += Number(w.total) || 0
    })
  })
  const quotaPct = totalQuota > 0 ? Math.max(0, Math.min(100, (totalRem / totalQuota) * 100)) : 0
  const quotaColor = quotaPct <= 15 ? '#ef4444' : quotaPct <= 40 ? '#f59e0b' : '#22c55e'
  const stats = data?.stats

  /* ── 篩選（歸檔帳號不參與） ── */
  const counts: Record<string, number> = { all: liveAccounts.length, exhausted: 0, disabled: 0 }
  liveAccounts.forEach((a) => {
    counts[a.status] = (counts[a.status] || 0) + 1
  })
  const filtered = filter === 'all' ? liveAccounts : liveAccounts.filter((a) => a.status === filter)

  /* ── 新增 ── */
  function openAdd() {
    setTokensText('')
    setAddProxy(PROXY_DIRECT)
    setAddTab('login')
    setAddProvider('zai')
    setFlow(null)
    setCallbackUrl('')
    setLoginStatus('')
    setLoginErr(false)
    setAddOpen(true)
  }

  async function doAdd() {
    const list = tokensText.split('\n').map((s) => s.trim()).filter(Boolean)
    if (!list.length) {
      toast.error(t('accounts.token_required'))
      return
    }
    setAdding(true)
    try {
      const d = await api<{ count: number }>('POST', '/accounts', {
        tokens: list,
        provider: addProvider,
        proxy_id: addProxy === PROXY_DIRECT ? null : addProxy,
      })
      setAddOpen(false)
      toast.success(t('accounts.added', { count: d.count }))
      invalidate()
    } catch (e) {
      toast.error(t('accounts.add_failed', { msg: errMsg(e) }))
    } finally {
      setAdding(false)
    }
  }

  async function startLogin() {
    setStarting(true)
    try {
      const d = await api<{ flow_id: string; authorize_url: string }>('POST', '/login/start', {
        provider: addProvider,
      })
      setFlow({ flowId: d.flow_id, url: d.authorize_url })
      setLoginStatus(
        addProvider === 'bigmodel'
          ? t('accounts.login_started_bigmodel')
          : t('accounts.login_started_zai'),
      )
      setLoginErr(false)
    } catch (e) {
      toast.error(t('accounts.login_start_failed', { msg: errMsg(e) }))
    } finally {
      setStarting(false)
    }
  }

  function copyLoginUrl() {
    if (!flow) return
    navigator.clipboard
      .writeText(flow.url)
      .then(() => toast.success(t('common.copied')))
      .catch(() => toast.error(t('common.copy_failed')))
  }

  function openLoginUrl() {
    if (flow) window.open(flow.url, '_blank', 'noopener')
  }

  async function completeLogin() {
    if (!flow) {
      toast.error(t('accounts.login_required'))
      return
    }
    const url = callbackUrl.trim()
    if (!url) {
      toast.error(t('accounts.callback_required'))
      return
    }
    setCompleting(true)
    setLoginStatus(t('accounts.verifying'))
    setLoginErr(false)
    try {
      const d = await api<{ status: string; message?: string }>(
        'POST',
        '/login/complete/' + encodeURIComponent(flow.flowId),
        { callback_url: url },
      )
      if (d.status !== 'ready') throw new Error(d.message || t('accounts.auth_invalid'))
      toast.success(t('accounts.login_success'))
      setAddOpen(false)
      invalidate()
    } catch (e) {
      setLoginStatus(errMsg(e) || t('accounts.login_complete_failed'))
      setLoginErr(true)
    } finally {
      setCompleting(false)
    }
  }

  /* ── 編輯 ── */
  function openEdit(a: Account) {
    setEditId(a.id)
    setEditName(a.name || '')
    setEditToken('')
    setEditLegacy(Boolean(a.proxy_url && !a.proxy_id))
    setEditProxy(a.proxy_id || (a.proxy_url && !a.proxy_id ? PROXY_LEGACY : PROXY_DIRECT))
    /* 可設定模型：全域模型清單＋該帳號額度模型＋已停用模型，正規化去重 */
    const models = new Map<string, string>()
    const quotaModels = Object.entries(a.quota || {}).map(([k, w]) => w.model || k)
    ;[...availableModels, ...quotaModels, ...(a.disabled_models || [])].forEach((model) => {
      const key = normalizeModel(model)
      if (key && !models.has(key)) models.set(key, String(model))
    })
    setEditModelOptions([...models])
    const disabled = new Set((a.disabled_models || []).map(normalizeModel))
    setEditModels([...disabled])
    setEditOpen(true)
  }

  async function doEdit() {
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: editName.trim(),
        disabled_models: editModels,
        ...(editToken.trim() && { token: editToken.trim() }),
      }
      if (editProxy !== PROXY_LEGACY) payload.proxy_id = editProxy === PROXY_DIRECT ? null : editProxy
      await api('PUT', '/accounts/' + editId, payload)
      setEditOpen(false)
      toast.success(t('common.saved'))
      invalidate()
    } catch (e) {
      toast.error(t('accounts.save_failed', { msg: errMsg(e) }))
    } finally {
      setSaving(false)
    }
  }

  /* ── 列操作 ── */
  function doDelete(a: Account) {
    const label = a.email || a.name || a.id
    confirm({
      title: t('accounts.delete_title'),
      danger: true,
      description: (
        <>
          {t('accounts.delete_confirm_prefix')}<code className="rounded bg-muted px-1 py-0.5">{label}</code>{t('accounts.delete_confirm_suffix')}
        </>
      ),
      onConfirm: async () => {
        try {
          // 后端对「ID 不存在」也回 200（deleted: 0），此时报成功会让管理员
          // 以为凭证已撤销。按实际删除数提示。
          const res = await api<{ deleted: number }>('DELETE', '/accounts', [a.id])
          if (!res.deleted) {
            toast.warning(t('accounts.not_found_or_deleted'))
          } else {
            toast.success(t('common.deleted'))
          }
          invalidate()
        } catch (e) {
          toast.error(t('accounts.delete_failed', { msg: errMsg(e) }))
        }
      },
    })
  }

  async function toggleEnabled(a: Account) {
    try {
      await api('POST', '/accounts/' + a.id + '/enabled', { enabled: a.status === 'disabled' })
      invalidate()
    } catch (e) {
      toast.error(t('accounts.operation_failed', { msg: errMsg(e) }))
    }
  }

  /* ── 歸檔 ┐─ 歸檔＝停止調用，帳號移入歸檔區僅保留記錄 */
  function doArchive(a: Account) {
    const label = a.email || a.name || a.id
    confirm({
      title: t('accounts.archive_title'),
      description: (
        <>
          {t('accounts.archive_confirm_prefix')}<code className="rounded bg-muted px-1 py-0.5">{label}</code>
          {t('accounts.archive_confirm_suffix')}
        </>
      ),
      onConfirm: async () => {
        try {
          await api('POST', '/accounts/' + a.id + '/archived', { archived: true })
          toast.success(t('accounts.archived'))
          invalidate()
        } catch (e) {
          toast.error(t('accounts.archive_failed', { msg: errMsg(e) }))
        }
      },
    })
  }

  async function doRestore(a: Account) {
    try {
      await api('POST', '/accounts/' + a.id + '/archived', { archived: false })
      toast.success(t('accounts.restored'))
      invalidate()
    } catch (e) {
      toast.error(t('accounts.restore_failed', { msg: errMsg(e) }))
    }
  }

  /* ── 郵箱複製 ── */
  async function copyEmail(a: Account) {
    const text = a.email || a.name || a.id
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('accounts.email_copied', { text }))
    } catch {
      toast.error(t('common.copy_failed'))
    }
  }

  async function refreshOne(a: Account) {
    if (refreshing.has(a.id)) return
    setRefreshing((s) => new Set(s).add(a.id))
    try {
      await api('POST', '/accounts/' + a.id + '/refresh')
      toast.success(t('accounts.quota_refreshed'))
    } catch (e) {
      toast.error(t('accounts.refresh_failed', { msg: errMsg(e) }))
    } finally {
      setRefreshing((s) => {
        const next = new Set(s)
        next.delete(a.id)
        return next
      })
      invalidate()
    }
  }

  async function refreshAll() {
    toast.info(t('accounts.refreshing_all'))
    try {
      const d = await api<{ summary: { ok: number; fail: number } }>('POST', '/accounts/refresh', { all: true })
      toast.success(t('accounts.refresh_done', { ok: d.summary.ok, fail: d.summary.fail }))
      invalidate()
    } catch (e) {
      toast.error(t('accounts.refresh_failed', { msg: errMsg(e) }))
    }
  }

  /* ── 套餐領取 ── */
  const [claiming, setClaiming] = useState<Set<string>>(new Set())

  function claimOutcomeToast(name: string, d: { outcomes: { ok: boolean; message?: string }[]; summary: { ok: number; fail: number } }) {
    for (const o of d.outcomes.filter((x) => !x.ok)) {
      toast.warning(t('accounts.claim_one_failed', { name, msg: o.message ?? t('accounts.unknown_reason') }))
    }
    toast.success(t('accounts.claim_done_one', { name, ok: d.summary.ok, fail: d.summary.fail }))
    invalidate()
  }

  async function claimOne(a: Account) {
    if (claiming.has(a.id)) return
    setClaiming((s) => new Set(s).add(a.id))
    toast.info(t('accounts.claiming_one', { name: a.email || a.name || a.id }))
    try {
      const d = await api<{ outcomes: { ok: boolean; message?: string }[]; summary: { ok: number; fail: number } }>(
        'POST', '/claim', { account_ids: [a.id] },
      )
      claimOutcomeToast(a.email || a.name || a.id, d)
    } catch (e) {
      toast.error(t('accounts.claim_failed', { msg: errMsg(e) }))
    } finally {
      setClaiming((s) => {
        const next = new Set(s)
        next.delete(a.id)
        return next
      })
    }
  }

  async function claimAll() {
    confirm({
      title: t('accounts.claim_title'),
      description: t('accounts.claim_description'),
      onConfirm: async () => {
        toast.info(t('accounts.claiming_all'))
        try {
          const d = await api<{ outcomes: { account_name?: string; ok: boolean; message?: string }[]; summary: { ok: number; fail: number } }>('POST', '/claim', {})
          for (const o of d.outcomes.filter((x) => !x.ok)) {
            toast.warning(t('accounts.claim_one_failed', { name: o.account_name ?? '', msg: o.message ?? t('accounts.unknown_reason') }))
          }
          toast.success(t('accounts.claim_done_all', { ok: d.summary.ok, fail: d.summary.fail }))
          invalidate()
        } catch (e) {
          toast.error(t('accounts.claim_failed', { msg: errMsg(e) }))
        }
      },
    })
  }

  function resetStats(a: Account) {
    const label = a.email || a.name || a.id
    confirm({
      title: t('accounts.reset_stats_title'),
      danger: true,
      description: (
        <>
          {t('accounts.reset_confirm_prefix')}<code className="rounded bg-muted px-1 py-0.5">{label}</code>{t('accounts.reset_confirm_suffix')}
        </>
      ),
      onConfirm: async () => {
        try {
          await api('POST', '/accounts/' + a.id + '/reset-stats')
          toast.success(t('accounts.stats_reset'))
          invalidate()
        } catch (e) {
          toast.error(t('accounts.reset_failed', { msg: errMsg(e) }))
        }
      },
    })
  }

  /* ── 匯入／匯出 ── */
  async function doExport() {
    try {
      const d = await api<unknown>('GET', '/export')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }))
      a.download = 'zcode-accounts.json'
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) {
      toast.error(t('accounts.export_failed', { msg: errMsg(e) }))
    }
  }

  async function onImportFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]
    if (!file) return
    try {
      const payload: unknown = JSON.parse(await file.text())
      const d = await api<{ count: number }>('POST', '/import', payload)
      toast.success(t('accounts.imported', { count: d.count }))
      invalidate()
    } catch (e) {
      toast.error(t('accounts.import_failed', { msg: errMsg(e) }))
    }
    ev.target.value = ''
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* 頁首 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('accounts.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('accounts.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
            {t('accounts.live_monitoring')}
          </span>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload data-slot="icon" /> {t('accounts.import')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void doExport()}>
            <Download /> {t('accounts.export')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void refreshAll()}>
            <RefreshCw /> {t('accounts.refresh_quota')}
          </Button>
          <Button variant="outline" size="sm" onClick={claimAll}>
            <Gift /> {t('accounts.claim_plans')}
          </Button>
          <Button
            variant={showArchived ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowArchived((v) => !v)}
          >
            <Archive /> {t('accounts.archive')}
            {archivedAccounts.length > 0 && (
              <span className="tabular-nums opacity-70">{archivedAccounts.length}</span>
            )}
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus /> {t('common.add')}
          </Button>
        </div>
      </div>
      <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => void onImportFile(e)} />

      {/* 帳號概覽 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCell label={t('accounts.stat_total')} value={fmt(stats?.total)} icon={<Users className="size-4" />} />
        <StatCell label={t('accounts.stat_active')} value={fmt(stats?.active)} color="#16a34a" icon={<span className="size-2 rounded-full bg-emerald-500" />} />
        <StatCell label={t('accounts.stat_exhausted')} value={fmt(stats?.exhausted)} color="#8d6bbd" icon={<span className="size-2 rounded-full bg-purple-500" />} />
        <Card>
          <CardContent className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              {t('accounts.total_quota')}
              <span className="size-2 rounded-full" style={{ background: quotaColor }} />
            </div>
            <div className="text-2xl font-semibold tabular-nums" style={{ color: '#4c9168' }}>
              {fmtCompact(totalRem)}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={quotaPct} aria-valuemin={0} aria-valuemax={100}>
              <span className="block h-full rounded-full" style={{ width: `${quotaPct}%`, background: quotaColor }} />
            </div>
            <div className="text-[11px] text-muted-foreground">
              {totalQuota ? t('accounts.quota_ratio', { rem: fmtCompact(totalRem), total: fmtCompact(totalQuota), pct: quotaPct.toFixed(1) }) : t('accounts.no_quota_data')}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1" title={t('accounts.tokens_tooltip', { in: fmt(stats?.tokens_in), out: fmt(stats?.tokens_out), cache: fmt(stats?.tokens_cache) })}>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              {t('accounts.total_tokens')}
              <span className="size-2 rounded-full bg-blue-500" />
            </div>
            <div className="text-2xl font-semibold tabular-nums" style={{ color: '#4c76b2' }}>
              {fmtCompact(Number(stats?.tokens_in) + Number(stats?.tokens_out))}
            </div>
            <div className="text-[11px] text-muted-foreground">{t('accounts.tokens_io', { in: fmtCompact(stats?.tokens_in), out: fmtCompact(stats?.tokens_out) })}</div>
          </CardContent>
        </Card>
      </div>

      {/* 明細標題＋篩選 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {t('accounts.details')} <Badge variant="secondary">{filtered.length}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {data ? t('accounts.updated_at', { time: new Date(data.ts * 1000).toLocaleTimeString('zh-TW') }) : ''}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', t('common.all')],
            ['exhausted', t('status.exhausted')],
            ['disabled', t('status.disabled')],
          ] as [FilterKey, string][]
        ).map(([k, l]) => (
          <Button
            key={k}
            size="sm"
            variant={filter === k ? 'default' : 'outline'}
            className="h-8 rounded-full"
            onClick={() => setFilter(k)}
          >
            {l}
            <span className="tabular-nums opacity-70">{counts[k] || 0}</span>
          </Button>
        ))}
      </div>

      {/* 帳號明細表 */}
      <Card>
        <CardContent className="overflow-x-auto px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-center">{t('accounts.col_account')}</TableHead>
                <TableHead className="w-20 text-center">{t('accounts.col_status')}</TableHead>
                <TableHead className="w-28 text-center">{t('accounts.col_proxy')}</TableHead>
                <TableHead className="min-w-56 text-center">{t('accounts.col_quota')}</TableHead>
                <TableHead className="w-16 text-center">{t('accounts.col_calls')}</TableHead>
                <TableHead className="w-16 text-center">{t('accounts.col_fails')}</TableHead>
                <TableHead className="w-24 text-center">Tokens</TableHead>
                <TableHead className="w-28 text-center">{t('accounts.col_last_used')}</TableHead>
                <TableHead className="w-44 text-center">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!filtered.length ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                    {t('accounts.empty')}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <EmailCell account={a} onCopy={() => void copyEmail(a)} />
                        {(a.disabled_models || []).length > 0 && (
                          <Badge variant="outline" className="shrink-0 text-[11px] font-normal" title={(a.disabled_models || []).join('、')}>
                            {t('accounts.disabled_models_count', { count: a.disabled_models.length })}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={STATUS_BADGE[a.status]}>{t('status.' + a.status)}</Badge>
                    </TableCell>
                    <TableCell>
                      {!a.proxy_url ? (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                          {t('accounts.direct')}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs">
                          <span className="size-1.5 rounded-full bg-emerald-500/70" />
                          {proxies.find((p) => p.id === a.proxy_id)?.name || t('accounts.legacy_proxy')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="min-w-56">
                      {allPlansExpired(a) ? (
                        <span className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                          <span className="size-1.5 rounded-full" style={{ background: '#c9c9cf' }} />
                          {t('accounts.expired_at', { date: allPlansExpired(a) })}
                        </span>
                      ) : (
                        <>
                          <QuotaRows account={a} />
                          <PlanRows account={a} />
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-center tabular-nums text-muted-foreground">{a.use_count || 0}</TableCell>
                    <TableCell className="text-center tabular-nums text-muted-foreground">{a.fail_count || 0}</TableCell>
                    <TableCell>
                      <TokensCell account={a} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(a.last_used_at)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-0.5">
                        {a.mode === 'jwt' && (
                          <Button variant="ghost" size="icon-sm" title={t('accounts.refresh_quota')} onClick={() => void refreshOne(a)}>
                            {refreshing.has(a.id) ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                          </Button>
                        )}
                        {a.mode === 'jwt' && (
                          <Button variant="ghost" size="icon-sm" title={t('accounts.claim_title')} onClick={() => void claimOne(a)}>
                            {claiming.has(a.id) ? <Loader2 className="animate-spin" /> : <Gift />}
                          </Button>
                        )}
                        <Button variant="ghost" size="icon-sm" title={t('accounts.reset_stats_title')} onClick={() => resetStats(a)}>
                          <RotateCcw />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title={a.status === 'disabled' ? t('accounts.enable') : t('accounts.disable')}
                          onClick={() => void toggleEnabled(a)}
                        >
                          {a.status === 'disabled' ? <RotateCcw /> : <XCircle />}
                        </Button>
                        <Button variant="ghost" size="icon-sm" title={t('accounts.archive_action')} onClick={() => doArchive(a)}>
                          <Archive />
                        </Button>
                        <Button variant="ghost" size="icon-sm" title={t('common.edit')} onClick={() => openEdit(a)}>
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          title={t('common.delete')}
                          onClick={() => doDelete(a)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 歸檔區：已停止調用的帳號，僅保留記錄，可恢復或刪除 */}
      {showArchived && (
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center">{t('accounts.col_account')}</TableHead>
                  <TableHead className="w-40 text-center">{t('accounts.col_archived_at')}</TableHead>
                  <TableHead className="w-24 text-center">{t('accounts.col_total_calls')}</TableHead>
                  <TableHead className="w-24 text-center">Tokens</TableHead>
                  <TableHead className="w-24 text-center">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!archivedAccounts.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      {t('accounts.empty_archived')}
                    </TableCell>
                  </TableRow>
                ) : (
                  archivedAccounts.map((a) => (
                    <TableRow key={a.id} className="text-muted-foreground">
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <EmailCell account={a} onCopy={() => void copyEmail(a)} />
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-xs">{fmtDate(a.archived_at)}</TableCell>
                      <TableCell className="text-center tabular-nums text-xs">{a.use_count || 0}</TableCell>
                      <TableCell className="text-center text-xs">
                        {fmtCompact(Number(a.total_tokens?.input || 0) + Number(a.total_tokens?.output || 0))}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center gap-0.5">
                          <Button variant="ghost" size="icon-sm" title={t('accounts.restore_to_pool')} onClick={() => void doRestore(a)}>
                            <ArchiveRestore />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive"
                            title={t('common.delete')}
                            onClick={() => doDelete(a)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 新增帳號對話框：授權登入為預設分頁 */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('accounts.add_title')}</DialogTitle>
            <DialogDescription>{t('accounts.add_description')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label>{t('accounts.provider_label')}</Label>
            <Select value={addProvider} onValueChange={(v) => { setAddProvider(v as 'zai' | 'bigmodel'); setFlow(null); setCallbackUrl('') }}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="zai">{t('provider.zai')}</SelectItem>
                <SelectItem value="bigmodel">{t('provider.bigmodel')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Tabs value={addTab} onValueChange={(v) => setAddTab(v as 'login' | 'paste')}>
            <TabsList className="w-full">
              <TabsTrigger value="login" className="flex-1">{t('accounts.tab_login')}</TabsTrigger>
              <TabsTrigger value="paste" className="flex-1">{t('accounts.tab_paste')}</TabsTrigger>
            </TabsList>

            {/* 授權登入 */}
            <TabsContent value="login" className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                {addProvider === 'bigmodel'
                  ? t('accounts.login_hint_bigmodel')
                  : t('accounts.login_hint_zai')}
              </p>
              {!flow ? (
                <Button className="h-10 w-full" disabled={starting} onClick={() => void startLogin()}>
                  {starting ? <Loader2 className="animate-spin" /> : null}
                  {t('accounts.start_login')}
                </Button>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-muted-foreground">{addProvider === 'bigmodel' ? t('accounts.step1_bigmodel') : t('accounts.step1_zai')}</p>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={flow.url} className="min-w-0 flex-1 font-mono text-xs" />
                    <Button variant="outline" size="sm" onClick={copyLoginUrl}>{t('common.copy')}</Button>
                    <Button size="sm" onClick={openLoginUrl}>{t('accounts.open')}</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('accounts.step2')}</p>
                  <Textarea
                    rows={3}
                    className="font-mono text-xs"
                    placeholder={t('accounts.callback_placeholder')}
                    value={callbackUrl}
                    onChange={(e) => setCallbackUrl(e.target.value)}
                  />
                  <Button className="h-10 w-full" disabled={completing} onClick={() => void completeLogin()}>
                    {completing ? <Loader2 className="animate-spin" /> : null}
                    {t('accounts.step3')}
                  </Button>
                  <p className={'text-xs ' + (loginErr ? 'text-destructive' : 'text-muted-foreground')}>{loginStatus}</p>
                </div>
              )}
            </TabsContent>

            {/* 貼上憑證 */}
            <TabsContent value="paste" className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">{t('accounts.paste_hint')}</p>
                <Textarea
                  rows={7}
                  className="font-mono text-xs"
                  placeholder={t('accounts.paste_placeholder')}
                  value={tokensText}
                  onChange={(e) => setTokensText(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>{t('accounts.proxy_label')}</Label>
                <ProxySelect value={addProxy} onChange={setAddProxy} proxies={proxies} />
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>{t('common.cancel')}</Button>
            {addTab === 'paste' && (
              <Button disabled={adding} onClick={() => void doAdd()}>
                {adding ? <Loader2 className="animate-spin" /> : null}
                {t('common.add')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 編輯帳號對話框 */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('accounts.edit_title')}</DialogTitle>
            <DialogDescription>{t('accounts.edit_description')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-name">{t('accounts.name_label')}</Label>
              <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-token">Token</Label>
              <Input
                id="edit-token"
                placeholder={t('accounts.token_placeholder')}
                value={editToken}
                onChange={(e) => setEditToken(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t('accounts.proxy_label')}</Label>
              <ProxySelect value={editProxy} onChange={setEditProxy} proxies={proxies} legacy={editLegacy} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t('accounts.disabled_models_label')}</Label>
              {editModelOptions.length ? (
                <div className="grid grid-cols-2 gap-2 rounded-lg border p-3">
                  {editModelOptions.map(([key, label]) => (
                    <label key={key} className="flex cursor-pointer items-center gap-2 text-xs">
                      <Checkbox
                        checked={editModels.includes(key)}
                        onCheckedChange={(v) =>
                          setEditModels((list) => (v ? [...list, key] : list.filter((m) => m !== key)))
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t('accounts.no_models')}</p>
              )}
              <p className="text-xs text-muted-foreground">{t('accounts.disabled_models_hint')}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Button>
              <Button disabled={saving} onClick={() => void doEdit()}>
                {saving ? <Loader2 className="animate-spin" /> : null}
                {t('common.save')}
              </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmElement}
    </div>
  )
}

/* 賬號欄：截断显示邮箱，悬停出现复制按钮（复制完整邮箱），为右侧操作按钮腾空间 */
function EmailCell({ account, onCopy }: { account: Account; onCopy: () => void }) {
  const { t } = useTranslation()
  const label = account.email || account.name || t('accounts.unnamed')
  return (
    <span className="group/email flex min-w-0 items-center gap-1">
      <span className="max-w-44 truncate font-medium" title={label}>
        {label}
      </span>
      <button
        type="button"
        onClick={onCopy}
        title={t('common.copy')}
        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus:opacity-100 group-hover/email:opacity-100"
      >
        <Copy className="size-3" />
      </button>
    </span>
  )
}

/* 統計小卡 */
function StatCell({ label, value, color, icon }: { label: string; value: string; color?: string; icon?: React.ReactNode }) {  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {label}
          {icon}
        </div>
        <div className="text-2xl font-semibold tabular-nums" style={color ? { color } : undefined}>
          {value}
        </div>
      </CardContent>
    </Card>
  )
}

/* 出口線路下拉：直連／（編輯時）舊版自訂代理／線路清單 */
function ProxySelect({
  value,
  onChange,
  proxies,
  legacy = false,
}: {
  value: string
  onChange: (v: string) => void
  proxies: ProxyProfile[]
  legacy?: boolean
}) {
  const { t } = useTranslation()
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={PROXY_DIRECT}>{t('accounts.direct_no_proxy')}</SelectItem>
        {legacy && <SelectItem value={PROXY_LEGACY}>{t('accounts.legacy_proxy_keep')}</SelectItem>}
        {proxies.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name} · {proxyScheme(p.url)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/* 累計 Tokens 欄：入／出／快取三行 */
function TokensCell({ account }: { account: Account }) {
  const { t } = useTranslation()
  const tt = account.total_tokens || { input: 0, output: 0, cache_creation: 0, cache_read: 0 }
  const i = Number(tt.input) || 0
  const o = Number(tt.output) || 0
  const c = (Number(tt.cache_creation) || 0) + (Number(tt.cache_read) || 0)
  if (!i && !o && !c) return <span className="text-muted-foreground">—</span>
  return (
    <div
      className="flex flex-col items-center gap-0.5 text-[11px] leading-tight"
      title={t('accounts.tokens_tooltip', { in: i.toLocaleString(), out: o.toLocaleString(), cache: c.toLocaleString() })}
    >
      <span><span className="text-muted-foreground">{t('accounts.io_in')}</span> <b className="tabular-nums">{fmtCompact(i)}</b></span>
      <span><span className="text-muted-foreground">{t('accounts.io_out')}</span> <b className="tabular-nums">{fmtCompact(o)}</b></span>
      {c ? <span><span className="text-muted-foreground">{t('accounts.io_cache')}</span> <b className="tabular-nums">{fmtCompact(c)}</b></span> : null}
    </div>
  )
}
