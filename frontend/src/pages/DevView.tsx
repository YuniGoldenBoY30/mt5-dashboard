import React, { useState } from 'react'
import { Code2, RefreshCw, AlertTriangle, TrendingUp, Database, Cpu } from 'lucide-react'
import { useAccountsWebSocket } from '../hooks/useWebSocket'
import { usePerformance, useAlerts } from '../hooks/useAccounts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClosePosition, apiAckAlert } from '../services/api'
import toast from 'react-hot-toast'
import AccountCard from '../components/accounts/AccountCard'
import StatCard from '../components/StatCard'
import AccountEvolutionChart from '../components/charts/AccountEvolutionChart'
import DrawdownChart from '../components/charts/DrawdownChart'
import RegimeBadge from '../components/RegimeBadge'
import ModeIndicator from '../components/ModeIndicator'
import ConnectionStatus from '../components/ConnectionStatus'
import { fmtUSD, fmtPct } from '../types'

// Panel técnico de una cuenta
function AccountTechPanel({ account }: { account: ReturnType<typeof useAccountsWebSocket>['accounts'][0] }) {
  const { data: perf, isLoading, refetch } = usePerformance(account.login)
  const sd = account.status_data
  const qc = useQueryClient()

  const closeMutation = useMutation({
    mutationFn: ({ ticket }: { ticket: number }) => apiClosePosition(account.id, ticket),
    onSuccess: () => { toast.success('Posición cerrada'); qc.invalidateQueries({ queryKey: ['accounts'] }) },
    onError: (e: Error) => toast.error(`Error: ${e.message}`),
  })

  if (!sd) {
    return <div className="text-slate-500 text-sm px-4 py-3">Sin datos de telemetría</div>
  }

  return (
    <div className="space-y-5">
      {/* QuantFib metrics */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
          Motor QuantFib
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg bg-slate-900/60 px-3 py-2">
            <div className="text-xs text-slate-500 mb-1">Régimen</div>
            <RegimeBadge regime={sd.regime} />
          </div>
          <div className="rounded-lg bg-slate-900/60 px-3 py-2">
            <div className="text-xs text-slate-500 mb-1">Modo</div>
            <ModeIndicator mode={sd.active_mode} size="sm" />
          </div>
          <TechMetric label="Win Rate (cuentas)" value={sd.win_rate != null ? `${(sd.win_rate * 100).toFixed(1)}%` : '—'} />
          <TechMetric label="Profit Factor" value={sd.profit_factor?.toFixed(3) ?? '—'} />
          <TechMetric label="Kelly fraction" value={sd.kelly_fraction != null ? `${(sd.kelly_fraction * 100).toFixed(2)}%` : '—'} />
          <TechMetric label="Riesgo abierto" value={fmtPct(sd.open_risk_pct)} />
          <TechMetric label="Trades en ciclo" value={sd.n_trades_cycle ?? '—'} />
          <TechMetric label="Max DD histórico" value={fmtPct(sd.max_drawdown_pct)} />
        </div>
      </div>

      {/* Equity + DD charts */}
      {isLoading ? (
        <div className="text-slate-500 text-sm">Cargando historial…</div>
      ) : perf && perf.equity_curve.length > 1 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Evolución de la cuenta</h3>
            <button onClick={() => refetch()} className="text-xs text-slate-500 hover:text-cyan-400 flex items-center gap-1 transition-colors">
              <RefreshCw className="w-3 h-3" /> Actualizar
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm mb-2">
            <TechMetric label="P&L total" value={fmtUSD(perf.total_pnl_usd)} />
            <TechMetric label="Max DD periodo" value={fmtPct(perf.max_drawdown_pct)} />
            <TechMetric label="Snapshots" value={perf.n_snapshots} />
            <TechMetric label="Win Rate OOS" value={perf.win_rate != null ? `${(perf.win_rate * 100).toFixed(1)}%` : '—'} />
          </div>
          <AccountEvolutionChart
            data={perf.equity_curve}
            initialBalance={sd.initial_balance}
            height={220}
            title="Evolución de la cuenta"
          />
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Drawdown</h3>
          <DrawdownChart data={perf.equity_curve} height={110} />
        </div>
      ) : (
        <div className="text-slate-500 text-sm italic">Sin historial suficiente (&lt;2 snapshots)</div>
      )}

      {/* Posiciones con cierre */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
          Posiciones Abiertas ({sd.positions?.length ?? 0})
        </h3>
        {(sd.positions ?? []).length === 0 ? (
          <p className="text-sm text-slate-500 italic">Sin posiciones</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
                  {['Ticket', 'Par', 'Dir', 'Vol', 'Entrada', 'SL', 'TP', 'P&L', 'Acción'].map((h) => (
                    <th key={h} className="text-left pb-1.5 pr-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sd.positions.map((p) => (
                  <tr key={p.ticket} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-1.5 pr-2 text-slate-400">#{p.ticket}</td>
                    <td className="py-1.5 pr-2 font-medium text-white">{p.symbol}</td>
                    <td className="py-1.5 pr-2">
                      <span className={`px-1 rounded text-[10px] font-bold ${p.type === 'BUY' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {p.type}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-right">{p.volume.toFixed(2)}</td>
                    <td className="py-1.5 pr-2 text-right text-slate-300">{p.open_price.toFixed(2)}</td>
                    <td className="py-1.5 pr-2 text-right text-red-400/80">{p.sl?.toFixed(2) ?? '—'}</td>
                    <td className="py-1.5 pr-2 text-right text-green-400/80">{p.tp?.toFixed(2) ?? '—'}</td>
                    <td className={`py-1.5 pr-2 text-right font-semibold ${p.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {p.profit >= 0 ? '+' : ''}{p.profit.toFixed(2)}
                    </td>
                    <td className="py-1.5">
                      <button
                        onClick={() => closeMutation.mutate({ ticket: p.ticket })}
                        disabled={closeMutation.isPending}
                        className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded px-1.5 py-0.5 transition-colors disabled:opacity-50"
                      >
                        Cerrar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit trail */}
      {sd.last_audit && (
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Último Audit Trail (hash chain)
          </h3>
          <code className="block bg-slate-900/80 border border-white/10 rounded-lg p-3 text-xs text-cyan-300 overflow-x-auto whitespace-pre-wrap break-all">
            {sd.last_audit}
          </code>
        </div>
      )}
    </div>
  )
}

function TechMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-slate-900/60 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-mono font-medium text-white mt-0.5">{value}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────

export default function DevView() {
  const { accounts, status } = useAccountsWebSocket()
  const { data: alerts } = useAlerts(false)
  const [activeAccount, setActiveAccount] = useState<number | null>(null)
  const qc = useQueryClient()

  const activeAccounts = accounts.filter((a) => a.status_data)
  const selectedAccount = activeAccounts.find((a) => a.id === activeAccount) ?? activeAccounts[0]

  const pendingAlerts = alerts?.filter((a) => !a.acknowledged) ?? []
  const criticalAlerts = pendingAlerts.filter((a) => a.severity === 'critical')

  const ackMutation = useMutation({
    mutationFn: apiAckAlert,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Code2 className="w-5 h-5 text-cyan-400" />
          <h1 className="text-2xl font-bold text-white">Dev View</h1>
          <span className="text-xs text-slate-500 ml-2">— Acceso técnico completo</span>
        </div>
        <ConnectionStatus status={status} />
      </div>

      {/* Alertas críticas */}
      {criticalAlerts.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
            <AlertTriangle className="w-4 h-4" />
            {criticalAlerts.length} alerta{criticalAlerts.length !== 1 ? 's' : ''} crítica{criticalAlerts.length !== 1 ? 's' : ''}
          </div>
          {criticalAlerts.slice(0, 3).map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-3 text-sm">
              <span className="text-red-300">{a.message}</span>
              <button
                onClick={() => ackMutation.mutate(a.id)}
                className="text-xs text-slate-400 hover:text-green-400 shrink-0 transition-colors"
              >
                Ack
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Global stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Cuentas activas" value={activeAccounts.length} icon={<Database className="w-4 h-4" />} />
        <StatCard label="Alertas pendientes" value={pendingAlerts.length}
          colorClass={pendingAlerts.length > 0 ? 'text-yellow-400' : 'text-slate-400'} />
        <StatCard
          label="En modo PAUSE"
          value={activeAccounts.filter((a) => a.status_data?.active_mode === 'PAUSE').length}
          colorClass={activeAccounts.some((a) => a.status_data?.active_mode === 'PAUSE') ? 'text-red-400' : 'text-slate-400'}
        />
        <StatCard
          label="En modo GUARD"
          value={activeAccounts.filter((a) => a.status_data?.active_mode === 'GUARD').length}
          colorClass={activeAccounts.some((a) => a.status_data?.active_mode === 'GUARD') ? 'text-yellow-400' : 'text-slate-400'}
          icon={<Cpu className="w-4 h-4" />}
        />
      </div>

      {/* Account tabs + detail panel */}
      {activeAccounts.length === 0 ? (
        <div className="bento-card px-6 py-12 text-center text-slate-500">
          <Code2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>Sin cuentas con datos de telemetría.</p>
        </div>
      ) : (
        <div className="bento-card overflow-hidden">
          {/* Tab bar */}
          <div className="flex overflow-x-auto border-b border-obsidian-border bg-black/20">
            {activeAccounts.map((acc) => {
              const sd = acc.status_data!
              const isActive = selectedAccount?.id === acc.id
              return (
                <button
                  key={acc.id}
                  onClick={() => setActiveAccount(acc.id)}
                  className={`px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-colors flex items-center gap-2 ${
                    isActive ? 'border-cyan-400 text-white' : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${
                    sd.active_mode === 'PAUSE' ? 'bg-red-400' :
                    sd.active_mode === 'GUARD' ? 'bg-yellow-400' : 'bg-green-400'
                  }`} />
                  {sd.name ?? acc.login}
                  <span className="text-xs text-slate-500">{acc.broker}</span>
                </button>
              )
            })}
          </div>

          {/* Detail */}
          <div className="px-4 py-5">
            {selectedAccount && <AccountTechPanel account={selectedAccount} />}
          </div>
        </div>
      )}

      {/* All alerts table */}
      <div className="bento-card overflow-hidden">
        <div className="px-4 py-3 border-b border-obsidian-border flex items-center justify-between bg-white/5">
          <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Historial de Alertas</h2>
          <span className="text-[10px] font-mono text-slate-600">{pendingAlerts.length} pendientes</span>
        </div>
        <div className="divide-y divide-white/5 max-h-64 overflow-y-auto">
          {(alerts ?? []).slice(0, 30).map((alert) => (
            <div key={alert.id} className={`px-4 py-2.5 flex items-start gap-3 text-sm ${alert.acknowledged ? 'opacity-50' : ''}`}>
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                alert.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                alert.severity === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-blue-500/20 text-blue-400'
              }`}>
                {alert.severity.toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-white text-xs">{alert.message}</div>
                <div className="text-slate-500 text-xs mt-0.5">
                  {new Date(alert.timestamp_utc).toLocaleString()} · {alert.event_type}
                </div>
              </div>
              {!alert.acknowledged && (
                <button
                  onClick={() => ackMutation.mutate(alert.id)}
                  className="text-xs text-slate-500 hover:text-green-400 shrink-0 transition-colors"
                >
                  Ack
                </button>
              )}
            </div>
          ))}
          {(!alerts || alerts.length === 0) && (
            <div className="px-4 py-6 text-center text-slate-500 text-sm">Sin alertas</div>
          )}
        </div>
      </div>
    </div>
  )
}
