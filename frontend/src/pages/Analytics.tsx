import React, { useState } from 'react'
import { TrendingUp, Activity, BarChart3 } from 'lucide-react'
import { useAccountsWebSocket } from '../hooks/useWebSocket'
import { usePerformance } from '../hooks/useAccounts'
import StatCard from '../components/StatCard'
import EquityChart from '../components/charts/EquityChart'
import DrawdownChart from '../components/charts/DrawdownChart'
import { calcCAGR, calcSharpe, calcSortino, calcCalmar, maxDrawdown } from '../utils/metrics'
import { fmtUSD, fmtPct } from '../types'

type RangeOption = '7d' | '30d' | '90d' | 'all'

export default function Analytics() {
  const { accounts } = useAccountsWebSocket()
  const activeAccounts = accounts.filter((a) => a.status_data)
  const [selectedLogin, setSelectedLogin] = useState<string>(activeAccounts[0]?.login || '')
  const [range, setRange] = useState<RangeOption>('90d')

  const limit = range === 'all' ? 5000 : range === '90d' ? 2000 : range === '30d' ? 1000 : 500
  const { data: perf, isLoading } = usePerformance(selectedLogin, !!selectedLogin && limit > 0)

  const metrics = React.useMemo(() => {
    if (!perf || perf.equity_curve.length < 2) return null
    const curve = perf.equity_curve
    const cagr = calcCAGR(curve)
    const sharpe = calcSharpe(curve)
    const sortino = calcSortino(curve)
    const dd = perf.max_drawdown_pct ?? maxDrawdown(curve)
    const calmar = calcCalmar(cagr, dd)
    return { cagr, sharpe, sortino, dd, calmar }
  }, [perf])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-cyan-400" />
        <h1 className="text-2xl font-bold text-white">Análisis Histórico</h1>
      </div>

      {/* Selector cuenta + rango */}
      <div className="flex flex-wrap gap-3 items-end bg-slate-800/40 border border-white/10 rounded-xl p-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Cuenta</label>
          <select
            value={selectedLogin}
            onChange={(e) => setSelectedLogin(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-white"
          >
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.login}>
                {a.status_data?.name ?? a.login}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Rango</label>
          <div className="flex gap-1">
            {(['7d', '30d', '90d', 'all'] as RangeOption[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  range === r
                    ? 'bg-cyan-500 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {r === 'all' ? 'Completo' : r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="text-slate-500 text-sm px-4 py-8">Cargando datos históricos…</div>
      )}

      {!isLoading && perf && (
        <>
          {/* Métricas resumen */}
          {metrics && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <StatCard label="CAGR" value={`${metrics.cagr.toFixed(2)}%`} icon={<TrendingUp className="w-4 h-4" />} />
              <StatCard label="Sharpe" value={metrics.sharpe.toFixed(2)} />
              <StatCard label="Sortino" value={metrics.sortino.toFixed(2)} />
              <StatCard label="Calmar" value={metrics.calmar.toFixed(2)} />
              <StatCard label="Max DD" value={`${metrics.dd.toFixed(2)}%`} colorClass="text-red-400" />
            </div>
          )}

          {/* Equity + Drawdown */}
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-slate-800/40 backdrop-blur px-4 py-4">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-4">
                Equity Curve — {selectedLogin}
              </h2>
              <EquityChart data={perf.equity_curve} height={280} showBalance />
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-800/40 backdrop-blur px-4 py-4">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-2">
                Drawdown
              </h2>
              <DrawdownChart data={perf.equity_curve} height={140} />
            </div>
          </div>

          {/* Tabla de snapshots recientes */}
          <div className="rounded-xl border border-white/10 bg-slate-800/40 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
                Snapshots recientes
              </h2>
            </div>
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/60">
                  <tr className="text-slate-400 border-b border-white/10">
                    <th className="text-left py-2 px-3">Fecha</th>
                    <th className="text-right py-2 px-3">Balance</th>
                    <th className="text-right py-2 px-3">Equity</th>
                    <th className="text-right py-2 px-3">DD %</th>
                    <th className="text-right py-2 px-3">P&L día</th>
                    <th className="text-center py-2 px-3">Régimen</th>
                    <th className="text-center py-2 px-3">Modo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {[...perf.equity_curve].reverse().slice(0, 100).map((p, idx) => (
                    <tr key={idx} className="hover:bg-white/5">
                      <td className="py-1.5 px-3 text-slate-400">
                        {new Date(p.timestamp_utc).toLocaleString()}
                      </td>
                      <td className="py-1.5 px-3 text-right text-slate-300">
                        ${p.balance.toFixed(2)}
                      </td>
                      <td className="py-1.5 px-3 text-right font-semibold text-white">
                        ${p.equity.toFixed(2)}
                      </td>
                      <td className={`py-1.5 px-3 text-right font-medium ${p.drawdown_pct >= 20 ? 'text-red-400' : p.drawdown_pct >= 10 ? 'text-yellow-400' : 'text-green-400'}`}>
                        {fmtPct(p.drawdown_pct)}
                      </td>
                      <td className={`py-1.5 px-3 text-right font-semibold ${(p.daily_pnl_usd ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {fmtUSD(p.daily_pnl_usd)}
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-slate-700 text-xs text-slate-300">
                          {p.regime ?? '—'}
                        </span>
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${
                          p.active_mode === 'NORMAL' ? 'bg-green-500/20 text-green-400' :
                          p.active_mode === 'GUARD' ? 'bg-yellow-500/20 text-yellow-400' :
                          p.active_mode === 'PAUSE' ? 'bg-red-500/20 text-red-400' :
                          'bg-slate-700 text-slate-400'
                        }`}>
                          {p.active_mode ?? '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!isLoading && (!perf || perf.equity_curve.length < 2) && (
        <div className="rounded-xl border border-white/10 bg-slate-800/40 px-6 py-12 text-center text-slate-500">
          <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No hay datos históricos suficientes para este período.</p>
        </div>
      )}
    </div>
  )
}
