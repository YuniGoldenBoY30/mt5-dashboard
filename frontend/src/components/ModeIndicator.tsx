import React from 'react'
import { clsx } from 'clsx'
import { ShieldAlert, ShieldCheck, PauseCircle } from 'lucide-react'
import type { AdaptiveMode } from '../types'

interface Props {
  mode?: AdaptiveMode
  size?: 'sm' | 'md'
}

const modeConfig = {
  NORMAL: {
    icon: ShieldCheck,
    label: 'NORMAL',
    bg: 'bg-green-500/15',
    text: 'text-green-400',
    border: 'border-green-500/30',
  },
  GUARD: {
    icon: ShieldAlert,
    label: 'GUARD',
    bg: 'bg-yellow-500/15',
    text: 'text-yellow-400',
    border: 'border-yellow-500/30',
  },
  PAUSE: {
    icon: PauseCircle,
    label: 'PAUSE',
    bg: 'bg-red-500/15',
    text: 'text-red-400',
    border: 'border-red-500/30',
  },
  UNKNOWN: {
    icon: ShieldCheck,
    label: '—',
    bg: 'bg-slate-700/20',
    text: 'text-slate-500',
    border: 'border-slate-600/30',
  },
}

export default function ModeIndicator({ mode, size = 'md' }: Props) {
  const cfg = modeConfig[mode ?? 'UNKNOWN'] ?? modeConfig.UNKNOWN
  const Icon = cfg.icon
  const isSmall = size === 'sm'

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-lg border font-semibold',
        isSmall ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        cfg.bg, cfg.text, cfg.border,
      )}
    >
      <Icon className={isSmall ? 'w-3 h-3' : 'w-4 h-4'} />
      {cfg.label}
    </span>
  )
}
