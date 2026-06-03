"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getMe, getToken, clearToken as apiClearToken } from '@/shared/api/auth'

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthState {
  user: { id: number; username: string } | null
  status: AuthStatus
}

interface AuthContextValue extends AuthState {
  login: (user: { id: number; username: string }) => void
  logout: () => void
  enabled: boolean
  loading: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

const AUTH_ENABLED = import.meta.env.VITE_AUTH_ENABLED === 'true'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, status: 'loading' })
  const navigate = useNavigate()

  // 初始化：检查 token 是否有效
  useEffect(() => {
    if (!AUTH_ENABLED) {
      setState({ user: null, status: 'unauthenticated' })
      return
    }

    const token = getToken()
    if (!token) {
      setState({ user: null, status: 'unauthenticated' })
      return
    }

    getMe()
      .then((user) => setState({ user, status: 'authenticated' }))
      .catch(() => {
        setState({ user: null, status: 'unauthenticated' })
      })
  }, [])

  const login = useCallback((user: { id: number; username: string }) => {
    setState({ user, status: 'authenticated' })
    localStorage.setItem('auth-user', JSON.stringify(user))
  }, [])

  const logout = useCallback(() => {
    apiClearToken()
    setState({ user: null, status: 'unauthenticated' })
    navigate('/login', { replace: true })
  }, [navigate])

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        enabled: AUTH_ENABLED,
        loading: state.status === 'loading',
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const navigate = useNavigate()
  const pathname = useLocation().pathname

  useEffect(() => {
    if (auth.loading || !auth.enabled) return
    if (auth.status === 'unauthenticated' && pathname !== '/login') {
      navigate('/login', { replace: true })
    }
    if (auth.status === 'authenticated' && pathname === '/login') {
      navigate('/', { replace: true })
    }
  }, [auth.status, auth.loading, auth.enabled, pathname, navigate])

  if (auth.enabled && auth.loading) return null
  if (auth.enabled && auth.status === 'unauthenticated' && pathname !== '/login') return null

  return <>{children}</>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
