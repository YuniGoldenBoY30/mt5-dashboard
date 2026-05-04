import React from 'react'
import { clsx } from 'clsx'

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  colorClass?: string
  icon?: React.ReactNode
  small?: boolean
  isVIP?: boolean
}


export default function StatCard({ label, value, sub, colorClass, icon, small, isVIP }: StatCardProps) {
  return (
    <div className={clsx(
      'bento-card px-4 py-4 flex flex-col gap-1',
      isVIP ? 'vip-glow-gold border-obsidian-accent/30' : 'vip-glow-cyan'
    )}>
      <div className="flex items-center gap-2 text-slate-500 text-[10px] font-bold uppercase tracking-[0.1em]">
        {icon && <span className={isVIP ? 'text-obsidian-accent' : 'text-obsidian-tech'}>{icon}</span>}
        {label}
      </div>
      <div className={clsx(
        'font-mono font-bold tracking-tight',
        small ? 'text-lg' : 'text-2xl',
        colorClass ?? 'text-white'
      )}>
        {value}
      </div>
      {sub && <div className="text-[10px] font-mono text-slate-600">{sub}</div>}
    </div>
  )
}
