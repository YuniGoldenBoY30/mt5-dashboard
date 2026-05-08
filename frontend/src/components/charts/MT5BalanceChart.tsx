import React, { useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { MT5ReportBalance } from '../../types'

interface Props {
  balanceData?: MT5ReportBalance
  height?: number
}

function formatTime(tsUnix: number): string {
  const d = new Date(tsUnix * 1000)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

export default function MT5BalanceChart({ balanceData, height = 300 }: Props) {
  const chartData = useMemo(() => {
    if (!balanceData?.chart) return []
    return balanceData.chart.map(pt => ({
      time: formatTime(pt.x),
      balance: pt.y[0],
      equity: pt.y[1]
    }))
  }, [balanceData])

  if (!chartData.length) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-slate-500 text-sm border border-slate-700/50 bg-slate-900/30 rounded-lg">
        Sin datos para gráfica
      </div>
    )
  }

  const minVal = Math.min(...chartData.map(d => Math.min(d.balance, d.equity)))
  const maxVal = Math.max(...chartData.map(d => Math.max(d.balance, d.equity)))
  const pad = (maxVal - minVal || 1) * 0.05

  return (
    <div className="border border-slate-700/50 bg-slate-900/30 rounded-lg p-4">
      <div className="flex items-center gap-4 mb-4 text-xs font-medium">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-blue-500/80"></div>
          <span className="text-slate-300">Balance</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
          <span className="text-slate-300">Equity</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="balMt5" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="eqMt5" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
          <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={30} />
          <YAxis domain={[minVal - pad, maxVal + pad]} tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
          <Tooltip 
            contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
            itemStyle={{ fontSize: '12px' }}
            labelStyle={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}
            formatter={(val: number, name: string) => [`$${val.toFixed(2)}`, name === 'balance' ? 'Balance' : 'Equity']}
          />
          <Area type="stepAfter" dataKey="balance" stroke="#3b82f6" strokeWidth={2} fill="url(#balMt5)" dot={false} isAnimationActive={false} />
          <Area type="stepAfter" dataKey="equity" stroke="#22c55e" strokeWidth={2} fill="url(#eqMt5)" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
