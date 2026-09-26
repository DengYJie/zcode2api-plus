/* 儀表板頁：網關指標卡、提供商概況、帳號健康、Token 組成、帳號調度分布、用量排行、最近活動、網關資訊（輪詢 10 秒） */
import {
  Boxes,
  CircleCheck,
  Database,
  RefreshCw,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Empty, MetricCard, PanelCard } from '@/components/panel'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { fmt, fmtCompact, relativeTime } from '@/lib/format'
import {
  STATUS_COLOR,
  type Account,
  type AccountsResponse,
  type StatusResponse,
  type UsageResponse,
} from '@/lib/types'

export function DashboardPage() {
  const { t } = useTranslation()
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const [accountsData, statusData, usageData] = await Promise.all([
        api<AccountsResponse>('GET', '/accounts'),
        api<StatusResponse>('GET', '/status'),
        api<UsageResponse>('GET', '/usage'),
      ])
      return { accountsData, statusData, usageData }
    },
    refetchInterval: 10000,
  })

  const accounts = data?.accountsData.accounts ?? []
  const stats = data?.accountsData.stats
  const providers = data?.accountsData.providers ?? []
  const status = data?.statusData
  const usage = data?.usageData
  const usageCalls = Number(usage?.summary?.calls) || 0

  const calls = Number(stats?.calls) || 0
  const failed = Number(stats?.fail) || 0
  const input = Number(stats?.tokens_in) || 0
  const output = Number(stats?.tokens_out) || 0
  const cache = Number(stats?.tokens_cache) || 0
  const tokens = input + output + cache

  /* 額度彙總 */
  let remaining = 0
  let items = 0
  accounts.forEach((a) =>
    Object.values(a.quota || {}).forEach((q) => {
      remaining += Number(q.remaining) || 0
      items++
    }),
  )
  const pool = Object.values(status?.quota_pool || {}).reduce((n, v) => n + (Number(v) || 0), 0)
  const successRate = calls ? `${Math.max(0, ((calls - failed) / calls) * 100).toFixed(1)}%` : '--'

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* 頁首 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="mr-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
            {t('dashboard.live')}
          </span>
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? 'animate-spin' : undefined} /> {t('common.refresh')}
          </Button>
        </div>
      </div>

      {/* 網關指標卡 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard icon={<Users />} tone="text-blue-600" label={t('dashboard.total_accounts')} value={fmt(stats?.total)} detail={t('dashboard.active_count', { n: fmt(stats?.active) })} />
        <MetricCard icon={<Boxes />} tone="text-emerald-600" label={t('dashboard.pool_accounts')} value={fmt(pool)} detail={t('dashboard.provider_count', { n: providers.length })} />
        <MetricCard icon={<Zap />} tone="text-violet-600" label={t('dashboard.total_calls')} value={fmt(calls)} detail={t('dashboard.failed_count', { n: fmt(failed) })} />
        <MetricCard icon={<CircleCheck />} tone="text-amber-600" label={t('dashboard.success_rate')} value={successRate} detail={t('dashboard.success_rate_detail')} />
        <MetricCard icon={<Database />} tone="text-cyan-600" label={t('dashboard.total_tokens')} value={fmtCompact(tokens)} detail={t('dashboard.tokens_detail', { input: fmtCompact(input), output: fmtCompact(output) })} />
        <MetricCard icon={<TrendingUp />} tone="text-rose-600" label={t('dashboard.remaining_quota')} value={fmtCompact(remaining)} detail={t('dashboard.quota_item_count', { n: items })} />
      </div>

      {/* 提供商概況＋帳號健康 */}
      <div className="grid gap-4 lg:grid-cols-5">
        <PanelCard title={t('dashboard.providers_title')} subtitle={t('dashboard.providers_subtitle')} badge={t('dashboard.provider_count', { n: providers.length })} className="lg:col-span-3">
          {providers.length ? (
            <div className="flex flex-col divide-y">
              {providers.map((provider) => {
                const items2 = accounts.filter((a) => a.provider === provider)
                const callsP = items2.reduce((n, a) => n + (Number(a.use_count) || 0), 0)
                const tokensP = items2.reduce((n, a) => n + accountTokens(a), 0)
                const available = items2.filter((a) => a.status === 'active').length
                return (
                  <div key={provider} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3 first:pt-0 last:pb-0">
                    <div className="flex min-w-32 flex-1 items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                        {provider.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="leading-tight">
                        <strong className="block text-sm">{provider}</strong>
                        <small className="text-xs text-muted-foreground">{t('dashboard.available_count', { n: available })}</small>
                      </span>
                    </div>
                    <MetaStat label={t('dashboard.col_account')} value={fmt(items2.length)} />
                    <MetaStat label={t('dashboard.col_calls')} value={fmt(callsP)} />
                    <MetaStat label="Token" value={fmtCompact(tokensP)} />
                    <span className="min-w-20 text-right text-sm">
                      <span className="block text-xs text-muted-foreground">{t('dashboard.status')}</span>
                      <strong className={available ? 'text-emerald-600' : 'text-muted-foreground'}>
                        {available ? t('dashboard.available') : t('dashboard.no_available_accounts')}
                      </strong>
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <Empty>{t('dashboard.no_providers')}</Empty>
          )}
        </PanelCard>

        <PanelCard title={t('dashboard.health_title')} subtitle={t('dashboard.health_subtitle')} className="lg:col-span-2">
          <HealthDonut stats={stats} />
        </PanelCard>
      </div>

      {/* Token 組成＋最近活動 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <PanelCard title={t('dashboard.tokens_title')} subtitle={t('dashboard.tokens_subtitle')} badge={fmtCompact(tokens)}>
          {tokens ? (
            <div className="flex flex-col gap-4">
              {(
                [
                  [t('dashboard.tokens_input'), input, '#3b82f6'],
                  [t('dashboard.tokens_output'), output, '#10b981'],
                  [t('dashboard.tokens_cache'), cache, '#8b5cf6'],
                ] as [string, number, string][]
              ).map(([label, value, color]) => {
                const pct = tokens ? (value / tokens) * 100 : 0
                return (
                  <div key={label} className="flex items-center gap-3">
                    <span className="flex w-28 shrink-0 items-center gap-2 text-sm">
                      <i className="size-2 rounded-full" style={{ background: color }} />
                      {label}
                    </span>
                    <strong className="w-20 shrink-0 text-right text-sm tabular-nums">{fmtCompact(value)}</strong>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                    </span>
                    <small className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {pct.toFixed(1)}%
                    </small>
                  </div>
                )
              })}
            </div>
          ) : (
            <Empty>{t('dashboard.no_usage')}</Empty>
          )}
        </PanelCard>

        <PanelCard
          title={t('dashboard.recent_title')}
          subtitle={t('dashboard.recent_subtitle')}
          badge={
            <Link to="/admin/accounts" className="text-xs font-normal text-muted-foreground underline-offset-4 hover:underline">
              {t('dashboard.view_all')}
            </Link>
          }
        >
          {(() => {
            const items3 = [...accounts]
              .sort((a, b) => (b.last_used_at || b.created_at || 0) - (a.last_used_at || a.created_at || 0))
              .slice(0, 5)
            return items3.length ? (
              <div className="flex flex-col divide-y">
                {items3.map((a) => (
                  <Link key={a.id} to="/admin/accounts" className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[a.status] }} />
                    <span className="min-w-0 flex-1 leading-tight">
                      <strong className="block truncate text-sm">{a.name || a.provider}</strong>
                      <small className="text-xs text-muted-foreground">
                        {a.provider} · {a.mode === 'jwt' ? 'JWT' : 'API Key'}
                      </small>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(a.last_used_at || a.created_at)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty>{t('dashboard.no_activity')}</Empty>
            )
          })()}
        </PanelCard>
      </div>

      {/* 帳號調度分布＋用量排行（原用量分析頁內容） */}
      <div className="grid gap-4 lg:grid-cols-5">
        <PanelCard title={t('dashboard.dispatch_title')} subtitle={t('dashboard.dispatch_subtitle')} className="lg:col-span-2">
          <Donut ranking={usage?.ranking ?? []} calls={usageCalls} />
        </PanelCard>

        <PanelCard title={t('dashboard.ranking_title')} subtitle={t('dashboard.ranking_subtitle')} badge={fmt(usageCalls)} className="lg:col-span-3">
          <Card className="overflow-x-auto py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('dashboard.col_account')}</TableHead>
                  <TableHead>{t('dashboard.col_provider')}</TableHead>
                  <TableHead className="text-right">{t('dashboard.col_requests')}</TableHead>
                  <TableHead className="text-right">{t('dashboard.col_failures')}</TableHead>
                  <TableHead className="text-right">Token</TableHead>
                  <TableHead className="w-40">{t('dashboard.col_share')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(usage?.ranking ?? []).length ? (
                  (usage?.ranking ?? []).map((r) => {
                    const pct = usageCalls ? (r.requests / usageCalls) * 100 : 0
                    return (
                      <TableRow key={r.name}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">{r.provider}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(r.requests)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(r.errors)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtCompact(r.tokens)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                              <i className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                            </span>
                            <small className="w-11 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{pct.toFixed(1)}%</small>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      {t('dashboard.no_account_usage')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </PanelCard>
      </div>

      {/* 網關資訊 */}
      <PanelCard
        title={t('dashboard.gateway_title')}
        subtitle={t('dashboard.gateway_subtitle')}
        badge={
          <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Online
          </span>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Messages API</span>
            <code className="truncate rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs">{location.origin}/v1/messages</code>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <GatewayMeta label={t('dashboard.gateway_auth')} value={status?.gateway_key_set ? t('dashboard.enabled') : t('dashboard.not_enabled')} />
            <GatewayMeta label={t('dashboard.quota_refresh_label')} value={status?.quota_refresh_interval ? t('time.seconds', { n: status.quota_refresh_interval }) : t('dashboard.manual')} />
            <GatewayMeta
              label={t('dashboard.data_updated_label')}
              value={data ? new Date(data.accountsData.ts * 1000).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--'}
            />
          </div>
        </div>
      </PanelCard>
    </div>
  )
}

/* 帳號健康圓環：conic-gradient 依各狀態占比上色 */
function HealthDonut({ stats }: { stats?: AccountsResponse['stats'] }) {
  const { t } = useTranslation()
  const keys = ['active', 'exhausted', 'cooling', 'invalid', 'disabled'] as const
  const values = keys.map((k) => Number(stats?.[k]) || 0)
  const total = values.reduce((a, b) => a + b, 0)
  let cursor = 0
  const stops: string[] = []
  keys.forEach((key, i) => {
    const start = cursor
    cursor += total ? (values[i] / total) * 100 : 0
    if (values[i]) stops.push(`${STATUS_COLOR[key]} ${start}% ${cursor}%`)
  })
  return (
    <div className="flex items-center gap-6">
      <div
        className="relative flex size-32 shrink-0 items-center justify-center rounded-full"
        style={{ background: stops.length ? `conic-gradient(${stops.join(',')})` : '#eef2f6' }}
      >
        <div className="flex size-[86px] flex-col items-center justify-center rounded-full bg-card">
          <strong className="text-xl tabular-nums">{fmt(total)}</strong>
          <span className="text-xs text-muted-foreground">{t('dashboard.col_account')}</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
        {total ? (
          keys
            .map((key, i) => ({ key, value: values[i] }))
            .filter((x) => x.value)
            .map((x) => (
              <div key={x.key} className="flex items-center gap-2">
                <span className="size-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[x.key] }} />
                <span className="flex-1 text-muted-foreground">{t('status_long.' + x.key)}</span>
                <strong className="tabular-nums">{x.value}</strong>
              </div>
            ))
        ) : (
          <Empty>{t('dashboard.no_accounts')}</Empty>
        )}
      </div>
    </div>
  )
}

function accountTokens(a: Account): number {
  const t = a.total_tokens || { input: 0, output: 0, cache_creation: 0, cache_read: 0 }
  return (Number(t.input) || 0) + (Number(t.output) || 0) + (Number(t.cache_creation) || 0) + (Number(t.cache_read) || 0)
}

/* 調度分布圓環配色（原用量分析頁）：前五名帳號各一色，其餘歸入灰底 */
const PALETTE = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#94a3b8']

/* 調度分布圓環：前五名帳號請求占比 */
function Donut({ ranking, calls }: { ranking: UsageResponse['ranking']; calls: number }) {
  const { t } = useTranslation()
  const top = ranking.slice(0, 5)
  let cursor = 0
  const stops = top.map((r, i) => {
    const pct = calls ? (Number(r.requests) / calls) * 100 : 0
    const seg = `${PALETTE[i]} ${cursor}% ${cursor + pct}%`
    cursor += pct
    return seg
  })
  stops.push(`#e9edf3 ${cursor}% 100%`)
  return (
    <div className="flex items-center gap-6">
      <div
        className="relative flex size-32 shrink-0 items-center justify-center rounded-full"
        style={{ background: `conic-gradient(${stops.join(',')})` }}
      >
        <div className="flex size-[86px] flex-col items-center justify-center rounded-full bg-card">
          <strong className="text-xl tabular-nums">{fmt(calls)}</strong>
          <span className="text-xs text-muted-foreground">{t('dashboard.col_requests')}</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
        {top.length ? (
          top.map((r, i) => (
            <div key={r.name} className="flex items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ background: PALETTE[i] }} />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.name}</span>
              <strong className="shrink-0 tabular-nums">{calls ? ((r.requests / calls) * 100).toFixed(1) : '0'}%</strong>
            </div>
          ))
        ) : (
          <Empty>{t('dashboard.no_usage')}</Empty>
        )}
      </div>
    </div>
  )
}

function MetaStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-right text-sm">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <strong className="tabular-nums">{value}</strong>
    </span>
  )
}

function GatewayMeta({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-lg bg-muted/60 px-3 py-2">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <strong className="block truncate">{value}</strong>
    </span>
  )
}

