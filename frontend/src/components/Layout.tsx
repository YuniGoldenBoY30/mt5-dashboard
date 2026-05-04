import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import { LayoutDashboard, Users, Code2, LogOut, Activity } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

type Props = { children: React.ReactNode }

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['team', 'dev'] },
  { to: '/team',      label: 'Team',       icon: Users,           roles: ['team', 'dev'] },
  { to: '/analytics', label: 'Analytics',   icon: Activity,         roles: ['team', 'dev'] },
  { to: '/dev',       label: 'Dev',        icon: Code2,           roles: ['dev'] },
]

export default function Layout({ children }: Props) {
  const { user, logout } = useAuth()
  const location = useLocation()

  return (
    <div className="min-h-screen bg-obsidian-bg text-slate-200 flex flex-col">
      <header className="sticky top-0 z-40 border-b border-obsidian-border bg-obsidian-card/80 backdrop-blur-md shadow-xl">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2 font-bold text-white shrink-0 group">
            <div className="p-1 rounded bg-obsidian-accent">
              <Activity className="w-4 h-4 text-black" />
            </div>
            <span className="text-sm tracking-tighter uppercase font-black">QuantFib <span className="text-obsidian-accent">VIP</span></span>
          </div>

          {/* Nav */}
          <nav className="flex gap-1">
            {navItems
              .filter((item) => user && (item.roles as string[]).includes(user.role))
              .map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all',
                    location.pathname === to
                      ? 'bg-white/5 text-obsidian-accent shadow-[inset_0_-2px_0_0_#ffd700]'
                      : 'text-slate-500 hover:text-white hover:bg-white/5',
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </Link>
              ))}
          </nav>

          {/* User */}
          <div className="ml-auto flex items-center gap-3">
            <span className="text-[10px] font-mono text-slate-600 hidden sm:block uppercase tracking-widest">
              Session: {user?.username}
              <span className={clsx(
                'ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold border',
                user?.role === 'dev' ? 'border-obsidian-tech text-obsidian-tech' : 'border-obsidian-accent text-obsidian-accent',
              )}>
                {user?.role}
              </span>
            </span>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold text-slate-500 hover:text-red-400 hover:bg-red-500/5 transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:block">LOGOUT</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        {children}
      </main>
    </div>
  )
}
