// ─────────────────────────────────────────────────────────────
// Tipos compartidos — MT5 Multi-Account Dashboard
// ─────────────────────────────────────────────────────────────

export interface Position {
  ticket: number
  symbol: string
  type: 'BUY' | 'SELL'
  volume: number
  open_price: number
  current_price?: number
  sl?: number
  tp?: number
  profit: number
  open_time?: string
}

export interface ClosedTrade {
  ticket: number
  symbol: string
  type: 'BUY' | 'SELL' | 'OTHER'
  close_time_utc: string
  profit_net: number
}

/** Régimen de mercado detectado por QuantFib */
export type MarketRegime = 'RANGE' | 'TREND' | 'STRONG_TREND' | 'VOLATILE' | 'UNKNOWN'

/** Modo adaptativo del motor QuantFib */
export type AdaptiveMode = 'NORMAL' | 'GUARD' | 'PAUSE' | 'UNKNOWN'

/** StatusData — enviado por el bot en cada ciclo de telemetría */
export interface StatusData {
  broker: string
  login: string
  server?: string
  name?: string
  // Meta
  account_type?: 'REAL' | 'DEMO'
  asset?: string
  bot_name?: string
  timeframe?: 'Scalping' | 'Intraday' | 'Swing' | string
  initial_balance?: number
  // Cuenta
  balance: number
  equity: number
  margin: number
  free_margin: number
  margin_level: number
  drawdown_pct: number
  // QuantFib
  regime?: MarketRegime
  active_mode?: AdaptiveMode
  daily_pnl_usd?: number
  open_risk_pct?: number
  win_rate?: number
  profit_factor?: number
  max_drawdown_pct?: number
  kelly_fraction?: number
  n_trades_cycle?: number
  last_audit?: string
  closed_trades?: ClosedTrade[]
  // Posiciones
  positions: Position[]
  timestamp: string
}

/** Registro almacenado en la DB */
export interface Account {
  id: number
  broker: string
  login: string
  server?: string
  name?: string
  last_update?: string
  status_data?: StatusData
  is_active: boolean
}

export interface EquityPoint {
  timestamp_utc: string
  balance: number
  equity: number
  drawdown_pct: number
  daily_pnl_usd?: number
  regime?: MarketRegime
  active_mode?: AdaptiveMode
}

export interface PerformanceSummary {
  account_login: string
  broker: string
  equity_curve: EquityPoint[]
  total_pnl_usd: number
  max_drawdown_pct: number
  win_rate?: number
  profit_factor?: number
  n_snapshots: number
}

// ─── MT5 Report Types ─────────────────────────────────────────

export interface MT5ReportSummary {
  gain: number
  activity: number
  deposit: [number, number]
  withdrawal: [number, number]
  dividend: number
  correction: number
  credit: number
}

export interface MT5ReportIndicators {
  sharp_ratio: number
  profit_factor: number
  recovery_factor: number
  drawdown: number
  deposit_load: number
  trades_per_week: number
  hold_time: number
}

export interface MT5ReportChartPoint {
  x: number
  y: [number, number]
}

export interface MT5ReportBalance {
  balance: number
  equity: number
  period: number
  chart: MT5ReportChartPoint[]
}

export interface MT5ReportTableYear {
  year: number
  months: Record<string, number>
  total: number
}

export interface MT5ReportTable {
  years: MT5ReportTableYear[]
}

export interface AccountReportResponse {
  account: {
    name: string
    currency: string
    type: string
    broker: string
    account: number | string
    digits: number
  }
  summary: MT5ReportSummary
  summaryIndicators: MT5ReportIndicators
  balance: MT5ReportBalance
  table?: MT5ReportTable | null
}

export interface Alert {
  id: number
  account_login: string
  broker: string
  severity: 'critical' | 'warning' | 'info'
  event_type: string
  message: string
  payload?: Record<string, unknown>
  timestamp_utc: string
  acknowledged: boolean
}

export interface WebSocketMessage {
  type: 'accounts_update' | 'pong'
  data?: Account[]
}

// ─── helpers ──────────────────────────────────────────────────
export function isStale(last_update?: string, thresholdMinutes = 5): boolean {
  if (!last_update) return true
  return Date.now() - new Date(last_update).getTime() > thresholdMinutes * 60_000
}

export function ddColor(pct: number): string {
  if (pct >= 20) return 'text-red-400'
  if (pct >= 10) return 'text-yellow-400'
  return 'text-green-400'
}

export function modeColor(mode?: AdaptiveMode): string {
  if (mode === 'PAUSE') return 'text-red-400'
  if (mode === 'GUARD') return 'text-yellow-400'
  return 'text-green-400'
}

export function regimeColor(regime?: MarketRegime): string {
  if (regime === 'STRONG_TREND') return 'text-cyan-400'
  if (regime === 'TREND') return 'text-blue-400'
  if (regime === 'VOLATILE') return 'text-orange-400'
  if (regime === 'RANGE') return 'text-slate-400'
  return 'text-slate-500'
}

export function fmtUSD(value?: number): string {
  if (value == null) return '—'
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : value > 0 ? '+' : ''
  return `${sign}$${abs.toFixed(2)}`
}

export function fmtPct(value?: number): string {
  if (value == null) return '—'
  return `${value.toFixed(2)}%`
}
