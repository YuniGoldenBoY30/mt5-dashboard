// ─────────────────────────────────────────────────────────────
// API Client — MT5 Dashboard
// ─────────────────────────────────────────────────────────────
import type { Account, Alert, PerformanceSummary, AccountReportResponse } from '../types'

const BASE = import.meta.env.VITE_API_URL || '/api/v1'


function getToken(): string | null {
  return localStorage.getItem('token')
}

function authHeaders(): HeadersInit {
  const token = getToken()
  const apiKey = import.meta.env.VITE_API_KEY || ''
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-API-KEY': apiKey
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

// ─── Auth ─────────────────────────────────────────────────────
export interface LoginResponse {
  access_token: string
  token_type: string
  role: string
  username: string
}

export async function apiLogin(username: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'X-API-KEY': import.meta.env.VITE_API_KEY || ''
    },
    body: JSON.stringify({ username, password }),
  })

  return handleResponse<LoginResponse>(res)
}

export async function apiGetMe(): Promise<{ username: string; role: string }> {
  const res = await fetch(`${BASE}/me`, { headers: authHeaders() })
  return handleResponse(res)
}

// ─── Accounts ─────────────────────────────────────────────────
export async function apiGetAccounts(): Promise<Account[]> {
  const res = await fetch(`${BASE}/accounts`, { headers: authHeaders() })
  return handleResponse<Account[]>(res)
}

export async function apiGetAccount(id: number): Promise<Account> {
  const res = await fetch(`${BASE}/accounts/${id}`, { headers: authHeaders() })
  return handleResponse<Account>(res)
}

export async function apiGetAccountTrades(login: string, limit = 1000): Promise<any> {
  const res = await fetch(`${BASE}/accounts/${encodeURIComponent(login)}/trades?limit=${limit}`, {
    headers: authHeaders(),
  })
  return handleResponse(res)
}

// ─── Performance ──────────────────────────────────────────────
export async function apiGetPerformance(login: string, limit = 500): Promise<PerformanceSummary> {
  const res = await fetch(`${BASE}/performance/${encodeURIComponent(login)}?limit=${limit}`, {
    headers: authHeaders(),
  })
  return handleResponse<PerformanceSummary>(res)
}

export async function apiGetAccountReport(login: string, limit = 1000): Promise<AccountReportResponse> {
  const res = await fetch(`${BASE}/report/${encodeURIComponent(login)}?limit=${limit}`, {
    headers: authHeaders(),
  })
  return handleResponse<AccountReportResponse>(res)
}

// ─── Actions ──────────────────────────────────────────────────
export interface ClosePositionResponse {
  status: string
  ticket: number
  command_id: number
  message?: string | null
}

export async function apiClosePosition(accountId: number, ticket: number): Promise<ClosePositionResponse> {
  const res = await fetch(`${BASE}/close-position`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ account_id: accountId, ticket }),
  })
  return handleResponse<ClosePositionResponse>(res)
}

// ─── Alerts ───────────────────────────────────────────────────
export async function apiGetAlerts(acknowledged?: boolean, limit = 100): Promise<Alert[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (acknowledged !== undefined) params.set('acknowledged', String(acknowledged))
  const res = await fetch(`${BASE}/alerts?${params}`, { headers: authHeaders() })
  return handleResponse<Alert[]>(res)
}

export async function apiAckAlert(alertId: number): Promise<void> {
  const res = await fetch(`${BASE}/alerts/${alertId}/ack`, {
    method: 'POST',
    headers: authHeaders(),
  })
  return handleResponse(res)
}

export function createAccountsWS(): WebSocket {
  const path = import.meta.env.VITE_WS_URL
  if (path && (path.startsWith('ws://') || path.startsWith('wss://'))) {
    return new WebSocket(path)
  }
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const host = window.location.host
  const wsPath = path || '/ws/accounts'
  return new WebSocket(`${protocol}://${host}${wsPath}`)
}
