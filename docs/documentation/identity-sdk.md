# Identity SDK — `@nublestation/identity`

Client library for the Identity auth service. Targets **browser apps** — it relies on the shared-cookie SSO session, so there is no Node.js/server use case. Framework-agnostic core; see [React integration](#react-integration-useidentity--authgate) for a ready-made hook and gate.

Related: [`docs/documentation/identity-service.md`](./identity-service.md) (server-side internals), [ADR 014](../adr/014-identity-service.md).

---

## How auth works (read this first)

NubleStation uses **shared-cookie SSO**, not browser tokens. After a user signs in at `identity.{org}.local`, the Identity service sets an `HttpOnly` session cookie scoped to the parent domain (`Domain=.{org}.local`). Because the cookie is on the parent domain, it is sent automatically on requests to **any** subdomain — including `api.{org}.local`. The SDK simply makes its requests with `credentials: "include"`; there is nothing to store, attach, or refresh in JavaScript.

Consequences:

- **Live auth only works on the deployed origin** (`{yourapp}.{org}.local`), where the browser holds the `.{org}.local` cookie. It does **not** work from vite's `localhost` dev server — localhost is a different site and never receives the cookie. Develop UI locally with mocked state; test the real flow on the deployed app.
- The cookie is `HttpOnly`, so the SDK can never read it. "Am I signed in?" is answered by calling the server (`getUser`/`getSession`), not by inspecting `document.cookie`.

---

## Installation

```bash
pnpm add @nublestation/identity --filter <your-app>
```

In this monorepo the package is consumed as a workspace dependency (`"@nublestation/identity": "workspace:*"`) and aliased to its built output in `vite.config.ts`.

---

## Setup

```typescript
import { createIdentityClient } from '@nublestation/identity'

const auth = createIdentityClient({
  url:         'http://api.clinic.local',       // Gateway base URL
  identityUrl: 'http://identity.clinic.local',  // Identity pages base URL
  app:         'bucket',                         // this app's slug (from the Console)
})
```

`createIdentityClient` is a pure factory — no side effects, no network call at construction time. Create it once at module level and reuse it.

### Config

```typescript
interface IdentityConfig {
  url:         string   // Gateway base URL — reaches /v1/auth/* (no trailing slash)
  identityUrl: string   // Identity pages base URL — reaches /authorize, /login
  app:         string   // this app's slug, used for the per-app authorization check
}
```

Two base URLs because the two concerns live on different hosts: programmatic calls (`/v1/auth/me`, `/v1/auth/logout`) go through the **Gateway** (`url`), while sign-in is a full-page navigation to the **Identity pages** (`identityUrl`).

---

## Authorization model

Authorization is **per-app and default-deny**. A user can have a valid session (signed in) yet have no access to *your* app until a Console admin grants them a role. The SDK surfaces this as a distinct `forbidden` state — separate from `unauthenticated` — so you can show "ask an admin" instead of bouncing them back to a login they've already completed.

Console admins (`super_admin`/`admin`) are implicitly `admin` on every app, so they never hit `forbidden`.

---

## Methods

### `auth.getUser()`

The currently signed-in user, **regardless of app access**. Use for "who is logged in" UI on pages that don't gate on per-app access.

```typescript
const user: IdentityUser | null = await auth.getUser()
if (user) console.log(`Hello, ${user.displayName ?? user.email}`)
```

**HTTP:** `GET /v1/auth/me` (no `app` param) with `credentials: "include"`.

**Response:** `IdentityUser` when signed in (`role` is `null` here — no app context), or `null` when there is no session (401).

**Throws:** `IdentityError` on an unexpected status (5xx, etc.).

---

### `auth.getSession()`

Full session state **for the configured app**. This is the primary call for gating an app.

```typescript
const session = await auth.getSession()
switch (session.status) {
  case 'authenticated': /* session.user.role is set — render the app */ break
  case 'forbidden':     /* signed in, no access — show "ask an admin" */ break
  case 'unauthenticated': auth.login(); break
}
```

**HTTP:** `GET /v1/auth/me?app={app}`. One request in the happy path; a second `GET /v1/auth/me` is made **only** in the `forbidden` case to resolve the user object (the 403 body carries no user).

**Response:** a discriminated `SessionState`:

| `status` | Meaning | `user` |
|---|---|---|
| `authenticated` | Signed in **and** has a role on this app | present, `role` set |
| `forbidden` | Signed in, but no role granted on this app (default-deny) | present, `role` is `null` |
| `unauthenticated` | No valid session | absent |

---

### `auth.isAuthenticated()`

Convenience boolean — `true` if any valid session exists (ignores per-app access). Built on `getUser()`.

```typescript
if (await auth.isAuthenticated()) { /* … */ }
```

---

### `auth.hasAccess(role?)`

`true` if the user is signed in **and** has access to this app. Pass a `role` to additionally require that exact role.

```typescript
await auth.hasAccess()          // any role on this app
await auth.hasAccess('admin')   // specifically the admin role
```

Built on `getSession()`.

---

### `auth.requireUser(options?)`

Imperative **route guard**. Resolves with the user when signed in *and* allowed on this app. Otherwise it redirects the browser to the SSO sign-in (returning to the current page afterward). On `forbidden`, it calls `options.onForbidden` if provided, else throws `IdentityError(403, "forbidden")`.

```typescript
// At a protected entry point:
const user = await auth.requireUser()
// ...code here only runs for an authorized user.

// With custom forbidden handling:
await auth.requireUser({ onForbidden: (u) => showNoAccessScreen(u) })
```

```typescript
interface RequireUserOptions {
  redirectUri?: string                       // where to return after sign-in (default: current URL)
  onForbidden?: (user: IdentityUser) => void // called instead of throwing on no-access
}
```

> When `requireUser` triggers a navigation (unauthenticated) or calls `onForbidden`, the returned promise intentionally **never resolves**, so guarded code after the `await` does not run while the page is unloading. In React, prefer the [`useIdentity` hook](#react-integration-useidentity--authgate) over `requireUser`.

---

### `auth.loginUrl(redirectUri?)`

Returns the SSO sign-in URL for this app — useful as an `href`. Defaults `redirect_uri` to the current page.

```typescript
const href = auth.loginUrl()
// → http://identity.clinic.local/authorize?app=bucket&redirect_uri=<current-url>
```

---

### `auth.login(redirectUri?)`

Navigates the browser to `loginUrl(redirectUri)` — the "Sign in" button action.

```typescript
<button onClick={() => auth.login()}>Sign in</button>
```

---

### `auth.logout(redirectTo?)`

Revokes the current session **server-side** (deletes the session row and clears the cookie), then navigates to `redirectTo` (defaults to the Identity sign-in page).

```typescript
await auth.logout()                                  // → identity.clinic.local/login
await auth.logout('http://console.clinic.local')     // → custom destination
```

**HTTP:** `POST /v1/auth/logout` with `credentials: "include"`. Navigation happens even if the request fails, so a network hiccup never traps the user in a signed-in UI.

---

## Error handling

`getUser`/`getSession` (and methods built on them) return `null`/state for the expected auth outcomes (200/401/403) and **throw `IdentityError` only on unexpected statuses** (e.g. `404 unknown_app` — a misconfigured `app` slug — or 5xx). Network failures bubble as standard `Error`.

```typescript
import { IdentityError } from '@nublestation/identity'

try {
  const session = await auth.getSession()
  // handle session.status
} catch (err) {
  if (err instanceof IdentityError) {
    console.error(err.status, err.code)  // e.g. 404 "unknown_app"
  } else {
    throw err  // network down, runtime bug, etc.
  }
}
```

### `IdentityError` shape

```typescript
class IdentityError extends Error {
  readonly status: number   // HTTP status
  readonly code:   string   // server error string from { error: "..." }
  readonly name:   string   // always "IdentityError"
}
```

### Status reference

| Status | Code | Meaning | Surfaced as |
|---|---|---|---|
| 200 | — | Valid session (and access, when `?app` is used) | user / `authenticated` |
| 401 | `unauthenticated` | No valid session | `null` / `unauthenticated` |
| 403 | `forbidden` | Signed in, no role on this app | `forbidden` state |
| 404 | `unknown_app` | The configured `app` slug doesn't exist | **throws** `IdentityError` |
| 5xx | `request_failed` | Server error | **throws** `IdentityError` |

---

## TypeScript types

```typescript
interface IdentityConfig {
  url:         string
  identityUrl: string
  app:         string
}

interface IdentityUser {
  id:          string
  email:       string
  displayName: string | null
  avatarUrl:   string | null
  role:        string | null   // role on THIS app; null outside an app context
}

type SessionState =
  | { status: 'authenticated';   user: IdentityUser }
  | { status: 'forbidden';       user: IdentityUser }
  | { status: 'unauthenticated' }

interface RequireUserOptions {
  redirectUri?: string
  onForbidden?: (user: IdentityUser) => void
}
```

Type-only imports (no runtime cost):

```typescript
import type { IdentityConfig, IdentityUser, SessionState } from '@nublestation/identity'
```

---

## React integration — `useIdentity` + `AuthGate`

The hook and gate below are the canonical React wrappers. Copy them into your app — they are not published as part of the package because they import React, which would make the SDK browser-framework-bound. (Reference implementation: `apps/bucket/src/hooks/useIdentity.ts` and `apps/bucket/src/components/AuthGate.tsx`.)

### The hook

```typescript
// hooks/useIdentity.ts
import { useCallback, useEffect, useState } from 'react'
import { createIdentityClient } from '@nublestation/identity'
import type { IdentityUser } from '@nublestation/identity'

export const identity = createIdentityClient({
  url:         (import.meta.env.VITE_NUBLESTATION_URL as string)          || 'http://api.nuble.local',
  identityUrl: (import.meta.env.VITE_NUBLESTATION_IDENTITY_URL as string) || 'http://identity.nuble.local',
  app:         (import.meta.env.VITE_NUBLESTATION_APP as string)          || 'bucket',
})

export type AuthStatus = 'loading' | 'authenticated' | 'forbidden' | 'unauthenticated'

export function useIdentity() {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser]     = useState<IdentityUser | null>(null)

  useEffect(() => {
    let cancelled = false
    identity.getSession()
      .then((s) => {
        if (cancelled) return
        if (s.status === 'unauthenticated') { setStatus('unauthenticated'); setUser(null) }
        else { setStatus(s.status); setUser(s.user) }
      })
      .catch(() => { if (!cancelled) setStatus('unauthenticated') })
    return () => { cancelled = true }
  }, [])

  const login  = useCallback(() => identity.login(), [])
  const logout = useCallback(() => void identity.logout(), [])
  return { status, user, login, logout }
}
```

### The gate

`AuthGate` renders sign-in / no-access screens for the non-authenticated states and, when authenticated, hands the live session to its children via a render-prop — so the app can show a user chip without a second session lookup.

```tsx
// main.tsx
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      {(session) => <App session={session} />}
    </AuthGate>
  </StrictMode>,
)
```

```tsx
// App.tsx — show the signed-in user in the header
import { UserChip } from './components/AuthGate'
import type { AuthSession } from './components/AuthGate'

export default function App({ session }: { session: AuthSession }) {
  return (
    <header>
      {/* … */}
      <UserChip user={session.user} onLogout={session.logout} />
    </header>
  )
}
```

`AuthGate`'s authenticated children receive:

```typescript
interface AuthSession {
  user:   IdentityUser
  logout: () => void
}
```

### Environment variables

| Variable | Description | Default |
|---|---|---|
| `VITE_NUBLESTATION_URL` | Gateway base URL | `http://api.nuble.local` |
| `VITE_NUBLESTATION_IDENTITY_URL` | Identity pages base URL | `http://identity.nuble.local` |
| `VITE_NUBLESTATION_APP` | This app's slug | `bucket` |

Vite bakes these into the bundle at build time (see `apps/bucket/vite.config.ts`'s `define` block).

---

## References

- SDK source — `packages/identity/src/`
- Reference integration — `apps/bucket/src/{hooks/useIdentity.ts,components/AuthGate.tsx}`
- Identity service internals — `docs/documentation/identity-service.md`
- ADR 014 — `docs/adr/014-identity-service.md`
- ADR 008 — `docs/adr/008-cli-sdk-architecture.md`
