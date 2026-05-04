import React, { useMemo } from 'react'
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
}

function formatTime(ts: string): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export default function DrawdownChart({ data, height = 120 }: Props) {
  const chartData = useMemo(
    () =>
      data.map((p) => ({
        time: formatTime(p.timestamp_utc),
        dd: -Number(p.drawdown_pct.toFixed(2)),
      })),
    [data],
  )

  if (!chartData.length) return null

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 2, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
        <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: '#64748b', fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${(-v).toFixed(1)}%`} width={40} />
        <ReferenceLine y={-10} stroke="#eab308" strokeDasharray="3 3" strokeWidth={1} />
        <ReferenceLine y={-20} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
          formatter={(v: number) => [`${(-v).toFixed(2)}%`, 'Drawdown']}
        />
        <Area type="monotone" dataKey="dd" stroke="#ef4444" strokeWidth={1.5} fill="url(#ddGrad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
