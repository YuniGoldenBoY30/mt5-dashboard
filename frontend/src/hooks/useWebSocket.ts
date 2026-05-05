import { useEffect, useRef, useState, useCallback } from 'react'
import { createAccountsWS, apiGetAccounts } from '../services/api'
import type { Account, WebSocketMessage } from '../types'

type WSStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export function useAccountsWebSocket() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [status, setStatus] = useState<WSStatus>('connecting')
  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCount = useRef(0)
  const MAX_RETRY_DELAY = 30_000

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setStatus('connecting')
    
    // 1. Cargar estado inicial por REST para evitar dashboard vacío
    apiGetAccounts()
      .then(data => setAccounts(data))
      .catch(err => console.error("Error cargando cuentas iniciales:", err))

    const ws = createAccountsWS()
    wsRef.current = ws

    ws.onopen = () => {
      setStatus('connected')
      retryCount.current = 0
      const ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('ping')
        else clearInterval(ping)
      }, 20_000)
    }

    ws.onmessage = (evt) => {
      try {
        const msg: WebSocketMessage = JSON.parse(evt.data)
        if (msg.type === 'accounts_update' && msg.data) {
          // Capturamos los datos en una constante para asegurar el tipo en TypeScript
          const updatedData = msg.data;
          
          setAccounts(prev => {
            const newMap = new Map(prev.map(a => [a.id, a]))
            updatedData.forEach(updatedAcc => {
              newMap.set(updatedAcc.id, updatedAcc)
            })
            return Array.from(newMap.values())
          })
        }
      } catch {
        // ignore malformed messages
      }
    }

    ws.onerror = () => {
      setStatus('error')
    }

    ws.onclose = () => {
      setStatus('disconnected')
      wsRef.current = null

      // Reconexión exponencial con jitter
      const delay = Math.min(1_000 * 2 ** retryCount.current, MAX_RETRY_DELAY)
      retryCount.current++
      retryRef.current = setTimeout(connect, delay + Math.random() * 500)
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  return { accounts, status }
}
