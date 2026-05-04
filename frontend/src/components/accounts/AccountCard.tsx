import React, { useState } from 'react'
import { clsx } from 'clsx'
import { ChevronDown, ChevronUp, Clock, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { Account } from '../../types'
import { ddColor, fmtUSD, fmtPct, isStale } from '../../types'
import RegimeBadge from '../RegimeBadge'
import ModeIndicator from '../ModeIndicator'
import PositionsList from '../PositionsList'

interface Props {
  account: Account
  onClosePosition?: (accountId: number, ticket: number) => void
  canClose?: boolean
}

export default function AccountCard({ account, onClosePosition, canClose }: Props) {
  const [expanded, setExpanded] = useState(false)
  const sd = account.status_data
  const stale = isStale(account.last_update)
  const pnl = sd?.daily_pnl_usd ?? 0

  const PnlIcon = pnl > 0 ? TrendingUp : pnl < 0 ? TrendingDown : Minus
  const pnlColor = pnl > 0 ? 'text-green-400' : pnl < 0 ? 'text-red-400' : 'text-slate-400'

  return (
    <div className={clsx(
      'rounded-xl border bg-slate-800/60 backdrop-blur transition-all duration-200',
      stale ? 'border-slate-600/40 opacity-75' : 'border-white/10 hover:border-white/20',
    )}>
      {/* Header */}
      <div
        className="px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start justify-between gap-2">
          {/* Identidad */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-white truncate">{sd?.name ?? account.login}</span>
              <span className="text-xs text-slate-500">{account.broker}</span>
              {stale && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                  <Clock className="w-3 h-3" /> Sin datos
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Login: {account.login}</div>
          </div>

          {/* Equity + DD */}
          <div className="text-right shrink-0">
            <div className="text-white font-bold">
              ${sd?.equity?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '—'}
            </div>
            <div className={clsx('text-xs font-medium', ddColor(sd?.drawdown_pct ?? 0))}>
              DD {fmtPct(sd?.drawdown_pct)}
            </div>
          </div>
        </div>

        {/* Estado row */}
        <div className="flex items-center gap-2 flex-wrap mt-2">
          <RegimeBadge regime={sd?.regime} />
          <ModeIndicator mode={sd?.active_mode} size="sm" />
          <span className={clsx('ml-auto flex items-center gap-1 text-sm font-semibold', pnlColor)}>
            <PnlIcon className="w-3.5 h-3.5" />
            {fmtUSD(pnl)} hoy
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-white/10 px-4 py-3 space-y-4">
          {/* Métricas grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Metric label="Balance" value={`$${sd?.balance?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '—'}`} />
            <Metric label="Equity" value={`$${sd?.equity?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '—'}`} />
            <Metric label="Margen libre" value={`$${sd?.free_margin?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '—'}`} />
            <Metric label="Nivel de margen" value={sd?.margin_level ? `${sd.margin_level.toFixed(1)}%` : '—'} />
            <Metric label="Risk abierto" value={fmtPct(sd?.open_risk_pct)} />
            <Metric label="Win Rate" value={sd?.win_rate != null ? `${(sd.win_rate * 100).toFixed(1)}%` : '—'} />
            <Metric label="Profit Factor" value={sd?.profit_factor?.toFixed(2) ?? '—'} />
            <Metric label="Kelly" value={sd?.kelly_fraction != null ? `${(sd.kelly_fraction * 100).toFixed(1)}%` : '—'} />
          </div>

          {/* Posiciones */}
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Posiciones abiertas ({sd?.positions?.length ?? 0})
            </div>
            <PositionsList
              positions={sd?.positions ?? []}
              canClose={canClose}
              onClose={(ticket) => onClosePosition?.(account.id, ticket)}
            />
          </div>

          {/* Última auditoría */}
          {sd?.last_audit && (
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                Último audit
              </div>
              <code className="text-xs text-slate-400 bg-slate-900/60 rounded p-2 block overflow-x-auto whitespace-pre-wrap break-all">
                {sd.last_audit}
              </code>
            </div>
          )}

          {/* Timestamp */}
          <div className="text-xs text-slate-600 text-right">
            Actualizado: {account.last_update ? new Date(account.last_update).toLocaleString() : '—'}
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-900/50 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-medium text-white mt-0.5">{value}</div>
    </div>
  )
}
