import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, realtime } from '../api'
import { getToken, setToken } from '../api/session'
import { ApiError, type AuthResult, type Theme, type User } from '../api/types'

// The signed-in user is the only app-wide state; everything else is server
// data held by TanStack Query.

type AuthState =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'anonymous'; expired: boolean }
  | { status: 'authenticated'; user: User }

interface AuthContextValue {
  state: AuthState
  user: User | null
  signedIn(result: AuthResult): void
  setUser(user: User): void
  signOut(): Promise<void>
  retry(): void
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Fired by the query/mutation caches when any request returns 401.
const expiredListeners = new Set<() => void>()
export function notifyUnauthenticated() {
  expiredListeners.forEach((l) => l())
}

const THEME_KEY = 'taskloom-theme'

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // ignore
  }
}

export function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // ignore
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<AuthState>(() => (getToken() ? { status: 'loading' } : { status: 'anonymous', expired: false }))
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const token = getToken()
    if (!token) return
    let active = true
    api.auth
      .me()
      .then((user) => {
        if (!active) return
        setState({ status: 'authenticated', user })
        realtime.connect(token)
      })
      .catch((error: ApiError) => {
        if (!active) return
        if (error.code === 'UNAUTHENTICATED') {
          setToken(null)
          setState({ status: 'anonymous', expired: true })
        } else {
          setState({ status: 'error', error })
        }
      })
    return () => {
      active = false
    }
  }, [attempt])

  useEffect(() => {
    if (state.status === 'authenticated') applyTheme(state.user.theme)
  }, [state])

  useEffect(() => {
    const onExpired = () => {
      setToken(null)
      realtime.disconnect()
      queryClient.clear()
      setState({ status: 'anonymous', expired: true })
    }
    expiredListeners.add(onExpired)
    return () => {
      expiredListeners.delete(onExpired)
    }
  }, [queryClient])

  const signedIn = useCallback((result: AuthResult) => {
    setState({ status: 'authenticated', user: result.user })
    realtime.connect(result.token)
  }, [])

  const setUser = useCallback((user: User) => setState({ status: 'authenticated', user }), [])

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout()
    } finally {
      setToken(null)
      realtime.disconnect()
      queryClient.clear()
      setState({ status: 'anonymous', expired: false })
    }
  }, [queryClient])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ state, user: state.status === 'authenticated' ? state.user : null, signedIn, setUser, signOut, retry }),
    [state, signedIn, setUser, signOut, retry],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

/** The signed-in user; only call inside routes guarded by RequireAuth. */
export function useCurrentUser(): User {
  const { user } = useAuth()
  if (!user) throw new Error('No signed-in user')
  return user
}
