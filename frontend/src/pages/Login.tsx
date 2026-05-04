import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { apiLogin } from '../services/api'
import toast from 'react-hot-toast'
import { LogIn, Shield, Activity } from 'lucide-react'

const Login: React.FC = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const data = await apiLogin(username, password)
      login(data.access_token, data.role, data.username)
      toast.success(`Bienvenido, ${data.username}`)
      navigate('/dashboard')
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error al iniciar sesión'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Brand */}
      <div className="flex items-center gap-2 mb-8 text-white">
        <Activity className="w-7 h-7 text-cyan-400" />
        <span className="text-xl font-bold tracking-wide">MT5 Dashboard</span>
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900/70 backdrop-blur p-7 text-white shadow-2xl">
        <div className="flex items-center gap-2 mb-6">
          <Shield className="w-5 h-5 text-cyan-400" />
          <h1 className="text-lg font-semibold">Iniciar sesión</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Usuario</label>
            <input
              className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm outline-none focus:border-cyan-400 transition-colors placeholder-slate-600"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="team o dev"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1">Contraseña</label>
            <input
              type="password"
              className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm outline-none focus:border-cyan-400 transition-colors"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            {loading ? 'Entrando…' : 'Iniciar sesión'}
          </button>
        </form>

        <p className="text-xs text-slate-600 text-center mt-5">
          Roles disponibles: <span className="text-slate-500">team</span> · <span className="text-slate-500">dev</span>
        </p>
      </div>
    </div>
  )
}

export default Login
