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
      balanceAbs: point.balance - safeInitialBalance,
      equityAbs: point.equity - safeInitialBalance,
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
  const minVal = Math.min(...values, 0)
  const maxVal = Math.max(...values, 0)
  const range = maxVal - minVal || 1
  const pad = Math.max(range * 0.08, mode === 'absolute' ? 25 : 0.5)
  const domain: [number, number] = [minVal - pad, maxVal + pad]
  const containerClass = compact ? '' : 'rounded-lg border border-white/5 bg-slate-900/40 p-3'
  const chartMargin = compact ? { top: 4, right: 4, left: 4, bottom: 0 } : { top: 12, right: 12, left: 10, bottom: 0 }

  const currentPoint = chartData[chartData.length - 1]
  const currentVal = currentPoint[equityKey as keyof typeof currentPoint] as number
  const isPositive = currentVal >= 0
  const currentValStr = mode === 'absolute' 
    ? `$${formatCurrency(Math.abs(currentVal))}` 
    : `${formatPercent(Math.abs(currentVal))}%`

  const maxDrawdownTime = maxDrawdownPoint ? formatTime(maxDrawdownPoint.timestamp_utc) : null;

  return (
    <div className={containerClass}>
      {!compact && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {title}
            </div>
            <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
              <span><span className="text-slate-400">Línea base (0):</span> {mode === 'absolute' ? `$${formatCurrency(safeInitialBalance)}` : '100%'}</span>
              <span>•</span>
              <span className={`font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                Actual: {isPositive ? '+' : '-'}{currentValStr}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Time Range Selector */}
            <div className="flex bg-slate-900/50 rounded-lg p-0.5 border border-white/[0.04]">
              {(['today', '7d', '30d', 'all'] as const).map(tr => (
                <button
                  key={tr}
                  type="button"
                  onClick={() => setTimeRange(tr)}
                  className={`rounded-md px-3 py-1.5 transition-all text-xs font-medium ${timeRange === tr ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {tr === 'today' ? 'Hoy' : tr === 'all' ? 'Completo' : tr}
                </button>
              ))}
            </div>

            {allowModeToggle && (
              <div className="flex bg-slate-900/50 rounded-lg p-0.5 border border-white/[0.04]">
                <button
                  type="button"
                  onClick={() => setMode('absolute')}
                  className={`rounded-md px-3 py-1.5 transition-all text-xs font-medium ${mode === 'absolute' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  USD
                </button>
                <button
                  type="button"
                  onClick={() => setMode('percent')}
                  className={`rounded-md px-3 py-1.5 transition-all text-xs font-medium ${mode === 'percent' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  %
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={chartMargin}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff" strokeOpacity={0.03} vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fill: '#94a3b8', fontSize: compact ? 9 : 10 }}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
          />
          <YAxis
            domain={domain}
            tick={{ fill: '#94a3b8', fontSize: compact ? 9 : 10 }}
            tickLine={false}
            axisLine={false}
            width={compact ? 58 : 78}
            tickFormatter={(v) => mode === 'absolute' ? `$${formatCurrency(v)}` : `${formatPercent(v)}%`}
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
              const prefix = value > 0 ? '+' : ''
              return [mode === 'absolute' ? `${prefix}$${formatCurrency(value)}` : `${prefix}${formatPercent(value)}%`, label]
            }}
          />
          {showLegend && !compact && (
            <Legend
              wrapperStyle={{ fontSize: '12px' }}
              formatter={(value) => <span style={{ color: '#cbd5e1' }}>{value === balanceKey ? 'Balance' : 'Equity'}</span>}
            />
          )}
          <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
          
          {/* Max Drawdown Highlight */}
          {!compact && maxDrawdownTime && (
            <ReferenceLine 
              x={maxDrawdownTime} 
              stroke="#ef4444" 
              strokeDasharray="3 3" 
              label={{ position: 'insideTopRight', value: 'Max DD', fill: '#ef4444', fontSize: 10, offset: 10 }} 
            />
          )}

          <Line
            type="monotone"
            dataKey={balanceKey}
            name={balanceKey}
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey={equityKey}
            name={equityKey}
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          {allowZoom && !compact && (
            <Brush
              dataKey="time"
              height={22}
              stroke="#06b6d4"
              fill="#0f172a"
              travellerWidth={10}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
