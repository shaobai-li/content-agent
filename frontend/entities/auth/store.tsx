"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
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

const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, status: 'loading' })
  const router = useRouter()

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
  }, [])

  const logout = useCallback(() => {
    apiClearToken()
    setState({ user: null, status: 'unauthenticated' })
    router.replace('/login')
  }, [router])

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
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (auth.loading || !auth.enabled) return
    if (auth.status === 'unauthenticated' && pathname !== '/login') {
      router.replace('/login')
    }
    if (auth.status === 'authenticated' && pathname === '/login') {
      router.replace('/')
    }
  }, [auth.status, auth.loading, auth.enabled, pathname, router])

  if (auth.enabled && auth.loading) return null
  if (auth.enabled && auth.status === 'unauthenticated' && pathname !== '/login') return null

  return <>{children}</>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
