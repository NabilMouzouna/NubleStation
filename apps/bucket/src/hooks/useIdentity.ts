/* ---------------------------------------------------------------------------
 * useIdentity — React hook powered by @nublestation/identity
 * ---------------------------------------------------------------------------
 *  Package:  @nublestation/identity   (SSO auth client, cookie-based)
 *
 *  On mount it resolves the current session for this app and exposes:
 *    status  'loading' | 'authenticated' | 'forbidden' | 'unauthenticated'
 *    user    the signed-in user (null until known)
 *    login() redirect to the SSO sign-in for this app
 *    logout() revoke the session and return to the Identity sign-in page
 *
 *  Auth is a session cookie scoped to .{org}.local, so it only flows on the
 *  deployed origin (bucket.{org}.local) — not vite's localhost dev server.
 * ------------------------------------------------------------------------- */
import { useCallback, useEffect, useState } from 'react'
import { createIdentityClient } from '@nublestation/identity'
import type { IdentityUser } from '@nublestation/identity'

const NUBLE_URL    = (import.meta.env.VITE_NUBLESTATION_URL as string)          || 'http://api.nuble.local'
const IDENTITY_URL = (import.meta.env.VITE_NUBLESTATION_IDENTITY_URL as string) || 'http://identity.nuble.local'
const APP_SLUG     = (import.meta.env.VITE_NUBLESTATION_APP as string)          || 'bucket'

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
