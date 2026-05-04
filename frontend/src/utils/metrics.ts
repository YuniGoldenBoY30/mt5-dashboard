// Métricas financieras desde equity curve
import type { EquityPoint } from '../types'

/** Calcula CAGR (%) dados equity points (asume intervalos regulares en días) */
export function calcCAGR(points: EquityPoint[]): number {
  if (points.length < 2) return 0
  const start = points[0].equity
  const end = points[points.length - 1].equity
  if (start <= 0) return 0

  // Diferencia en días (UTC)
  const t0 = new Date(points[0].timestamp_utc).getTime()
  const t1 = new Date(points[points.length - 1].timestamp_utc).getTime()
  const years = (t1 - t0) / (1000 * 60 * 60 * 24 * 365.25)
  if (years <= 0) return 0

  return ((end / start) ** (1 / years) - 1) * 100
}

/** Sharpe Ratio simple: retornos por barra anualizados */
export function calcSharpe(points: EquityPoint[]): number {
  if (points.length < 3) return 0
  // Retornos simples por barra
  const returns = []
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].equity
    const curr = points[i].equity
    if (prev > 0) returns.push((curr - prev) / prev)
  }
  if (returns.length === 0) return 0
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const std = Math.sqrt(returns.map(r => (r - mean) ** 2).reduce((a, b) => a + b, 0) / returns.length)
  if (std === 0) return 0
  // Anualizar: asumiendo 96 barras M15 por día * 252 días ≈ 24192 períodos/año
  const periodsPerYear = 96 * 252
  return (mean / std) * Math.sqrt(periodsPerYear)
}

/** Sortino: igual que Sharpe pero solo downside deviation */
export function calcSortino(points: EquityPoint[]): number {
  if (points.length < 3) return 0
  const returns = []
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].equity
    const curr = points[i].equity
    if (prev > 0) returns.push((curr - prev) / prev)
  }
  if (returns.length === 0) return 0
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const downside = returns.filter(r => r < 0)
  if (downside.length === 0) return mean > 0 ? 100 : 0
  const downsideVar = downside.map(r => r ** 2).reduce((a, b) => a + b, 0) / downside.length
  const downsideStd = Math.sqrt(downsideVar)
  if (downsideStd === 0) return 0
  const periodsPerYear = 96 * 252
  return (mean / downsideStd) * Math.sqrt(periodsPerYear)
}

/** Calmar = CAGR / Max Drawdown (en %) */
export function calcCalmar(cagr: number, maxDD: number): number {
  if (maxDD <= 0) return cagr > 0 ? 100 : 0
  return cagr / Math.abs(maxDD)
}

/** Max drawdown ya calculado, pero opcional recalcular desde curva */
export function maxDrawdown(points: EquityPoint[]): number {
  if (points.length === 0) return 0
  let peak = points[0].equity
  let maxDD = 0
  for (const p of points) {
    if (p.equity > peak) peak = p.equity
    const dd = (peak - p.equity) / peak * 100
    if (dd > maxDD) maxDD = dd
  }
  return maxDD
}
