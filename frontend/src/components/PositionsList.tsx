import React from 'react'
import { clsx } from 'clsx'
import type { Position } from '../types'

interface Props {
  positions: Position[]
  onClose?: (ticket: number) => void
  canClose?: boolean
}

export default function PositionsList({ positions, onClose, canClose }: Props) {
  if (!positions.length) {
    return (
      <p className="text-slate-500 text-sm italic px-1">Sin posiciones abiertas</p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed text-xs">
        <colgroup>
          <col className="w-[19%]" />
          <col className="w-[15%]" />
          <col className="w-[8%]" />
          <col className="w-[8%]" />
          <col className="w-[12%]" />
          <col className="w-[8%]" />
          <col className="w-[8%]" />
          <col className="w-[10%]" />
          {canClose && <col className="w-[12%]" />}
        </colgroup>
        <thead>
          <tr className="border-b border-white/10 text-slate-400">
            <th className="px-3 py-2 text-left">Ticket</th>
            <th className="px-3 py-2 text-left">Símbolo</th>
            <th className="px-3 py-2 text-left">Tipo</th>
            <th className="px-3 py-2 text-right">Vol</th>
            <th className="px-3 py-2 text-right">Precio</th>
            <th className="px-3 py-2 text-right">SL</th>
            <th className="px-3 py-2 text-right">TP</th>
            <th className="px-3 py-2 text-right">P&amp;L</th>
            {canClose && <th className="px-3 py-2 text-right">Acción</th>}
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.ticket} className="border-b border-white/5 hover:bg-white/5 transition-colors">
              <td className="px-3 py-2 text-slate-400">#{p.ticket}</td>
              <td className="px-3 py-2 font-medium text-white">{p.symbol}</td>
              <td className="px-3 py-2">
                <span className={clsx(
                  'px-1.5 py-0.5 rounded font-bold text-[10px]',
                  p.type === 'BUY' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400',
                )}>
                  {p.type}
                </span>
              </td>
              <td className="px-3 py-2 text-right text-slate-300">{p.volume.toFixed(2)}</td>
              <td className="px-3 py-2 text-right text-slate-300">{p.open_price.toFixed(2)}</td>
              <td className="px-3 py-2 text-right text-red-400/80">{p.sl?.toFixed(2) ?? '—'}</td>
              <td className="px-3 py-2 text-right text-green-400/80">{p.tp?.toFixed(2) ?? '—'}</td>
              <td className={clsx(
                'px-3 py-2 text-right font-semibold',
                p.profit >= 0 ? 'text-green-400' : 'text-red-400',
              )}>
                {p.profit >= 0 ? '+' : ''}{p.profit.toFixed(2)}
              </td>
              {canClose && (
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => onClose?.(p.ticket)}
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded px-1.5 py-0.5 transition-colors"
                  >
                    Cerrar
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
