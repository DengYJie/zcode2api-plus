/* 帳號池額度列：模型名＋套餐名＋進度條＋剩餘/總量（語義照搬舊版 quotaCell） */
import { fmtCompact, fmtDate } from '@/lib/format'
import { useTranslation } from 'react-i18next'
import type { Account } from '@/lib/types'

const COLOR_EMPTY = '#c9c9cf'
const COLOR_LOW = '#b0632a'
const COLOR_OK = '#4c9168'

/* 套餐到期列：每個訂閱方案一行，顯示名稱＋待生效/到期時間（資料源 account.plans） */
export function PlanRows({ account }: { account: Account }) {
  const { t } = useTranslation()
  const plans = (account.plans || []).filter(
    (p) => p && (p.name || p.plan_id) && (p.ends_at || p.effective_at),
  )
  if (!plans.length) return null
  const now = Date.now() / 1000
  return (
    <div className="mt-1.5 flex min-w-0 flex-col gap-0.5 border-t border-dashed pt-1.5">
      {plans.map((p, i) => {
        const eff = Number(p.effective_at) || 0
        const end = Number(p.ends_at) || 0
        const pending = eff > now
        const expired = end > 0 && end <= now
        const name = String(p.name || p.plan_id || t('quota.plan_fallback', { n: i + 1 }))
        const time = pending
          ? t('quota.pending_until', { time: fmtDate(eff) })
          : expired
            ? t('quota.expired_at', { time: fmtDate(end) })
            : t('quota.ends_at', { time: fmtDate(end) })
        return (
          <div key={String(p.plan_id || i)} className="flex items-center gap-1.5 text-[11px] leading-tight">
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: expired ? COLOR_EMPTY : pending ? '#4c76b2' : COLOR_OK }}
              title={pending ? t('quota.not_effective') : expired ? t('quota.expired') : t('quota.active_now')}
            />
            <span className="truncate font-medium">{name}</span>
            <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{time}</span>
          </div>
        )
      })}
    </div>
  )
}

/* 全部套餐均已過期時回傳最晚的到期時間字串；無套餐或仍有生效方案則回傳 null */
export function allPlansExpired(account: Account): string | null {
  const plans = (account.plans || []).filter(
    (p) => p && (p.name || p.plan_id) && (p.ends_at || p.effective_at),
  )
  if (!plans.length) return null
  const now = Date.now() / 1000
  let latest = 0
  for (const p of plans) {
    const end = Number(p.ends_at) || 0
    const eff = Number(p.effective_at) || 0
    const pending = eff > now
    const expired = end > 0 && end <= now
    if (pending || !expired) return null
    latest = Math.max(latest, end)
  }
  return latest ? fmtDate(latest) : null
}

export function QuotaRows({ account }: { account: Account }) {
  const { t } = useTranslation()
  const quota = account.quota || {}
  const keys = Object.keys(quota)
  if (!keys.length) {
    return <span className="text-xs text-muted-foreground">{account.mode === 'jwt' ? t('quota.not_fetched') : '—'}</span>
  }
  /* 多套餐帳號每列自帶 plan_name；單套餐帳號後端留空，整體回退到帳號層的方案名 */
  const hasPlanNames = keys.some((k) => !!quota[k]?.plan_name)

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {keys.map((k) => {
        const w = quota[k]
        const rem = Number(w.remaining) || 0
        const tot = Number(w.total) || 0
        const pct = tot > 0 ? Math.max(0, Math.min(100, Math.round((rem / tot) * 100))) : 0
        const color = rem <= 0 ? COLOR_EMPTY : pct < 15 ? COLOR_LOW : COLOR_OK
        const period = w.period === 'daily' ? t('quota.daily') : t('quota.current_period')
        const reset = w.period_end ? t('quota.reset_at', { time: fmtDate(Number(w.period_end)) }) : ''
        const model = w.model || k
        const planName = w.plan_name || (hasPlanNames ? '' : account.plan_name || '')
        return (
          <div key={k} className="flex items-center gap-2 text-xs" title={t('quota.tooltip', { key: k, period, reset })}>
            <span className="flex min-w-0 shrink-0 flex-col leading-tight">
              <span className="truncate font-medium">{model}</span>
              {planName ? <span className="truncate text-[11px] text-muted-foreground">{planName}</span> : null}
            </span>
            <span className="h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {t('quota.usage', { period, rem: fmtCompact(rem), total: fmtCompact(tot) })}
            </span>
          </div>
        )
      })}
    </div>
  )
}
