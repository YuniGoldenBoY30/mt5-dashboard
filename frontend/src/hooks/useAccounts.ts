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

export function usePerformance(login: string, enabled = true) {
  return useQuery({
    queryKey: ['performance', login],
    queryFn: () => apiGetPerformance(login, 300),
    enabled: enabled && !!login,
    staleTime: 30_000,
  })
}

export function useAccountReport(login: string, enabled = true) {
  return useQuery({
    queryKey: ['report', login],
    queryFn: () => apiGetAccountReport(login, 2000),
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
