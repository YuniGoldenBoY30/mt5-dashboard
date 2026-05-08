import React, { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ClosedTrade, EquityPoint } from '../../types'
import { fmtPct, fmtUSD } from '../../types'
import AccountEvolutionChart from './AccountEvolutionChart'
import DrawdownChart from './DrawdownChart'

type AnalyticsTab = 'summary' | 'profit-loss' | 'long-short' | 'symbols' | 'risks'
type MetricMode = 'money' | 'deals'

interface Props {
  curve: EquityPoint[]
  trades: ClosedTrade[]
  initialBalance?: number
  summaryOnly?: boolean
  title?: string
}

const TAB_OPTIONS: { key: AnalyticsTab; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'profit-loss', label: 'Profit & Loss' },
  { key: 'long-short', label: 'Long & Short' },
  { key: 'symbols', label: 'Symbols' },
  { key: 'risks', label: 'Risks' },
]

const SYMBOL_COLORS = ['#38bdf8', '#f97316', '#22c55e', '#a78bfa', '#eab308', '#f43f5e']

function formatDay(ts: string): string {
  const d = new Date(ts)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function StatPill({ value, label, tone = 'text-white' }: { value: string; label: string; tone?: string }) {
  return (
    <div>
      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${tone.replace('text-', 'bg-')}`} /> {label}
      </div>
      <div className={`text-2xl font-bold ${tone === 'text-blue-400' || tone === 'text-green-400' ? 'text-white' : tone}`}>{value}</div>
    </div>
  )
}

export default function AccountAnalyticsTabs({
  curve,
  trades,
  initialBalance,
  summaryOnly = false,
  title = 'Análisis avanzado',
}: Props) {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('summary')
  const [metricMode, setMetricMode] = useState<MetricMode>('money')

  const safeInitial = initialBalance && initialBalance > 0
    ? initialBalance
    : curve[0]?.balance

  const summaryStats = useMemo(() => {
    const currentBalance = curve[curve.length - 1]?.balance ?? safeInitial ?? 0
    const currentEquity = curve[curve.length - 1]?.equity ?? safeInitial ?? 0
    const growthPct = safeInitial ? ((currentEquity / safeInitial) - 1) * 100 : 0
    const maxDrawdown = curve.length ? Math.max(...curve.map((p) => p.drawdown_pct ?? 0)) : 0
    return { currentBalance, currentEquity, growthPct, maxDrawdown }
  }, [curve, safeInitial])

  const profitLossData = useMemo(() => {
    const grouped = new Map<string, { date: string; positive: number; negative: number; deals: number; cumulative: number }>()
    let cumulative = 0

    ;[...trades]
      .sort((a, b) => new Date(a.close_time_utc).getTime() - new Date(b.close_time_utc).getTime())
      .forEach((trade) => {
        const date = formatDay(trade.close_time_utc)
        const existing = grouped.get(date) ?? { date, positive: 0, negative: 0, deals: 0, cumulative }
        if (trade.profit_net >= 0) existing.positive += trade.profit_net
        else existing.negative += trade.profit_net
        existing.deals += 1
        cumulative += trade.profit_net
        existing.cumulative = cumulative
        grouped.set(date, existing)
      })

    return Array.from(grouped.values())
  }, [trades])

  const longShortData = useMemo(() => {
    const grouped = new Map<string, { date: string; longMoney: number; shortMoney: number; longDeals: number; shortDeals: number }>()

    trades.forEach((trade) => {
      const date = formatDay(trade.close_time_utc)
      const existing = grouped.get(date) ?? { date, longMoney: 0, shortMoney: 0, longDeals: 0, shortDeals: 0 }
      if (trade.type === 'BUY') {
        existing.longMoney += trade.profit_net
        existing.longDeals += 1
      } else if (trade.type === 'SELL') {
        existing.shortMoney += trade.profit_net
        existing.shortDeals += 1
      }
      grouped.set(date, existing)
    })

    return Array.from(grouped.values()).map((row) => ({
      ...row,
      shortDealsNegative: -row.shortDeals,
    }))
  }, [trades])

  const symbolSeries = useMemo(() => {
    const dates = Array.from(new Set(trades.map((t) => formatDay(t.close_time_utc)))).sort()
    const symbols = Array.from(new Set(trades.map((t) => t.symbol))).slice(0, 6)

    const runningMoney = Object.fromEntries(symbols.map((s) => [s, 0]))
    const runningDeals = Object.fromEntries(symbols.map((s) => [s, 0]))

    const byDate = new Map<string, ClosedTrade[]>()
    trades.forEach((trade) => {
      const key = formatDay(trade.close_time_utc)
      byDate.set(key, [...(byDate.get(key) ?? []), trade])
    })

    const series = dates.map((date) => {
      const row: Record<string, string | number> = { date }
      const dayTrades = byDate.get(date) ?? []
      dayTrades.forEach((trade) => {
        if (!symbols.includes(trade.symbol)) return
        runningMoney[trade.symbol] += trade.profit_net
        runningDeals[trade.symbol] += 1
      })
      symbols.forEach((symbol) => {
        row[`${symbol}_money`] = runningMoney[symbol]
        row[`${symbol}_deals`] = runningDeals[symbol]
      })
      return row
    })

    const totals = symbols.map((symbol) => ({
      symbol,
      money: trades.filter((t) => t.symbol === symbol).reduce((sum, t) => sum + t.profit_net, 0),
      deals: trades.filter((t) => t.symbol === symbol).length,
    }))

    return { series, symbols, totals }
  }, [trades])

  const riskStats = useMemo(() => {
    const avgDailyPnl = curve.length
      ? curve.reduce((sum, point) => sum + (point.daily_pnl_usd ?? 0), 0) / curve.length
      : 0
    const maxDailyLoss = curve.length
      ? Math.min(...curve.map((point) => point.daily_pnl_usd ?? 0))
      : 0
    const maxDrawdown = curve.length
      ? Math.max(...curve.map((point) => point.drawdown_pct ?? 0))
      : 0
    return { avgDailyPnl, maxDailyLoss, maxDrawdown }
  }, [curve])

  const renderSummary = () => {
    if (!curve.length) return <div className="text-slate-500 text-sm py-10 text-center">Sin datos suficientes</div>

    return (
      <div className="space-y-6">
        {/* StatPills eliminados para evitar redundancia visual con la cabecera de la gráfica */}
        <div className="pt-2 px-1 sm:px-2 lg:px-3 pb-2">
          <AccountEvolutionChart
            data={curve}
            initialBalance={safeInitial}
            height={320}
            title=""
          />
        </div>
      </div>
    )
  }

  const renderProfitLoss = () => {
    const grossProfit = trades.filter((t) => t.profit_net > 0).reduce((sum, t) => sum + t.profit_net, 0)
    const grossLoss = trades.filter((t) => t.profit_net < 0).reduce((sum, t) => sum + t.profit_net, 0)
    const avgTrade = trades.length ? (grossProfit + grossLoss) / trades.length : 0

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-6">
            <StatPill value={fmtUSD(grossProfit + grossLoss)} label="Profit" tone={(grossProfit + grossLoss) >= 0 ? 'text-green-400' : 'text-red-400'} />
            <StatPill value={fmtUSD(grossProfit)} label="Gross Profit" tone="text-green-400" />
            <StatPill value={fmtUSD(grossLoss)} label="Gross Loss" tone="text-red-400" />
            <StatPill value={metricMode === 'money' ? fmtUSD(avgTrade) : String(trades.length)} label={metricMode === 'money' ? 'Trade Medio' : 'Deals'} tone="text-slate-100" />
          </div>
          <div className="flex rounded-lg border border-white/10 bg-slate-800/70 p-1 text-xs">
            {(['money', 'deals'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setMetricMode(mode)}
                className={`rounded-md px-3 py-1 transition-colors ${metricMode === mode ? 'bg-cyan-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
              >
                {mode === 'money' ? 'Money' : 'Deals'}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={profitLossData} margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={28} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }}
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = { positive: 'Ganancia', negative: 'Pérdida', cumulative: 'Acumulado', deals: 'Deals' }
                return [metricMode === 'money' && name !== 'deals' ? fmtUSD(value) : value, labels[name] ?? name]
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            {metricMode === 'money' ? (
              <>
                <Bar dataKey="positive" name="Ganancia" fill="#65a30d" />
                <Bar dataKey="negative" name="Pérdida" fill="#ea580c" />
                <Line type="monotone" dataKey="cumulative" name="Acumulado" stroke="#64748b" dot={false} />
              </>
            ) : (
              <Bar dataKey="deals" name="Deals" fill="#60a5fa" />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    )
  }

  const renderLongShort = () => {
    const longs = trades.filter((t) => t.type === 'BUY')
    const shorts = trades.filter((t) => t.type === 'SELL')

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-6">
          <StatPill value={`${longs.length} (${trades.length ? ((longs.length / trades.length) * 100).toFixed(1) : '0.0'}%)`} label="Long" tone="text-blue-400" />
          <StatPill value={`${shorts.length} (${trades.length ? ((shorts.length / trades.length) * 100).toFixed(1) : '0.0'}%)`} label="Short" tone="text-orange-400" />
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={longShortData} margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={28} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }}
              formatter={(value: number, name: string) => {
                const labelMap: Record<string, string> = {
                  longMoney: 'Long',
                  shortMoney: 'Short',
                  longDeals: 'Long Deals',
                  shortDealsNegative: 'Short Deals',
                }
                return [metricMode === 'money' ? fmtUSD(value) : Math.abs(value), labelMap[name] ?? name]
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            {metricMode === 'money' ? (
              <>
                <Bar dataKey="longMoney" name="Long" fill="#60a5fa" />
                <Bar dataKey="shortMoney" name="Short" fill="#f97316" />
              </>
            ) : (
              <>
                <Bar dataKey="longDeals" name="Long" fill="#60a5fa" />
                <Bar dataKey="shortDealsNegative" name="Short" fill="#f97316" />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    )
  }

  const renderSymbols = () => (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-6">
          {symbolSeries.totals.map((item, index) => (
            <StatPill
              key={item.symbol}
              value={metricMode === 'money' ? fmtUSD(item.money) : String(item.deals)}
              label={item.symbol}
              tone={item.money >= 0 ? 'text-green-400' : ['text-blue-400', 'text-orange-400', 'text-yellow-400', 'text-purple-400', 'text-cyan-400', 'text-slate-300'][index % 6]}
            />
          ))}
        </div>
        <div className="flex rounded-lg border border-white/10 bg-slate-800/70 p-1 text-xs">
          {(['money', 'deals'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setMetricMode(mode)}
              className={`rounded-md px-3 py-1 transition-colors ${metricMode === mode ? 'bg-cyan-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
            >
              {mode === 'money' ? 'Money' : 'Deals'}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={symbolSeries.series} margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
          <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={28} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }}
            formatter={(value: number, name: string) => [metricMode === 'money' ? fmtUSD(value) : value, name.replace('_money', '').replace('_deals', '')]}
          />
          <Legend wrapperStyle={{ fontSize: '12px' }} />
          {symbolSeries.symbols.map((symbol, index) => (
            <Line
              key={symbol}
              type="monotone"
              dataKey={`${symbol}_${metricMode}`}
              name={symbol}
              stroke={SYMBOL_COLORS[index % SYMBOL_COLORS.length]}
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )

  const renderRisks = () => (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-6">
        <StatPill value={fmtPct(riskStats.maxDrawdown)} label="Max DD" tone="text-orange-400" />
        <StatPill value={fmtUSD(riskStats.avgDailyPnl)} label="P&L diario medio" tone={riskStats.avgDailyPnl >= 0 ? 'text-green-400' : 'text-red-400'} />
        <StatPill value={fmtUSD(riskStats.maxDailyLoss)} label="Peor día" tone="text-red-400" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-white/5 bg-slate-900/30 p-3">
          <DrawdownChart data={curve} height={220} />
        </div>
        <div className="rounded-lg border border-white/5 bg-slate-900/30 p-3">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">P&L Diario</div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={curve.map((p) => ({ time: formatDay(p.timestamp_utc), pnl: p.daily_pnl_usd ?? 0 }))} margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
              <defs>
                <linearGradient id="riskPnl" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }}
                formatter={(value: number) => [fmtUSD(value), 'P&L diario']}
              />
              <Area type="monotone" dataKey="pnl" stroke="#38bdf8" fill="url(#riskPnl)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'profit-loss':
        return renderProfitLoss()
      case 'long-short':
        return renderLongShort()
      case 'symbols':
        return renderSymbols()
      case 'risks':
        return renderRisks()
      default:
        return renderSummary()
    }
  }

  if (summaryOnly) {
    return (
      <div className="w-full">
        {renderSummary()}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/10 bg-slate-800/40 overflow-hidden">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-300">{title}</div>
          <div className="flex flex-nowrap overflow-x-auto gap-8">
            {TAB_OPTIONS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`pb-3 text-sm font-medium transition-all relative whitespace-nowrap ${activeTab === tab.key ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <div className="absolute bottom-0 left-0 w-full h-[2px] bg-cyan-400 rounded-t-full shadow-[0_-2px_8px_rgba(34,211,238,0.5)]" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="pt-2">
        {renderActiveTab()}
      </div>
    </div>
  )

}
