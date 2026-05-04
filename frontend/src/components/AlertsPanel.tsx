import React from 'react'
import { clsx } from 'clsx'
import { AlertTriangle, AlertCircle, Info, CheckCircle2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiAckAlert } from '../services/api'
import { useAlerts } from '../hooks/useAccounts'
import type { Alert } from '../types'

const cfgBySeverity = {
  critical: { icon: AlertCircle,   bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-400' },
  warning:  { icon: AlertTriangle, bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400' },
  info:     { icon: Info,          bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   text: 'text-blue-400' },
}

function AlertItem({ alert }: { alert: Alert }) {
  const qc = useQueryClient()
  const ack = useMutation({
    mutationFn: () => apiAckAlert(alert.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })

  const cfg = cfgBySeverity[alert.severity] ?? cfgBySeverity.info
  const Icon = cfg.icon

  return (
    <div className={clsx('flex items-start gap-3 rounded-lg border px-3 py-2.5', cfg.bg, cfg.border)}>
      <Icon className={clsx('w-4 h-4 mt-0.5 shrink-0', cfg.text)} />
      <div className="flex-1 min-w-0">
        <div className={clsx('text-sm font-medium', cfg.text)}>{alert.message}</div>
        <div className="text-xs text-slate-500 mt-0.5">
          {new Date(alert.timestamp_utc).toLocaleString()} · {alert.account_login} · {alert.broker}
        </div>
      </div>
      {!alert.acknowledged && (
        <button
          onClick={() => ack.mutate()}
          disabled={ack.isPending}
          className="shrink-0 text-xs text-slate-400 hover:text-green-400 disabled:opacity-50 transition-colors"
          title="Marcar como visto"
        >
          <CheckCircle2 className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

export default function AlertsPanel() {
  const { data: alerts, isLoading } = useAlerts(false)

  if (isLoading) {
    return <div className="text-slate-500 text-sm">Cargando alertas…</div>
  }

  if (!alerts?.length) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-400">
        <CheckCircle2 className="w-4 h-4" /> Sin alertas activas
      </div>
    )
  }

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
      {alerts.map((a) => <AlertItem key={a.id} alert={a} />)}
    </div>
  )
}
