import React, { useMemo, useState } from 'react'
import {
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { EquityPoint } from '../../types'

interface Props {
  data: EquityPoint[]
  initialBalance?: number
  height?: number
  title?: string
  compact?: boolean
  allowZoom?: boolean
  allowModeToggle?: boolean
  showLegend?: boolean
  defaultMode?: ViewMode
}

type ViewMode = 'absolute' | 'percent'

function formatTime(ts: string): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.abs(value) < 100 ? 2 : 0,
  }).format(value)
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: Math.abs(value) < 10 ? 2 : 1,
    maximumFractionDigits: Math.abs(value) < 10 ? 2 : 1,
  }).format(value)
}

export default function AccountEvolutionChart({
  data,
  initialBalance,
  height = 260,
  title = 'Evolución de la cuenta',
  compact = false,
  allowZoom = true,
  allowModeToggle = true,
  showLegend = true,
  defaultMode = 'absolute',
}: Props) {
  const [mode, setMode] = useState<ViewMode>(defaultMode)
  const [timeRange, setTimeRange] = useState<'today'|'7d'|'30d'|'all'>('all')

  const safeInitialBalance = initialBalance && initialBalance > 0
    ? initialBalance
    : data[0]?.balance

  const filteredData = useMemo(() => {
    if (timeRange === 'all' || !data.length) return data;
    const now = new Date();
    let cutoff = new Date(0);
    if (timeRange === 'today') {
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (timeRange === '7d') {
      cutoff = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    } else if (timeRange === '30d') {
      cutoff = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    }
    return data.filter(d => new Date(d.timestamp_utc) >= cutoff);
  }, [data, timeRange]);

  const maxDrawdownPoint = useMemo(() => {
    if (!filteredData.length) return null;
    return filteredData.reduce((max, p) => p.drawdown_pct > max.drawdown_pct ? p : max, filteredData[0]);
  }, [filteredData]);

  const chartData = useMemo(() => {
    if (!safeInitialBalance || !filteredData.length) return []

    return filteredData.map((point) => ({
      time: formatTime(point.timestamp_utc),
      balanceAbs: point.balance, // Valor real del balance
      equityAbs: point.equity,   // Valor real de la equidad
      balancePct: ((point.balance / safeInitialBalance) - 1) * 100,
      equityPct: ((point.equity / safeInitialBalance) - 1) * 100,
      isMaxDd: point === maxDrawdownPoint,
      rawPoint: point,
    }))
  }, [filteredData, safeInitialBalance, maxDrawdownPoint])

  if (!chartData.length || !safeInitialBalance) {
    return (
      <div style={{ height }} className={`flex items-center justify-center text-slate-500 text-sm ${compact ? '' : 'rounded-lg bg-slate-900/40'}`}>
        Sin histórico suficiente para graficar evolución
      </div>
    )
  }

  const balanceKey = mode === 'absolute' ? 'balanceAbs' : 'balancePct'
  const equityKey = mode === 'absolute' ? 'equityAbs' : 'equityPct'

  const values = chartData.flatMap((point) => [point[balanceKey as keyof typeof point], point[equityKey as keyof typeof point]] as number[])
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const range = maxVal - minVal || 1
  const pad = Math.max(range * 0.05, mode === 'absolute' ? 25 : 0.5)
  const domain: [number, number] = [Math.max(0, minVal - pad), maxVal + pad]
  const containerClass = compact ? '' : ''
  const chartMargin = compact ? { top: 6, right: 10, left: 6, bottom: 2 } : { top: 24, right: 28, left: 18, bottom: 28 }

  const currentPoint = chartData[chartData.length - 1]
  const currentBalanceAbs = currentPoint.balanceAbs as number
  const currentEquityAbs = currentPoint.equityAbs as number

  const maxDrawdownTime = maxDrawdownPoint ? formatTime(maxDrawdownPoint.timestamp_utc) : null;

  const yAxisFormatter = (v: number) => {
    if (mode === 'absolute') {
      if (v >= 1000) return `${(v / 1000).toFixed(2).replace(/\.00$/, '')}k`
      return v.toFixed(0)
    }
    return `${v.toFixed(1)}%`
  }

  return (
    <div className={containerClass}>
      {!compact && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4 px-2 sm:px-3">
          <div className="flex flex-wrap gap-8">
            <div>
              <div className="text-lg font-bold text-slate-200 tracking-tight">{mode === 'absolute' ? `$${formatCurrency(currentBalanceAbs)}` : `${formatPercent(currentPoint.balancePct as number)}%`}</div>
              <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5 uppercase tracking-wider font-semibold">
                <div className="w-1.5 h-1.5 rounded-full bg-[#60a5fa]" /> Balance
              </div>
            </div>
            <div>
              <div className="text-lg font-bold text-slate-200 tracking-tight">{mode === 'absolute' ? `$${formatCurrency(currentEquityAbs)}` : `${formatPercent(currentPoint.equityPct as number)}%`}</div>
              <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5 uppercase tracking-wider font-semibold">
                <div className="w-1.5 h-1.5 rounded-full bg-[#c084fc]" /> Equity
              </div>
            </div>
            <div>
              <div className={`text-lg font-bold tracking-tight ${(currentPoint.equityPct as number) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {(currentPoint.equityPct as number) > 0 ? '+' : ''}{formatPercent(currentPoint.equityPct as number)}%
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5 uppercase tracking-wider font-semibold">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" /> Growth
              </div>
            </div>
            <div>
              <div className="text-lg font-bold text-yellow-400 tracking-tight">{formatPercent(currentPoint.drawdown_pct as number ?? 0)}%</div>
              <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5 uppercase tracking-wider font-semibold">
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" /> Drawdown
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {allowModeToggle && (
              <div className="flex rounded-lg bg-slate-800/80 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setMode('absolute')}
                  className={`rounded-md px-3 py-1.5 transition-colors ${mode === 'absolute' ? 'bg-[#60a5fa] text-white font-medium shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Balance
                </button>
                <button
                  type="button"
                  onClick={() => setMode('percent')}
                  className={`rounded-md px-3 py-1.5 transition-colors ${mode === 'percent' ? 'bg-[#60a5fa] text-white font-medium shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Growth
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={chartMargin}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff" strokeOpacity={0.05} vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fill: '#94a3b8', fontSize: compact ? 9 : 10 }}
            tickLine={false}
            axisLine={false}
            minTickGap={48}
            padding={{ left: 10, right: 10 }}
          />
          <YAxis
            domain={mode === 'absolute' ? ['dataMin - 100', 'dataMax + 100'] : ['auto', 'auto']}
            tick={{ fill: '#94a3b8', fontSize: compact ? 9 : 10 }}
            tickLine={false}
            axisLine={false}
            width={compact ? 50 : 68}
            tickFormatter={yAxisFormatter}
            orientation="right"
          />
          <Tooltip
            contentStyle={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
            formatter={(value: number, name: string) => {
              const label = name === balanceKey ? 'Balance' : 'Equity'
              const prefix = mode === 'percent' && value > 0 ? '+' : ''
              return [mode === 'absolute' ? `$${formatCurrency(value)}` : `${prefix}${formatPercent(value)}%`, label]
            }}
          />
          {mode === 'percent' && <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />}
          
          <Line
            type="stepAfter"
            dataKey={balanceKey}
            name={balanceKey}
            stroke="#60a5fa"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey={equityKey}
            name={equityKey}
            stroke="#c084fc"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          {allowZoom && !compact && (
            <Brush
              dataKey="time"
              height={24}
              stroke="#0f172a"
              fill="#1e293b"
              travellerWidth={8}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
