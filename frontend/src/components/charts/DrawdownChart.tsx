import React, { useMemo, useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { EquityPoint } from '../../types'

interface Props {
  data: EquityPoint[]
  height?: number
  compact?: boolean
}

function formatTime(ts: string): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.abs(value) < 100 ? 2 : 0,
  }).format(value)
}

export default function DrawdownChart({ data, height = 120, compact = false }: Props) {
  const [mode, setMode] = useState<'absolute' | 'percent'>('percent')

  const chartData = useMemo(() => {
    return data.map((p) => {
      const ddPct = p.drawdown_pct || 0
      const peak = ddPct < 100 ? p.equity / (1 - ddPct / 100) : p.equity
      const ddUsd = peak - p.equity
      
      return {
        time: formatTime(p.timestamp_utc),
        ddPct: -Number(ddPct.toFixed(2)),
        ddUsd: -Number(ddUsd.toFixed(2)),
      }
    })
  }, [data])

  if (!chartData.length) return null

  const dataKey = mode === 'percent' ? 'ddPct' : 'ddUsd'
  
  const currentPoint = chartData[chartData.length - 1]
  const currentVal = Math.abs(currentPoint[dataKey])
  
  const values = chartData.map(d => Math.abs(d[dataKey]))
  const maxVal = Math.max(...values, 0)

  const yAxisFormatter = (v: number) => {
    const abs = Math.abs(v)
    if (mode === 'absolute') {
      if (abs >= 1000) return `-${(abs / 1000).toFixed(1).replace(/\.0$/, '')}k`
      return `-${abs.toFixed(0)}`
    }
    return `-${abs.toFixed(1)}%`
  }

  const tooltipFormatter = (v: number) => {
    const abs = Math.abs(v)
    return [mode === 'absolute' ? `-$${formatCurrency(abs)}` : `-${abs.toFixed(2)}%`, 'Drawdown']
  }

  return (
    <div className="w-full">
      {!compact && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 px-2">
          <div className="flex gap-8">
            <div>
              <div className="text-lg font-bold text-slate-200 tracking-tight">
                {mode === 'absolute' ? `$${formatCurrency(currentVal)}` : `${currentVal.toFixed(2)}%`}
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <div className="w-2 h-2 rounded-full bg-[#ef4444]" /> Current DD
              </div>
            </div>
            <div>
              <div className="text-lg font-bold text-slate-200 tracking-tight">
                {mode === 'absolute' ? `$${formatCurrency(maxVal)}` : `${maxVal.toFixed(2)}%`}
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <div className="w-2 h-2 rounded-full bg-[#eab308]" /> Max DD
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded bg-slate-800 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMode('absolute')}
                className={`rounded px-3 py-1 transition-colors ${mode === 'absolute' ? 'bg-[#ef4444] text-white font-medium shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              >
                USD
              </button>
              <button
                type="button"
                onClick={() => setMode('percent')}
                className={`rounded px-3 py-1 transition-colors ${mode === 'percent' ? 'bg-[#ef4444] text-white font-medium shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              >
                %
              </button>
            </div>
          </div>
        </div>
      )}

      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={compact ? { top: 2, right: 8, left: 0, bottom: 0 } : { top: 20, right: 20, left: 20, bottom: 20 }}>
          <defs>
            <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
          <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={30} />
          <YAxis tick={{ fill: '#64748b', fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={yAxisFormatter} width={45} orientation="right" />
          
          {mode === 'percent' && (
            <>
              <ReferenceLine y={-10} stroke="#eab308" strokeDasharray="3 3" strokeWidth={1} />
              <ReferenceLine y={-20} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} />
            </>
          )}

          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
            formatter={tooltipFormatter}
          />
          <Area type="monotone" dataKey={dataKey} stroke="#ef4444" strokeWidth={1.5} fill="url(#ddGrad)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
