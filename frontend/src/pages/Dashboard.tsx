import React, { useMemo } from 'react'
import { DollarSign, TrendingDown, Activity, Wifi } from 'lucide-react'
import { useAccountsWebSocket } from '../hooks/useWebSocket'
import AccountCard from '../components/accounts/AccountCard'
import StatCard from '../components/StatCard'
import ConnectionStatus from '../components/ConnectionStatus'
import AlertsPanel from '../components/AlertsPanel'
import { fmtUSD } from '../types'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClosePosition } from '../services/api'
import toast from 'react-hot-toast'

export default function Dashboard() {
  const { accounts, status } = useAccountsWebSocket()
  const qc = useQueryClient()

  // Agregados globales
  const summary = useMemo(() => {
    const active = accounts.filter((a) => a.status_data)
    const totalEquity = active.reduce((s, a) => s + (a.status_data?.equity ?? 0), 0)
    const totalBalance = active.reduce((s, a) => s + (a.status_data?.balance ?? 0), 0)
    const totalPnl = active.reduce((s, a) => s + (a.status_data?.daily_pnl_usd ?? 0), 0)
    // Máximo DD: validar que haya al menos una cuenta antes de hacer Math.max
    const ddValues = active.map((a) => a.status_data?.drawdown_pct ?? 0).filter((dd) => dd >= 0)
    const maxDD = ddValues.length > 0 ? Math.max(...ddValues) : 0
    const openPositions = active.reduce((s, a) => s + (a.status_data?.positions?.length ?? 0), 0)
    const pausedAccounts = active.filter((a) => a.status_data?.active_mode === 'PAUSE').length
    return { totalEquity, totalBalance, totalPnl, maxDD, openPositions, pausedAccounts, count: active.length }
  }, [accounts])

  const closeMutation = useMutation({
    mutationFn: ({ accountId, ticket }: { accountId: number; ticket: number }) =>
      apiClosePosition(accountId, ticket),
    onSuccess: () => {
      toast.success('Posición cerrada')
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
    onError: (e: Error) => toast.error(`Error: ${e.message}`),
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {summary.count} cuenta{summary.count !== 1 ? 's' : ''} activa{summary.count !== 1 ? 's' : ''}
          </p>
        </div>
        <ConnectionStatus status={status} />
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="Equity total"
          value={`$${summary.totalEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          icon={<DollarSign className="w-4 h-4" />}
          colorClass="text-obsidian-accent"
          isVIP
        />
        <StatCard
          label="P&L de hoy"
          value={fmtUSD(summary.totalPnl)}
          icon={<Activity className="w-4 h-4" />}
          colorClass={summary.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}
        />
        <StatCard
          label="Max DD global"
          value={`${summary.maxDD.toFixed(2)}%`}
          icon={<TrendingDown className="w-4 h-4" />}
          colorClass={summary.maxDD >= 20 ? 'text-red-400' : summary.maxDD >= 10 ? 'text-yellow-400' : 'text-green-400'}
        />
        <StatCard
          label="Posiciones abiertas"
          value={summary.openPositions}
          icon={<Wifi className="w-4 h-4" />}
        />
        <StatCard
          label="Cuentas en PAUSE"
          value={summary.pausedAccounts}
          colorClass={summary.pausedAccounts > 0 ? 'text-red-400' : 'text-slate-500'}
        />
      </div>

      {/* Alertas activas */}
      <div className="bento-card px-4 py-4">
        <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
          <div className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
          Alertas Activas
        </h2>
        <AlertsPanel />
      </div>

      {/* Accounts grid */}
      <div>
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-3">Cuentas</h2>
        {accounts.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-slate-800/40 px-6 py-12 text-center text-slate-500">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>Sin cuentas registradas.</p>
            <p className="text-xs mt-1">Los bots deben enviar telemetría a <code>/api/v1/telemetry</code></p>
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => (
              <AccountCard
                key={`${account.id}-${account.login}`}
                account={account}
                canClose={false}
                onClosePosition={(id, ticket) => closeMutation.mutate({ accountId: id, ticket })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
