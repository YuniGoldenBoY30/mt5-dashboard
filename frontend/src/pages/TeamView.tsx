import React, { useMemo, useState } from 'react'
import { Users, DollarSign, TrendingDown, Activity, Target } from 'lucide-react'
import { useAccountsWebSocket } from '../hooks/useWebSocket'
import { usePerformance } from '../hooks/useAccounts'
import StatCard from '../components/StatCard'
import RegimeBadge from '../components/RegimeBadge'
import ModeIndicator from '../components/ModeIndicator'
import EquityChart from '../components/charts/EquityChart'
import ConnectionStatus from '../components/ConnectionStatus'
import { fmtUSD, fmtPct } from '../types'

// Mini equity chart per account
function AccountEquityRow({ login }: { login: string }) {
  const { data } = usePerformance(login)
  if (!data || data.equity_curve.length < 2) return null

  return (
    <div className="h-16">
      <EquityChart data={data.equity_curve} height={64} showBalance={false} />
    </div>
  )
}

export default function TeamView() {
  const { accounts, status } = useAccountsWebSocket()
  const [selectedLogin, setSelectedLogin] = useState<string | null>(null)
  const { data: perfData } = usePerformance(selectedLogin ?? '', !!selectedLogin)

  const active = accounts.filter((a) => a.status_data)

  const kpis = useMemo(() => {
    const totalEquity = active.reduce((s, a) => s + (a.status_data?.equity ?? 0), 0)
    const totalPnl = active.reduce((s, a) => s + (a.status_data?.daily_pnl_usd ?? 0), 0)
    // Máximo DD: validar que haya valores antes de hacer Math.max
    const ddValues = active.map((a) => a.status_data?.drawdown_pct ?? 0).filter((dd) => dd >= 0)
    const maxDD = ddValues.length > 0 ? Math.max(...ddValues) : 0
    // Win rate promedio: filtrar cuentas que tengan win_rate definido
    const avgWR = active.filter((a) => a.status_data?.win_rate != null)
    const winRate = avgWR.length
      ? avgWR.reduce((s, a) => s + (a.status_data!.win_rate! * 100), 0) / avgWR.length
      : null
    const openPos = active.reduce((s, a) => s + (a.status_data?.positions?.length ?? 0), 0)
    return { totalEquity, totalPnl, maxDD, winRate, openPos }
  }, [active])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-cyan-400" />
          <h1 className="text-2xl font-bold text-white">Vista de Equipo</h1>
        </div>
        <ConnectionStatus status={status} />
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Equity total" value={`$${kpis.totalEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          icon={<DollarSign className="w-4 h-4" />} colorClass="text-obsidian-accent" isVIP />
        <StatCard label="P&L hoy" value={fmtUSD(kpis.totalPnl)}
          icon={<Activity className="w-4 h-4" />}
          colorClass={kpis.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'} />
        <StatCard label="Max drawdown" value={fmtPct(kpis.maxDD)}
          icon={<TrendingDown className="w-4 h-4" />}
          colorClass={kpis.maxDD >= 20 ? 'text-red-400' : kpis.maxDD >= 10 ? 'text-yellow-400' : 'text-green-400'} />
        <StatCard label="Win rate promedio"
          value={kpis.winRate != null ? `${kpis.winRate.toFixed(1)}%` : '—'}
          icon={<Target className="w-4 h-4" />} />
        <StatCard label="Posiciones abiertas" value={kpis.openPos} />
      </div>

      {/* Tabla de cuentas */}
      <div className="bento-card overflow-hidden">
        <div className="px-4 py-3 border-b border-obsidian-border bg-white/5">
          <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            Estado de Cuentas Institucionales
          </h2>
        </div>

        {active.length === 0 ? (
          <div className="px-6 py-8 text-center text-slate-500 text-sm">Sin cuentas activas</div>
        ) : (
          <div className="divide-y divide-white/5">
            {active.map((account) => {
              const sd = account.status_data!
              const isSelected = selectedLogin === account.login
              const pnl = sd.daily_pnl_usd ?? 0

              return (
                <div
                  key={account.id}
                  className={`px-4 py-3 cursor-pointer transition-colors hover:bg-white/5 ${isSelected ? 'bg-cyan-500/5' : ''}`}
                  onClick={() => setSelectedLogin(isSelected ? null : account.login)}
                >
                  {/* Main row */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="min-w-[120px]">
                      <div className="text-sm font-medium text-white">{sd.name ?? account.login}</div>
                      <div className="text-xs text-slate-500">{account.broker}</div>
                    </div>

                    <div className="hidden sm:block flex-1">
                      <AccountEquityRow login={account.login} />
                    </div>

                    <div className="flex items-center gap-3 ml-auto">
                      <RegimeBadge regime={sd.regime} />
                      <ModeIndicator mode={sd.active_mode} size="sm" />

                      <div className="text-right">
                        <div className="text-sm font-bold text-white">
                          ${sd.equity.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                        <div className={`text-xs font-medium ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {fmtUSD(pnl)} hoy
                        </div>
                      </div>

                      <div className="text-right">
                        <div className={`text-sm font-bold ${sd.drawdown_pct >= 20 ? 'text-red-400' : sd.drawdown_pct >= 10 ? 'text-yellow-400' : 'text-green-400'}`}>
                          {fmtPct(sd.drawdown_pct)} DD
                        </div>
                        <div className="text-xs text-slate-500">
                          {sd.positions?.length ?? 0} pos.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Equity chart del seleccionado */}
      {selectedLogin && perfData && perfData.equity_curve.length > 1 && (
        <div className="rounded-xl border border-white/10 bg-slate-800/40 backdrop-blur px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
              Equity — {selectedLogin}
            </h2>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-slate-400">P&L total:
                <span className={`ml-1 font-bold ${perfData.total_pnl_usd >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {fmtUSD(perfData.total_pnl_usd)}
                </span>
              </span>
              <span className="text-slate-400">Max DD:
                <span className={`ml-1 font-bold text-red-400`}>
                  {fmtPct(perfData.max_drawdown_pct)}
                </span>
              </span>
            </div>
          </div>
          <EquityChart data={perfData.equity_curve} height={200} showBalance />
        </div>
      )}
    </div>
  )
}
