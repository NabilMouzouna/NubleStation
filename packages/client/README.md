# @nublestation/client

The unified client for [NubleStation](https://nabilmouzouna.github.io/NubleStation/) — one import, one config, all services.

```bash
npm install @nublestation/client
```

NubleStation is a self-hosted, plug-and-play backend for small organizations: auth, file storage, database, and frontend hosting on one machine, reachable over the LAN at `*.{org}.local`. This package gives your app a single typed client for those services.

## Quick start

```typescript
import { createClient } from "@nublestation/client";

const nuble = createClient({
  url:    "http://api.clinic.local",   // your NubleStation gateway
  apiKey: "nbl_<key_id>.<secret>",     // API key from the Console
});

// File storage (Vault)
await nuble.vault.upload("reports", "q1.pdf", file);
const files = await nuble.vault.list("reports");
const bytes = await nuble.vault.download("reports", "q1.pdf");
```

Get an API key from the Console: **Apps → your app → Settings → Generate API key**. It's scoped to one app — all requests with it are isolated to that app's data.

## What's included

`createClient(config)` returns a client whose services you call as `nuble.<service>.*`:

| Service | Accessor | Status | Package it wraps |
|---|---|---|---|
| **Vault** — file storage | `nuble.vault` | ✅ Live | [`@nublestation/vault`](https://www.npmjs.com/package/@nublestation/vault) |
| **Blaze** — database | `nuble.blaze` | 🚧 Coming soon | — |

See the [`@nublestation/vault` README](https://www.npmjs.com/package/@nublestation/vault) for the full file-storage API (`upload`, `download`, `list`, `share`, `setPublic`, …).

### Auth is a separate package

Authentication rides the organization's shared SSO **session cookie**, not an API key, so it lives in its own package and is configured differently. Install [`@nublestation/identity`](https://www.npmjs.com/package/@nublestation/identity) for user sessions, SSO sign-in, and per-app authorization:

```typescript
import { createIdentityClient } from "@nublestation/identity";

const identity = createIdentityClient({
  url:         "http://api.clinic.local",
  identityUrl: "http://identity.clinic.local",
  app:         "bucket",
});

const session = await identity.getSession();
```

## Config

```typescript
interface ClientConfig {
  url: string;     // Gateway base URL, e.g. http://api.clinic.local
  apiKey: string;  // API key issued from the Console (nbl_...)
}
```

In a browser bundler, read these from env so secrets aren't hard-coded:

```typescript
const nuble = createClient({
  url:    import.meta.env.VITE_NUBLESTATION_URL,
  apiKey: import.meta.env.VITE_NUBLESTATION_API_KEY,
});
```

## Error handling

Service calls throw a typed error on non-2xx responses. The Vault error class is re-exported here for convenience:

```typescript
import { VaultError } from "@nublestation/client";

try {
  await nuble.vault.upload("docs", "report.pdf", bytes);
} catch (err) {
  if (err instanceof VaultError) console.error(err.status, err.code);
}
```

| Code | Status | Meaning |
|---|---|---|
| `unauthorized` | 401 | API key missing, invalid, or revoked |
| `forbidden` | 403 | No access to the resource |
| `not_found` | 404 | Resource does not exist |
| `internal_error` | 500 | Unexpected server error |

## Exports

```typescript
import {
  createClient,        // factory
  VaultError,          // error class (re-exported from @nublestation/vault)
} from "@nublestation/client";

import type {
  ClientConfig,        // { url, apiKey }
  NubleClient,         // ReturnType<typeof createClient>
  FileResult,          // a Vault file
} from "@nublestation/client";
```

## How it works

The client sends plain HTTP to `api.{org}.local` with an `Authorization: Bearer nbl_...` header. The Gateway validates the key, resolves your app's identity, and HMAC-signs the forwarded request before it reaches the internal service. Your app never touches HMAC or internal secrets.

```
Your app ──Bearer nbl_…──▶ Gateway (api.{org}.local)
                              │ verify key → resolve app
                              │ sign with internal secret
                              ▼
                         Vault / Blaze / Identity
```

## Prefer one package?

If your app only needs one service, install it directly and skip the umbrella package:

```bash
npm install @nublestation/vault      # file storage only
npm install @nublestation/identity   # auth only
```

Full guides: **https://nabilmouzouna.github.io/NubleStation/**

## License

MIT
