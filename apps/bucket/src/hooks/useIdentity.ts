
import { useCallback, useEffect, useState } from 'react'
import { createIdentityClient } from '@nublestation/identity'
import type { IdentityUser } from '@nublestation/identity'

const NUBLE_URL    = (import.meta.env.VITE_NUBLESTATION_URL as string)          
const IDENTITY_URL = (import.meta.env.VITE_NUBLESTATION_IDENTITY_URL as string) 
const APP_SLUG     = (import.meta.env.VITE_NUBLESTATION_APP as string)          

// Module-level singleton — the client is pure (no side effects on create).
export const identity = createIdentityClient({
  url:         NUBLE_URL,
  identityUrl: IDENTITY_URL,
  app:         APP_SLUG,
})

export type AuthStatus = 'loading' | 'authenticated' | 'forbidden' | 'unauthenticated'

export interface UseIdentity {
  status: AuthStatus
  user: IdentityUser | null
  login: () => void
  logout: () => void
}

export function useIdentity(): UseIdentity {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<IdentityUser | null>(null)

  useEffect(() => {
    let cancelled = false
    identity
      .getSession()
      .then((s) => {
        if (cancelled) return
        if (s.status === 'unauthenticated') {
          setStatus('unauthenticated')
          setUser(null)
        } else {
          setStatus(s.status) // 'authenticated' | 'forbidden'
          setUser(s.user)
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('unauthenticated')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(() => identity.login(), [])
  const logout = useCallback(() => void identity.logout(), [])

  return { status, user, login, logout }
}
