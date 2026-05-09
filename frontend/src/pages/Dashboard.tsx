import React, { useMemo, useState } from 'react'
import { DollarSign, TrendingDown, Activity, Wifi, Filter } from 'lucide-react'
import { useAccountsWebSocket } from '../hooks/useWebSocket'
import { usePerformance } from '../hooks/useAccounts'
import AccountCard from '../components/accounts/AccountCard'
import StatCard from '../components/StatCard'
import ConnectionStatus from '../components/ConnectionStatus'
import AlertsPanel from '../components/AlertsPanel'
import { fmtUSD } from '../types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClosePosition, apiGetAccountTrades } from '../services/api'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import AccountAnalyticsTabs from '../components/charts/AccountAnalyticsTabs'

export default function Dashboard() {
  const { accounts, status } = useAccountsWebSocket()
  const qc = useQueryClient()
  
  const [accountTypeFilter, setAccountTypeFilter] = useState<'ALL' | 'REAL' | 'DEMO'>('ALL')
  const [summaryLogin, setSummaryLogin] = useState<string>('')

  const filteredAccounts = useMemo(() => {
    return accounts.filter(a => {
      if (accountTypeFilter === 'ALL') return true
      const type = a.status_data?.account_type?.toUpperCase()
      return type === accountTypeFilter
    })
  }, [accounts, accountTypeFilter])

  React.useEffect(() => {
    if (!filteredAccounts.length) return
    const stillExists = filteredAccounts.some((a) => a.login === summaryLogin)
    if (!summaryLogin || !stillExists) {
      setSummaryLogin(filteredAccounts[0].login)
    }
  }, [filteredAccounts, summaryLogin])

  // Agregados globales
  const summary = useMemo(() => {
    const active = filteredAccounts.filter((a) => a.status_data)
    const totalEquity = active.reduce((s, a) => s + (a.status_data?.equity ?? 0), 0)
    const totalBalance = active.reduce((s, a) => s + (a.status_data?.balance ?? 0), 0)
    const totalPnl = active.reduce((s, a) => s + (a.status_data?.daily_pnl_usd ?? 0), 0)
    // Máximo DD: validar que haya al menos una cuenta antes de hacer Math.max
    const ddValues = active.map((a) => a.status_data?.drawdown_pct ?? 0).filter((dd) => dd >= 0)
    const maxDD = ddValues.length > 0 ? Math.max(...ddValues) : 0
    const openPositions = active.reduce((s, a) => s + (a.status_data?.positions?.length ?? 0), 0)
    const pausedAccounts = active.filter((a) => a.status_data?.active_mode === 'PAUSE').length
    return { totalEquity, totalBalance, totalPnl, maxDD, openPositions, pausedAccounts, count: active.length }
  }, [filteredAccounts])

  const summaryAccount = filteredAccounts.find((a) => a.login === summaryLogin)
  const { data: summaryPerf } = usePerformance(summaryLogin, 2000, !!summaryLogin)
  const { data: summaryTrades = [] } = useQuery({
    queryKey: ['dashboard_summary_trades', summaryLogin],
    queryFn: () => apiGetAccountTrades(summaryLogin, 2000),
    enabled: !!summaryLogin,
  })

  const closeMutation = useMutation({
    mutationFn: ({ accountId, ticket }: { accountId: number; ticket: number }) =>
      apiClosePosition(accountId, ticket),
    onSuccess: (result) => {
      toast.success(result.message ?? `Orden de cierre enviada para ticket #${result.ticket}`)
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

      {summaryAccount && summaryPerf?.equity_curve?.length ? (
        <div className="bg-[#111827]/40 border border-white/[0.04] rounded-2xl overflow-hidden backdrop-blur-sm">
          <div className="border-b border-white/[0.04] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Summary</h2>
              <div className="text-xs text-slate-500 mt-1">Evolución principal de la cuenta seleccionada</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Cuenta</span>
              <select
                value={summaryLogin}
                onChange={(e) => setSummaryLogin(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-white"
              >
                {filteredAccounts.filter((a) => a.status_data).map((a) => (
                  <option key={a.id} value={a.login}>
                    {a.status_data?.name ?? a.login}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="p-6">
            <AccountAnalyticsTabs
              curve={summaryPerf.equity_curve}
              trades={summaryTrades}
              initialBalance={summaryAccount.status_data?.initial_balance}
              summaryOnly
              title="Summary"
            />
          </div>
        </div>
      ) : null}

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
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Cuentas</h2>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <div className="flex bg-slate-800/60 rounded-lg p-1 border border-white/5">
              {(['ALL', 'REAL', 'DEMO'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setAccountTypeFilter(type)}
                  className={clsx(
                    'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                    accountTypeFilter === type 
                      ? 'bg-slate-700 text-white shadow-sm' 
                      : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800'
                  )}
                >
                  {type === 'ALL' ? 'Todas' : type}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {filteredAccounts.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-slate-800/40 px-6 py-12 text-center text-slate-500">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>Sin cuentas registradas para este filtro.</p>
            <p className="text-xs mt-1">Los bots deben enviar telemetría a <code>/api/v1/telemetry</code></p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAccounts.map((account) => (
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
