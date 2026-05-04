import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

export interface AuthUser {
  username: string
  role: 'team' | 'dev'
}

interface AuthContextType {
  user: AuthUser | null
  login: (token: string, role: string, username: string) => void
  logout: () => void
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function decodeUserFromToken(token: string): AuthUser | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    // role está incluido en el JWT payload (sub + role)
    return {
      username: payload.sub as string,
      role: (payload.role ?? 'team') as 'team' | 'dev',
    }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      const decoded = decodeUserFromToken(token)
      if (decoded) {
        // El role guardado en localStorage tiene prioridad por si el JWT no lo incluye
        const savedRole = localStorage.getItem('role') as 'team' | 'dev' | null
        setUser({ ...decoded, role: savedRole ?? decoded.role })
      } else {
        localStorage.removeItem('token')
        localStorage.removeItem('role')
      }
    }
    setLoading(false)
  }, [])

  const login = (token: string, role: string, username: string) => {
    localStorage.setItem('token', token)
    localStorage.setItem('role', role)
    setUser({ username, role: role as 'team' | 'dev' })
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('role')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
