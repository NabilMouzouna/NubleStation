# @nublestation/identity

Auth SDK for [NubleStation](https://nabilmouzouna.github.io/NubleStation/) — user sessions, single sign-on, and per-app authorization for browser apps.

```bash
npm install @nublestation/identity
```

## How auth works

NubleStation runs one Identity service for the whole organization. Every app shares the same sign-in session through a cookie scoped to `*.{org}.local`, so a user signs in once and is recognized across every app on the network — that's the SSO.

Because it rides the shared session cookie, this SDK takes **no API key** (unlike `@nublestation/vault`). It needs to know only where the Gateway and Identity pages live, plus your app's slug.

## Quick start

```typescript
import { createIdentityClient } from "@nublestation/identity";

const identity = createIdentityClient({
  url:         "http://api.clinic.local",       // Gateway
  identityUrl: "http://identity.clinic.local",  // Identity sign-in pages
  app:         "bucket",                         // your app's slug (from Console)
});

const session = await identity.getSession();
if (session.status === "unauthenticated") {
  identity.login();           // redirect to SSO sign-in
} else if (session.status === "forbidden") {
  // signed in, but no access to this app
} else {
  console.log("Hello", session.user.email);
}
```

## Authorization model

Access is **per-app and default-deny**: a valid session does not imply access to your app. An admin grants a user a role on the app in the Console (or the user is an org admin, who can access everything). `getSession()` distinguishes the two cases so you can show the right screen.

## API

`createIdentityClient(config)` returns:

| Method | Returns | Description |
|---|---|---|
| `getUser()` | `Promise<IdentityUser \| null>` | The signed-in user, regardless of app access. |
| `getSession()` | `Promise<SessionState>` | Full session + app-access state (see below). |
| `isAuthenticated()` | `Promise<boolean>` | True if a valid session exists (ignores app access). |
| `hasAccess(role?)` | `Promise<boolean>` | True if signed in **and** allowed on this app (optionally requiring a role). |
| `requireUser(opts?)` | `Promise<IdentityUser>` | Route guard — resolves with the user when signed in and allowed; redirects otherwise. |
| `listAppUsers()` | `Promise<AppUser[]>` | Users you can share with in this app. |
| `loginUrl(redirectUri?)` | `string` | The SSO sign-in URL for this app. |
| `login(redirectUri?)` | `void` | Navigate to the SSO sign-in. |
| `logout(redirectTo?)` | `Promise<void>` | Revoke the session server-side, then navigate. |

### Config

```typescript
interface IdentityConfig {
  url: string;         // Gateway base URL, e.g. http://api.clinic.local
  identityUrl: string; // Identity pages base URL, e.g. http://identity.clinic.local
  app: string;         // this app's slug (from the Console), e.g. "bucket"
}
```

### Types

```typescript
interface IdentityUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string | null;
}

type SessionState =
  | { status: "authenticated"; user: IdentityUser }   // signed in + has access
  | { status: "forbidden";     user: IdentityUser }   // signed in, no app access
  | { status: "unauthenticated" };                    // not signed in

interface AppUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
}
```

## React integration

A minimal hook over `getSession()`:

```typescript
import { useEffect, useState } from "react";
import { createIdentityClient } from "@nublestation/identity";
import type { IdentityUser } from "@nublestation/identity";

export const identity = createIdentityClient({
  url:         import.meta.env.VITE_NUBLESTATION_URL,
  identityUrl: import.meta.env.VITE_NUBLESTATION_IDENTITY_URL,
  app:         import.meta.env.VITE_NUBLESTATION_APP,
});

type Status = "loading" | "authenticated" | "forbidden" | "unauthenticated";

export function useIdentity() {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<IdentityUser | null>(null);

  useEffect(() => {
    identity.getSession().then((s) => {
      if (s.status === "unauthenticated") setStatus("unauthenticated");
      else { setStatus(s.status); setUser(s.user); }
    });
  }, []);

  return {
    status,
    user,
    login:  () => identity.login(),
    logout: () => void identity.logout(),
  };
}
```

Render a sign-in prompt when `unauthenticated`, a "no access" screen when `forbidden`, and your app when `authenticated`.

## Error handling

```typescript
import { IdentityError } from "@nublestation/identity";

try {
  await identity.listAppUsers();
} catch (err) {
  if (err instanceof IdentityError) console.error(err.status, err.code);
}
```

## License

MIT
