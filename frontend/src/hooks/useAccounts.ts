import { useQuery } from '@tanstack/react-query'
import { apiGetAccounts, apiGetPerformance, apiGetAlerts, apiGetAccountReport } from '../services/api'

export function useAccounts() {
  return useQuery({
    queryKey: ['accounts'],
    queryFn: apiGetAccounts,
    refetchInterval: 10_000,
    staleTime: 5_000,
  })
}

export function usePerformance(login: string, limit: number = 300, enabled = true) {
  return useQuery({
    queryKey: ['performance', login, limit],
    queryFn: () => apiGetPerformance(login, limit),
    enabled: enabled && !!login,
    staleTime: 30_000,
  })
}

export function useAccountReport(login: string, limit: number = 2000, enabled = true) {
  return useQuery({
    queryKey: ['report', login, limit],
    queryFn: () => apiGetAccountReport(login, limit),
    enabled: enabled && !!login,
    staleTime: 60_000,
  })
}

export function useAlerts(acknowledged?: boolean) {
  return useQuery({
    queryKey: ['alerts', acknowledged],
    queryFn: () => apiGetAlerts(acknowledged, 50),
    refetchInterval: 15_000,
  })
}
