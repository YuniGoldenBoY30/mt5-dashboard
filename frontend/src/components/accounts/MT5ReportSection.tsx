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
    <div className="space-y-6 mt-8 pt-8 border-t border-white/[0.04]">
      <div className="flex items-center gap-2 mb-6">
        <FileBarChart className="w-5 h-5 text-cyan-400" />
        <h2 className="text-xl font-bold text-white">Reporte de Cuenta MT5</h2>
      </div>

      {/* Account Info Header */}
      <div className="bg-[#111827]/40 border border-white/[0.04] rounded-2xl p-5 flex flex-wrap gap-x-8 gap-y-3 text-sm backdrop-blur-sm">
        <div><span className="text-slate-400">Nombre:</span> <span className="text-white font-medium ml-1">{account.name}</span></div>
        <div><span className="text-slate-400">Cuenta:</span> <span className="text-white font-medium ml-1">{account.account}</span></div>
        <div><span className="text-slate-400">Broker:</span> <span className="text-white font-medium ml-1">{account.broker}</span></div>
        <div><span className="text-slate-400">Moneda:</span> <span className="text-white font-medium ml-1">{account.currency}</span></div>
        <div><span className="text-slate-400">Tipo:</span> <span className="text-white font-medium capitalize ml-1">{account.type}</span></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Resumen */}
        <div className="bg-[#111827]/40 border border-white/[0.04] rounded-2xl overflow-hidden backdrop-blur-sm">
          <div className="px-5 py-4 border-b border-white/[0.04]">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Resumen</h3>
          </div>
          <div className="p-5 space-y-4 text-sm">
            <div className="flex justify-between border-b border-white/[0.02] pb-3">
              <span className="text-slate-400">Beneficio/Pérdida</span>
              <span className={summary.gain >= 0 ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                {fmtPct(summary.gain * 100)}
              </span>
            </div>
            <div className="flex justify-between border-b border-white/[0.02] pb-3">
              <span className="text-slate-400">Actividad de trading</span>
              <span className="text-white font-medium">{fmtPct(summary.activity * 100)}</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.02] pb-3">
              <span className="text-slate-400">Depósito</span>
              <span className="text-white font-medium">{fmtUSD(summary.deposit[0])}</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.02] pb-3">
              <span className="text-slate-400">Retirada</span>
              <span className="text-white font-medium">{fmtUSD(summary.withdrawal[0])}</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.02] pb-3">
              <span className="text-slate-400">Crédito</span>
              <span className="text-white font-medium">{fmtUSD(summary.credit)}</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.02] pb-3">
              <span className="text-slate-400">Dividendo</span>
              <span className="text-white font-medium">{fmtUSD(summary.dividend)}</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.02] pb-3">
              <span className="text-slate-400">Corrección</span>
              <span className="text-white font-medium">{fmtUSD(summary.correction)}</span>
            </div>
            <div className="flex justify-between pt-2">
              <span className="text-slate-400 font-medium">Balance</span>
              <span className="text-white font-bold text-base">{fmtUSD(balance.balance)}</span>
            </div>
            <div className="flex justify-between pt-1">
              <span className="text-slate-400 font-medium">Equidad</span>
              <span className="text-white font-bold text-base">{fmtUSD(balance.equity)}</span>
            </div>
          </div>
        </div>

        {/* Indicadores */}
        <div className="bg-[#111827]/40 border border-white/[0.04] rounded-2xl overflow-hidden backdrop-blur-sm">
          <div className="px-5 py-4 border-b border-white/[0.04]">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Indicadores</h3>
          </div>
          <div className="p-5 space-y-4 text-sm">
            <div className="flex justify-between border-b border-white/[0.02] pb-3">
              <span className="text-slate-400">Ratio de Sharpe</span>
              <span className="text-white font-medium">{summaryIndicators.sharp_ratio.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.02] pb-3">
              <span className="text-slate-400">Factor de beneficio</span>
              <span className="text-white font-medium">{summaryIndicators.profit_factor.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.02] pb-3">
              <span className="text-slate-400">Factor de recuperación</span>
              <span className="text-white font-medium">{summaryIndicators.recovery_factor.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.02] pb-3">
              <span className="text-slate-400">Drawdown de equidad</span>
              <span className={`font-bold ${summaryIndicators.drawdown >= 0.1 ? "text-red-400" : "text-yellow-400"}`}>
                {fmtPct(summaryIndicators.drawdown * 100)}
              </span>
            </div>
            <div className="flex justify-between border-b border-white/[0.02] pb-3">
              <span className="text-slate-400">Carga del depósito</span>
              <span className="text-white font-medium">{fmtPct(summaryIndicators.deposit_load * 100)}</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.02] pb-3">
              <span className="text-slate-400">Transacciones por semana</span>
              <span className="text-white font-medium">{summaryIndicators.trades_per_week.toFixed(1)}</span>
            </div>
            <div className="flex justify-between pt-2">
              <span className="text-slate-400 font-medium">Tiempo de mantenimiento (min)</span>
              <span className="text-white font-medium">{summaryIndicators.hold_time.toFixed(0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-[#111827]/40 border border-white/[0.04] rounded-2xl overflow-hidden backdrop-blur-sm">
        <div className="px-5 py-4 border-b border-white/[0.04]">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Gráfico de Equidad / Balance</h3>
        </div>
        <div className="p-6">
          <MT5BalanceChart balanceData={balance} initialBalance={summary.deposit[0]} height={350} />
        </div>
      </div>

      {/* Table (Heatmap Mensual/Anual) */}
      {report.table && report.table.years && report.table.years.length > 0 && (
        <div className="bg-[#111827]/40 border border-white/[0.04] rounded-2xl overflow-hidden backdrop-blur-sm">
          <div className="px-5 py-4 border-b border-white/[0.04]">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Rendimiento Mensual (%)</h3>
          </div>
          <div className="p-6 overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead>
                <tr className="text-slate-400 border-b border-white/10">
                  <th className="text-left font-medium py-2 px-2">Año</th>
                  <th className="font-medium py-2 px-2">Ene</th>
                  <th className="font-medium py-2 px-2">Feb</th>
                  <th className="font-medium py-2 px-2">Mar</th>
                  <th className="font-medium py-2 px-2">Abr</th>
                  <th className="font-medium py-2 px-2">May</th>
                  <th className="font-medium py-2 px-2">Jun</th>
                  <th className="font-medium py-2 px-2">Jul</th>
                  <th className="font-medium py-2 px-2">Ago</th>
                  <th className="font-medium py-2 px-2">Sep</th>
                  <th className="font-medium py-2 px-2">Oct</th>
                  <th className="font-medium py-2 px-2">Nov</th>
                  <th className="font-medium py-2 px-2">Dic</th>
                  <th className="font-medium py-2 px-2 text-cyan-400">YTD</th>
                </tr>
              </thead>
              <tbody>
                {report.table.years.map((yData) => (
                  <tr key={yData.year} className="border-b border-white/5 hover:bg-slate-800/60 transition-colors">
                    <td className="text-left font-medium text-slate-300 py-3 px-2">{yData.year}</td>
                    {Array.from({length: 12}, (_, i) => {
                      const mKey = String(i + 1);
                      const val = yData.months[mKey];
                      return (
                        <td key={mKey} className={`py-3 px-2 font-medium ${val > 0 ? 'text-green-400' : val < 0 ? 'text-red-400' : 'text-slate-600'}`}>
                          {val !== undefined ? `${val > 0 ? '+' : ''}${val.toFixed(2)}%` : '-'}
                        </td>
                      )
                    })}
                    <td className={`py-3 px-2 font-bold ${yData.total > 0 ? 'text-green-400' : yData.total < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                      {yData.total !== undefined ? `${yData.total > 0 ? '+' : ''}${yData.total.toFixed(2)}%` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
    </div>
  )
}
