import React, { useMemo, useState } from 'react'
import {
  Brush,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
  Line,
  LineChart,
} from 'recharts'
import type { MT5ReportBalance } from '../../types'

interface Props {
  balanceData?: MT5ReportBalance
  initialBalance?: number
  height?: number
}

type ViewMode = 'absolute' | 'percent'

function getNiceStep(range: number): number {
  if (!Number.isFinite(range) || range <= 0) return 1

  const roughStep = range / 5
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)))
  const residual = roughStep / magnitude

  if (residual <= 1) return magnitude
  if (residual <= 2) return 2 * magnitude
  if (residual <= 5) return 5 * magnitude
  return 10 * magnitude
}

function formatAxisValue(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: Math.abs(value) < 100 ? 2 : 0,
    maximumFractionDigits: Math.abs(value) < 100 ? 2 : 0,
  }).format(value)
}

function formatTime(tsUnix: number): string {
  const d = new Date(tsUnix * 1000)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function formatValue(value: number, mode: ViewMode): string {
  if (mode === 'percent') {
    return `${new Intl.NumberFormat('es-ES', {
      minimumFractionDigits: Math.abs(value) < 10 ? 2 : 1,
      maximumFractionDigits: Math.abs(value) < 10 ? 2 : 1,
    }).format(value)}%`
  }

  return `$${new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: Math.abs(value) < 100 ? 2 : 0,
    maximumFractionDigits: Math.abs(value) < 100 ? 2 : 0,
  }).format(value)}`
}

export default function MT5BalanceChart({ balanceData, initialBalance, height = 300 }: Props) {
  const [mode, setMode] = useState<ViewMode>('absolute')

  const safeInitialBalance = initialBalance && initialBalance > 0
    ? initialBalance
    : balanceData?.chart?.[0]?.y?.[0]

  const chartData = useMemo(() => {
    if (!balanceData?.chart || !safeInitialBalance) return []
    return balanceData.chart.map(pt => ({
      time: formatTime(pt.x),
      balanceAbs: pt.y[0] - safeInitialBalance,
      equityAbs: pt.y[1] - safeInitialBalance,
      balancePct: ((pt.y[0] / safeInitialBalance) - 1) * 100,
      equityPct: ((pt.y[1] / safeInitialBalance) - 1) * 100,
    }))
  }, [balanceData, safeInitialBalance])

  if (!chartData.length) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-slate-500 text-sm border border-slate-700/50 bg-slate-900/30 rounded-lg">
        Sin datos para gráfica
      </div>
    )
  }

  const balanceKey = mode === 'absolute' ? 'balanceAbs' : 'balancePct'
  const equityKey = mode === 'absolute' ? 'equityAbs' : 'equityPct'
  const values = chartData.flatMap((d) => [d[balanceKey as keyof typeof d], d[equityKey as keyof typeof d]] as number[])
  const minVal = Math.min(...values, 0)
  const maxVal = Math.max(...values, 0)
  const range = maxVal - minVal
  const step = getNiceStep(range || Math.max(Math.abs(maxVal), 1))
  const pad = Math.max(step * 0.5, (range || 1) * 0.08)
  const domainMin = Math.floor((minVal - pad) / step) * step
  const domainMax = Math.ceil((maxVal + pad) / step) * step

  return (
    <div className="border border-slate-700/50 bg-slate-900/30 rounded-lg p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Evolución de la cuenta
          </div>
          <div className="text-xs text-slate-500">
            `0` = balance inicial {mode === 'absolute' ? formatValue(safeInitialBalance ?? 0, 'absolute') : '100% base'}
          </div>
        </div>
        <div className="flex rounded-lg border border-white/10 bg-slate-800/70 p-1 text-xs">
          <button
            type="button"
            onClick={() => setMode('absolute')}
            className={`rounded-md px-2.5 py-1 transition-colors ${mode === 'absolute' ? 'bg-cyan-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
          >
            USD
          </button>
          <button
            type="button"
            onClick={() => setMode('percent')}
            className={`rounded-md px-2.5 py-1 transition-colors ${mode === 'percent' ? 'bg-cyan-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
          >
            %
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: 18, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
          <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={30} interval="preserveStartEnd" />
          <YAxis
            domain={[domainMin, domainMax]}
            tick={{ fill: '#64748b', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => formatValue(v, mode)}
            width={90}
            tickCount={6}
          />
          <Tooltip 
            contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
            itemStyle={{ fontSize: '12px' }}
            labelStyle={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}
            formatter={(val: number, name: string) => [formatValue(val, mode), name === balanceKey ? 'Balance' : 'Equity']}
          />
          <Legend wrapperStyle={{ fontSize: '12px' }} formatter={(value) => <span style={{ color: '#cbd5e1' }}>{value}</span>} />
          <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
          <Line type="stepAfter" dataKey={balanceKey} name="Balance" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="stepAfter" dataKey={equityKey} name="Equity" stroke="#22c55e" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Brush dataKey="time" height={22} stroke="#06b6d4" fill="#0f172a" travellerWidth={10} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
