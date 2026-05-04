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
  showBalance?: boolean
}

const modeColors: Record<string, string> = {
  NORMAL: '#22c55e',
  GUARD:  '#eab308',
  PAUSE:  '#ef4444',
}

function formatTime(ts: string): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

export default function EquityChart({ data, height = 220, showBalance = true }: Props) {
  const chartData = useMemo(
    () =>
      data.map((p) => ({
        time: formatTime(p.timestamp_utc),
        equity: Number(p.equity.toFixed(2)),
        balance: Number(p.balance.toFixed(2)),
        dd: Number(p.drawdown_pct.toFixed(2)),
        mode: p.active_mode ?? 'NORMAL',
      })),
    [data],
  )

  if (!chartData.length) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-slate-500 text-sm">
        Sin datos históricos
      </div>
    )
  }

  const [minEq, maxEq] = chartData.reduce(
    ([mn, mx], d) => [Math.min(mn, d.equity), Math.max(mx, d.equity)],
    [Infinity, -Infinity],
  )
  const pad = (maxEq - minEq) * 0.05

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
          </linearGradient>
          {showBalance && (
            <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          )}
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />

        <XAxis
          dataKey="time"
          tick={{ fill: '#94a3b8', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[minEq - pad, maxEq + pad]}
          tick={{ fill: '#94a3b8', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `$${v.toLocaleString()}`}
          width={72}
        />

        <Tooltip
          contentStyle={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: '#94a3b8' }}
          formatter={(value: number, name: string) => [
            `$${value.toLocaleString()}`,
            name === 'equity' ? 'Equity' : 'Balance',
          ]}
        />

        {showBalance && (
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#6366f1"
            strokeWidth={1}
            fill="url(#balGrad)"
            dot={false}
          />
        )}
        <Area
          type="monotone"
          dataKey="equity"
          stroke="#06b6d4"
          strokeWidth={2}
          fill="url(#equityGrad)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
