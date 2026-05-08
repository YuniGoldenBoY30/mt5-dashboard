import React from 'react'
import { FileBarChart } from 'lucide-react'
import { useAccountReport } from '../../hooks/useAccounts'
import { fmtUSD, fmtPct } from '../../types'
import MT5BalanceChart from '../charts/MT5BalanceChart'

interface Props {
  login: string
  limit?: number
}

export default function MT5ReportSection({ login, limit = 2000 }: Props) {
  const { data: report, isLoading, error } = useAccountReport(login, limit)

  if (isLoading) {
    return <div className="text-sm text-slate-500 animate-pulse">Cargando Reporte MT5...</div>
  }

  if (error || !report) {
    return <div className="text-sm text-red-400">Error al cargar reporte MT5.</div>
  }

  const { account, summary, summaryIndicators, balance } = report

  return (
    <div className="space-y-6 mt-8 pt-6 border-t border-white/10">
      <div className="flex items-center gap-2 mb-4">
        <FileBarChart className="w-5 h-5 text-cyan-400" />
        <h2 className="text-xl font-bold text-white">Reporte de Cuenta MT5</h2>
      </div>

      {/* Account Info Header */}
      <div className="bg-slate-800/40 border border-white/10 rounded-xl p-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div><span className="text-slate-400">Nombre:</span> <span className="text-white font-medium">{account.name}</span></div>
        <div><span className="text-slate-400">Cuenta:</span> <span className="text-white font-medium">{account.account}</span></div>
        <div><span className="text-slate-400">Broker:</span> <span className="text-white font-medium">{account.broker}</span></div>
        <div><span className="text-slate-400">Moneda:</span> <span className="text-white font-medium">{account.currency}</span></div>
        <div><span className="text-slate-400">Tipo:</span> <span className="text-white font-medium capitalize">{account.type}</span></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Resumen */}
        <div className="bg-slate-800/40 border border-white/10 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-slate-900/40 border-b border-white/10">
            <h3 className="text-sm font-semibold text-slate-300">Resumen</h3>
          </div>
          <div className="p-4 space-y-3 text-sm">
            <div className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-slate-400">Beneficio/Pérdida</span>
              <span className={summary.gain >= 0 ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                {fmtPct(summary.gain * 100)}
              </span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-slate-400">Actividad de trading</span>
              <span className="text-white">{fmtPct(summary.activity * 100)}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-slate-400">Depósito</span>
              <span className="text-white">{fmtUSD(summary.deposit[0])}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-slate-400">Retirada</span>
              <span className="text-white">{fmtUSD(summary.withdrawal[0])}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-slate-400">Crédito</span>
              <span className="text-white">{fmtUSD(summary.credit)}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-slate-400">Dividendo</span>
              <span className="text-white">{fmtUSD(summary.dividend)}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-slate-400">Corrección</span>
              <span className="text-white">{fmtUSD(summary.correction)}</span>
            </div>
            <div className="flex justify-between pt-2">
              <span className="text-slate-400 font-medium">Balance</span>
              <span className="text-white font-bold">{fmtUSD(balance.balance)}</span>
            </div>
            <div className="flex justify-between pt-1">
              <span className="text-slate-400 font-medium">Equidad</span>
              <span className="text-white font-bold">{fmtUSD(balance.equity)}</span>
            </div>
          </div>
        </div>

        {/* Indicadores */}
        <div className="bg-slate-800/40 border border-white/10 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-slate-900/40 border-b border-white/10">
            <h3 className="text-sm font-semibold text-slate-300">Indicadores</h3>
          </div>
          <div className="p-4 space-y-3 text-sm">
            <div className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-slate-400">Ratio de Sharpe</span>
              <span className="text-white">{summaryIndicators.sharp_ratio.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-slate-400">Factor de beneficio</span>
              <span className="text-white">{summaryIndicators.profit_factor.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-slate-400">Factor de recuperación</span>
              <span className="text-white">{summaryIndicators.recovery_factor.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-slate-400">Drawdown de equidad</span>
              <span className={summaryIndicators.drawdown >= 0.1 ? "text-red-400" : "text-yellow-400"}>
                {fmtPct(summaryIndicators.drawdown * 100)}
              </span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-slate-400">Carga del depósito</span>
              <span className="text-white">{fmtPct(summaryIndicators.deposit_load * 100)}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-slate-400">Transacciones por semana</span>
              <span className="text-white">{summaryIndicators.trades_per_week.toFixed(1)}</span>
            </div>
            <div className="flex justify-between pt-2">
              <span className="text-slate-400">Tiempo de mantenimiento (min)</span>
              <span className="text-white">{summaryIndicators.hold_time.toFixed(0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-slate-800/40 border border-white/10 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-900/40 border-b border-white/10">
          <h3 className="text-sm font-semibold text-slate-300">Gráfico de Equidad / Balance</h3>
        </div>
        <div className="p-4">
          <MT5BalanceChart balanceData={balance} initialBalance={summary.deposit[0]} height={350} />
        </div>
      </div>
      
    </div>
  )
}
