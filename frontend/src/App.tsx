import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import TeamView from './pages/TeamView'
import DevView from './pages/DevView'
import Analytics from './pages/Analytics'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Layout from './components/Layout'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      retry: 2,
    },
  },
})

function AppContent() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-400" />
      </div>
    )
  }

  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <Routes>
          {/* Público */}
          <Route
            path="/login"
            element={!user ? <Login /> : <Navigate to="/dashboard" />}
          />

          {/* Privado — cualquier rol */}
          <Route
            path="/dashboard"
            element={user ? <Layout><Dashboard /></Layout> : <Navigate to="/login" />}
          />

          {/* Vista equipo (team + dev pueden verla) */}
          <Route
            path="/team"
            element={
              !user ? <Navigate to="/login" /> :
              (user.role === 'team' || user.role === 'dev')
                ? <Layout><TeamView /></Layout>
                : <Navigate to="/dashboard" />
            }
          />

          <Route
            path="/analytics"
            element={
              !user ? <Navigate to="/login" /> :
              (user.role === 'team' || user.role === 'dev')
                ? <Layout><Analytics /></Layout>
                : <Navigate to="/dashboard" />
            }
          />

          {/* Vista dev — solo dev */}
          <Route
            path="/dev"
            element={
              !user ? <Navigate to="/login" /> :
              user.role === 'dev'
                ? <Layout><DevView /></Layout>
                : <Navigate to="/dashboard" />
            }
          />

          <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} />} />
          <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} />} />
        </Routes>

        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1e293b',
              color: '#f1f5f9',
              border: '1px solid rgba(255,255,255,0.1)',
              fontSize: '14px',
            },
          }}
        />
      </div>
    </Router>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
