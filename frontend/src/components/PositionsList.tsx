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
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/10 text-slate-400">
            <th className="text-left pb-1.5 pr-3">Ticket</th>
            <th className="text-left pb-1.5 pr-3">Símbolo</th>
            <th className="text-left pb-1.5 pr-3">Tipo</th>
            <th className="text-right pb-1.5 pr-3">Vol</th>
            <th className="text-right pb-1.5 pr-3">Precio</th>
            <th className="text-right pb-1.5 pr-3">SL</th>
            <th className="text-right pb-1.5 pr-3">TP</th>
            <th className="text-right pb-1.5 pr-3">P&amp;L</th>
            {canClose && <th className="pb-1.5" />}
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.ticket} className="border-b border-white/5 hover:bg-white/5 transition-colors">
              <td className="py-1.5 pr-3 text-slate-400">#{p.ticket}</td>
              <td className="py-1.5 pr-3 font-medium text-white">{p.symbol}</td>
              <td className="py-1.5 pr-3">
                <span className={clsx(
                  'px-1.5 py-0.5 rounded font-bold text-[10px]',
                  p.type === 'BUY' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400',
                )}>
                  {p.type}
                </span>
              </td>
              <td className="py-1.5 pr-3 text-right text-slate-300">{p.volume.toFixed(2)}</td>
              <td className="py-1.5 pr-3 text-right text-slate-300">{p.open_price.toFixed(2)}</td>
              <td className="py-1.5 pr-3 text-right text-red-400/80">{p.sl?.toFixed(2) ?? '—'}</td>
              <td className="py-1.5 pr-3 text-right text-green-400/80">{p.tp?.toFixed(2) ?? '—'}</td>
              <td className={clsx(
                'py-1.5 pr-3 text-right font-semibold',
                p.profit >= 0 ? 'text-green-400' : 'text-red-400',
              )}>
                {p.profit >= 0 ? '+' : ''}{p.profit.toFixed(2)}
              </td>
              {canClose && (
                <td className="py-1.5 pl-1">
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
