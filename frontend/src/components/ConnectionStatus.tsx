import React from 'react'
import { clsx } from 'clsx'
import { Wifi, WifiOff, Loader2 } from 'lucide-react'

type Status = 'connecting' | 'connected' | 'disconnected' | 'error'

interface Props {
  status: Status
}

export default function ConnectionStatus({ status }: Props) {
  const cfg = {
    connecting:   { icon: Loader2,  label: 'Conectando…', color: 'text-yellow-400', animate: 'animate-spin' },
    connected:    { icon: Wifi,     label: 'En vivo',      color: 'text-green-400',  animate: '' },
    disconnected: { icon: WifiOff,  label: 'Desconectado', color: 'text-slate-400',  animate: '' },
    error:        { icon: WifiOff,  label: 'Error WS',     color: 'text-red-400',    animate: '' },
  }[status]

  const Icon = cfg.icon
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-xs font-medium', cfg.color)}>
      <Icon className={clsx('w-3.5 h-3.5', cfg.animate)} />
      {cfg.label}
    </span>
  )
}
