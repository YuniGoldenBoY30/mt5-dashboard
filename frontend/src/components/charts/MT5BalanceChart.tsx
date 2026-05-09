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

function formatTime(tsUnix: number): string {
  const d = new Date(tsUnix * 1000)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
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
      balanceAbs: pt.y[0],
      equityAbs: pt.y[1],
      balancePct: ((pt.y[0] / safeInitialBalance) - 1) * 100,
      equityPct: ((pt.y[1] / safeInitialBalance) - 1) * 100,
    }))
  }, [balanceData, safeInitialBalance])

  if (!chartData.length || !safeInitialBalance) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-slate-500 text-sm border border-slate-700/50 bg-slate-900/30 rounded-lg">
        Sin datos para gráfica
      </div>
    )
  }

  const balanceKey = mode === 'absolute' ? 'balanceAbs' : 'balancePct'
  const equityKey = mode === 'absolute' ? 'equityAbs' : 'equityPct'
  const values = chartData.flatMap((d) => [d[balanceKey as keyof typeof d], d[equityKey as keyof typeof d]] as number[])
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const range = maxVal - minVal || 1
  const pad = Math.max(range * 0.05, mode === 'absolute' ? 25 : 0.5)
  const domainMin = Math.max(0, minVal - pad)
  const domainMax = maxVal + pad

  const currentPoint = chartData[chartData.length - 1]
  const currentBalanceAbs = currentPoint.balanceAbs as number
  const currentEquityAbs = currentPoint.equityAbs as number

  const yAxisFormatter = (v: number) => {
    if (mode === 'absolute') {
      if (v >= 1000) return `${(v / 1000).toFixed(2).replace(/\.00$/, '')}k`
      return v.toFixed(0)
    }
    return `${v.toFixed(1)}%`
  }

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 px-2">
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
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded bg-slate-800 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode('absolute')}
              className={`rounded px-3 py-1 transition-colors ${mode === 'absolute' ? 'bg-[#60a5fa] text-white font-medium shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Balance
            </button>
            <button
              type="button"
              onClick={() => setMode('percent')}
              className={`rounded px-3 py-1 transition-colors ${mode === 'percent' ? 'bg-[#60a5fa] text-white font-medium shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Growth
            </button>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff" strokeOpacity={0.05} vertical={false} />
          <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={40} />
          <YAxis
            domain={[domainMin, domainMax]}
            tick={{ fill: '#64748b', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={yAxisFormatter}
            width={55}
            orientation="right"
          />
          <Tooltip 
            contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '12px' }}
            labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
            formatter={(val: number, name: string) => {
              const prefix = mode === 'percent' && val > 0 ? '+' : ''
              const label = name === balanceKey ? 'Balance' : 'Equity'
              return [mode === 'absolute' ? `$${formatCurrency(val)}` : `${prefix}${formatPercent(val)}%`, label]
            }}
          />
          {mode === 'percent' && <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />}
          
          <Line type="stepAfter" dataKey={balanceKey} name={balanceKey} stroke="#60a5fa" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey={equityKey} name={equityKey} stroke="#c084fc" strokeWidth={2} dot={false} isAnimationActive={false} />
          
          <Brush dataKey="time" height={20} stroke="#0f172a" fill="#1e293b" travellerWidth={8} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
