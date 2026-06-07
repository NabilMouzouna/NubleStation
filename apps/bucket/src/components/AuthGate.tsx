/* ---------------------------------------------------------------------------
 * AuthGate — wraps the app and only renders children when the user is signed
 * in and has access to Bucket. Otherwise it shows a branded sign-in screen
 * (unauthenticated) or a no-access screen (forbidden).
 *
 * Children is a render-prop receiving the live session ({ user, logout }) so
 * the app can show the user chip without a second session lookup.
 * ------------------------------------------------------------------------- */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { useIdentity } from '../hooks/useIdentity'
import type { IdentityUser } from '@nublestation/identity'

export interface AuthSession {
  user: IdentityUser
  logout: () => void
}

function initials(user: IdentityUser): string {
  const base = user.displayName ?? user.email
  const parts = base.trim().split(/\s+/).filter(Boolean)
  const letters = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
  return (letters || base[0] || '?').toUpperCase()
}

/** Avatar + name chip with a Sign-out button — for the app header. */
export function UserChip({ user, onLogout }: { user: IdentityUser; onLogout: () => void }) {
  const [imgFailed, setImgFailed] = useState(false)
  return (
    <div className="user-chip">
      {user.avatarUrl && !imgFailed ? (
        <img className="user-chip-avatar" src={user.avatarUrl} alt=""
             onError={() => setImgFailed(true)} />
      ) : (
        <span className="user-chip-avatar user-chip-initials">{initials(user)}</span>
      )}
      <span className="user-chip-name">{user.displayName ?? user.email}</span>
      <button className="user-chip-logout" onClick={onLogout} title="Sign out">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M10.5 11L14 8l-3.5-3M14 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  )
}

function GateShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-gate">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/vault.svg" width={34} height={34} alt="" />
          <span className="auth-brand-name">Bucket</span>
        </div>
        {children}
        <div className="auth-powered">powered by NubleStation Identity</div>
      </div>
    </div>
  )
}

export default function AuthGate({ children }: { children: (session: AuthSession) => ReactNode }) {
  const { status, user, login, logout } = useIdentity()

  if (status === 'loading') {
    return (
      <GateShell>
        <p className="auth-msg">Checking your session…</p>
      </GateShell>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <GateShell>
        <h1 className="auth-title">Sign in to Bucket</h1>
        <p className="auth-msg">Use your NubleStation account to access your files.</p>
        <button className="auth-btn" onClick={login}>Sign in</button>
      </GateShell>
    )
  }

  if (status === 'forbidden') {
    return (
      <GateShell>
        <h1 className="auth-title">No access to Bucket</h1>
        <p className="auth-msg">
          {user?.email ? <>You’re signed in as <strong>{user.email}</strong>, but your </> : 'Your '}
          account hasn’t been granted access to Bucket yet. Ask an admin to grant you a role.
        </p>
        <button className="auth-btn auth-btn-ghost" onClick={logout}>Sign out</button>
      </GateShell>
    )
  }

  // authenticated — hand control (and the session) to the app.
  return <>{children({ user: user!, logout })}</>
}
