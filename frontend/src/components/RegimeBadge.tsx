import React from 'react'
import { clsx } from 'clsx'
import type { MarketRegime } from '../types'

interface Props {
  regime?: MarketRegime
}

const regimeConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  STRONG_TREND: { label: 'STRONG TREND', bg: 'bg-cyan-500/20', text: 'text-cyan-300', dot: 'bg-cyan-400' },
  TREND:        { label: 'TREND',        bg: 'bg-blue-500/20', text: 'text-blue-300', dot: 'bg-blue-400' },
  VOLATILE:     { label: 'VOLATILE',     bg: 'bg-orange-500/20', text: 'text-orange-300', dot: 'bg-orange-400' },
  RANGE:        { label: 'RANGE',        bg: 'bg-slate-500/20', text: 'text-slate-400', dot: 'bg-slate-500' },
  UNKNOWN:      { label: 'UNKNOWN',      bg: 'bg-slate-700/30', text: 'text-slate-500', dot: 'bg-slate-600' },
}

export default function RegimeBadge({ regime }: Props) {
  const cfg = regimeConfig[regime ?? 'UNKNOWN'] ?? regimeConfig.UNKNOWN
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold', cfg.bg, cfg.text)}>
      <span className={clsx('w-1.5 h-1.5 rounded-full animate-pulse', cfg.dot)} />
      {cfg.label}
    </span>
  )
}
