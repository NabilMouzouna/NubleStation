# AGENT.md — NubleStation for AI Agents

Instructions for AI coding agents on how to build, deploy, and integrate with NubleStation services using the SDK and CLI.

---

## What NubleStation is

NubleStation is a self-hosted backend platform running on a single Linux machine on a LAN. It exposes **one API origin** — `http://api.{org}.local` — that routes to four internal services:

| Path prefix   | Service                    | Status    |
|---------------|----------------------------|-----------|
| `/v1/vault/*` | Vault — file storage       | ✅ Live   |
| `/v1/orbit/*` | Orbit — frontend deploy    | ✅ Live   |
| `/v1/db/*`    | Blaze — database           | ✅ Live   |
| `/v1/auth/*`  | Identity — auth/SSO        | ✅ Live   |

Every request from app code must carry an API key (`Authorization: Bearer nbl_<id>.<secret>`). The Gateway validates the key, resolves it to an app context, and forwards to the right service. **One app cannot access another app's data** — isolation is enforced at the platform layer.

---

## Environment setup

You need two values before calling any NubleStation service:

```
NUBLESTATION_URL=http://api.{org}.local    # e.g. http://api.clinic.local
NUBLESTATION_API_KEY=nbl_<keyId>.<secret>  # from Console → App → Settings → API Keys
```

For **Vite/React apps**, prefix with `VITE_`:

```
VITE_NUBLESTATION_URL=http://api.clinic.local
VITE_NUBLESTATION_API_KEY=nbl_00366449d578bd6b.JfuicE...
```

For **Node.js apps**, read via `process.env`.

> **Always add a trailing newline to `.env` files.** Some dotenv parsers skip the last line without one.

---

## Installing the SDK

```bash
# File storage only
pnpm add @nublestation/vault

# Auth / SSO
pnpm add @nublestation/identity

# Database
pnpm add @nublestation/blaze

# Umbrella client (re-exports all three under one createClient() factory)
pnpm add @nublestation/client
```

---

## Identity — Auth & SSO

### Creating a client

```typescript
import { createIdentityClient, IdentityError } from "@nublestation/identity";

const auth = createIdentityClient({
  url:         process.env.NUBLESTATION_URL!,        // gateway: http://api.clinic.local
  identityUrl: "http://identity.clinic.local",       // Identity login pages
  app:         "myapp",                              // this app's slug (from Console)
});
```

Auth is **cookie-based SSO**. The session cookie is scoped to `Domain=.{org}.local` and sent automatically to every `*.{org}.local` subdomain. There are no tokens to manage in the browser.

---

### `auth.getSession()`

Returns the session state for the configured app:

```typescript
const session = await auth.getSession();

if (session.status === "authenticated") {
  console.log(session.user.displayName); // signed in + has access to this app
}
if (session.status === "forbidden") {
  console.log(session.user.email);       // signed in, but no role on this app
}
if (session.status === "unauthenticated") {
  auth.login();                          // redirect to SSO
}
```

`SessionState` shape:

| status | user present | meaning |
|---|---|---|
| `authenticated` | yes | signed in, has a role on this app |
| `forbidden` | yes | signed in, no role on this app (default-deny) |
| `unauthenticated` | no | no valid session cookie |

`IdentityUser` fields: `{ id, email, displayName, avatarUrl, role }`. `role` is `null` outside an app context.

---

### `auth.requireUser(opts?)`

Route guard. Resolves with the user when signed in and allowed. Otherwise redirects to SSO sign-in automatically.

```typescript
// React — call at the top of a protected component/page
const user = await auth.requireUser();
// If unauthenticated: browser navigates to identity.{org}.local/authorize
// If forbidden: throws IdentityError(403, "forbidden") unless you supply onForbidden

// Custom forbidden handler (no throw — useful for "access denied" screens)
const user = await auth.requireUser({
  onForbidden: (u) => {
    showAccessDeniedMessage(u.displayName);
  },
  redirectUri: window.location.href, // return here after login (default: current page)
});
```

---

### `auth.getUser()`

Who is signed in, ignoring per-app access. Use for "profile" UI on pages that don't gate on app access.

```typescript
const user = await auth.getUser();
// Returns IdentityUser | null
// user.role is always null here (no app context)
```

---

### `auth.hasAccess(role?)`

Quick boolean check for authorization logic.

```typescript
const allowed  = await auth.hasAccess();           // any role
const isAdmin  = await auth.hasAccess("admin");    // specific role
```

---

### `auth.login()` / `auth.logout()`

```typescript
// Navigate to SSO sign-in (redirects back to current page by default)
auth.login();
auth.login("http://tasks.clinic.local/dashboard"); // explicit return URL

// Use as an <a> href without triggering navigation
const url = auth.loginUrl(); // → string

// Server-side revoke + navigate
await auth.logout();
await auth.logout("http://tasks.clinic.local/bye"); // custom post-logout URL
```

---

### `auth.listAppUsers()`

Returns every user who has access to this app (minus the caller). Feeds share-with / assign-to pickers.

```typescript
const users = await auth.listAppUsers();
// AppUser[] — { id, email, displayName, avatarUrl, role }
```

Requires a valid session with access; throws `IdentityError(401)` otherwise.

---

### Error handling

```typescript
import { IdentityError } from "@nublestation/identity";

try {
  const user = await auth.requireUser();
} catch (err) {
  if (err instanceof IdentityError) {
    // err.status — HTTP status
    // err.code   — "forbidden", "unknown_app", "request_failed", …
  } else {
    throw err;
  }
}
```

---

### Complete Identity example

```typescript
import { createIdentityClient } from "@nublestation/identity";

const auth = createIdentityClient({
  url:         import.meta.env.VITE_NUBLESTATION_URL as string || "http://api.nuble.local",
  identityUrl: "http://identity.nuble.local",
  app:         "tasks",
});

// App root — check on load
async function bootstrap() {
  const session = await auth.getSession();
  if (session.status === "unauthenticated") {
    auth.login();
    return;
  }
  if (session.status === "forbidden") {
    renderAccessDenied(session.user);
    return;
  }
  renderApp(session.user);
}

// Logout button
document.getElementById("logout")?.addEventListener("click", () => auth.logout());
```

---

## Blaze — Database

### Defining a schema

Define the schema **once** in a shared file (e.g. `src/schema.ts`). This is the source of truth for types and migrations.

```typescript
import { defineSchema, t } from "@nublestation/blaze";

export const schema = defineSchema({
  tasks: t.model({
    title:     t.string().required(),
    status:    t.enum(["todo", "in_progress", "done"]).default("todo"),
    priority:  t.number().default(0),
    assignee:  t.ref("users"),          // FK → platform.users, access-checked
    notes:     t.json(),
    createdAt: t.timestamp().default("now"),
  }),

  appointments: t.model({
    patientId: t.ref("users").required(),
    doctorId:  t.ref("users").required(),
    startsAt:  t.timestamp().required(),
    endsAt:    t.timestamp().required(),
    notes:     t.string(),
  }).index("patientId").index("startsAt"),
});
```

**Field types:**

| Builder | Postgres type | TS type |
|---|---|---|
| `t.string()` | `text` | `string` |
| `t.number()` | `integer` | `number` |
| `t.decimal()` | `numeric` | `string` (avoid float loss) |
| `t.boolean()` | `boolean` | `boolean` |
| `t.uuid()` | `uuid` | `string` |
| `t.timestamp()` | `timestamptz` | `string` (ISO-8601) |
| `t.json()` | `jsonb` | `unknown` (or generic `t.json<MyType>()`) |
| `t.enum(["a","b"])` | `text CHECK (IN ...)` | `"a" \| "b"` |
| `t.ref("tableName")` | `uuid` FK | `string` |

**Modifiers:** `.required()` → NOT NULL · `.unique()` → UNIQUE · `.index()` → btree index · `.default(value)` → column default · `.default("now")` on timestamps → `now()` db function.

---

### Pushing the schema

Run once after defining or changing the schema. This creates/migrates the tables on the platform.

```bash
nuble db push
```

The CLI diffs the current schema against what's deployed and applies the delta as a migration. Generated migration files are written to `.nuble/migrations/`.

---

### Creating a client

```typescript
import { createBlazeClient } from "@nublestation/blaze";
import { schema } from "./schema.js";

const blaze = createBlazeClient({
  baseUrl: process.env.NUBLESTATION_URL!,
  apiKey:  process.env.NUBLESTATION_API_KEY!,
  schema,                                    // optional — enables type inference
});

// blaze.db.<tableName> is fully typed based on the schema
```

---

### CRUD operations

```typescript
// List — paginated
const tasks = await blaze.db.tasks.list();
const page2 = await blaze.db.tasks.list({ limit: 20, offset: 20 });
// Returns Row[] — empty array if none, never null

// Get by ID
const task = await blaze.db.tasks.get("uuid");
// Throws on 404

// Create
const created = await blaze.db.tasks.create({
  title:    "Check vitals",
  assignee: userId,     // only required fields needed; defaults applied server-side
});
// Returns the full Row including id and all defaults

// Update (partial — PATCH semantics)
const updated = await blaze.db.tasks.update("uuid", {
  status: "in_progress",
});
// Returns updated Row

// Delete
await blaze.db.tasks.delete("uuid");
// Resolves void; throws on 404
```

All rows are automatically scoped to the calling app's tenant — **you can never read or write another app's rows**.

---

### Type inference

```typescript
import type { InferSchema } from "@nublestation/blaze";
import { schema } from "./schema.js";

type DB = InferSchema<typeof schema>;
// DB.tasks.Row    → { id: string; title: string; status: "todo"|"in_progress"|"done"; ... }
// DB.tasks.Insert → { title: string; assignee?: string; status?: ...; ... }
// DB.tasks.Update → Partial<DB.tasks.Insert>
```

---

## Vault — File Storage

### Creating a client

Create the client **once at module level**, not inside a component or function.

```typescript
// Node.js / server-side
import { createVaultClient, VaultError } from "@nublestation/vault";

const vault = createVaultClient({
  url:    process.env.NUBLESTATION_URL!,
  apiKey: process.env.NUBLESTATION_API_KEY!,
});
```

```typescript
// Vite browser app — env vars baked in at build time
import { createVaultClient, VaultError } from "@nublestation/vault";

const vault = createVaultClient({
  url:    (import.meta.env.VITE_NUBLESTATION_URL as string) || "http://api.nuble.local",
  apiKey: import.meta.env.VITE_NUBLESTATION_API_KEY as string,
});
```

Via the umbrella client:

```typescript
import { createClient } from "@nublestation/client";

const { vault } = createClient({
  url:    process.env.NUBLESTATION_URL!,
  apiKey: process.env.NUBLESTATION_API_KEY!,
});
```

---

### Collections

Files are grouped into **collections** — a flat namespace prefix, not a real directory. A collection is created implicitly on first upload and disappears when its last file is deleted. There is no "create collection" call.

**Naming rules:** `[a-zA-Z0-9][a-zA-Z0-9._-]*` — no slashes, no `..`, no spaces.

```
collection       filename
──────────────   ──────────────────
records          john-doe-xray.jpg
reports          q1-2026.pdf
avatars          user-42.png
```

---

### `vault.upload(collection, filename, data)`

```typescript
// Browser File object
const result = await vault.upload("records", file.name, file);

// Uint8Array / ArrayBuffer (Node.js)
import { readFileSync } from "node:fs";
const bytes = readFileSync("./report.pdf");
const result = await vault.upload("reports", "q1.pdf", bytes);

// result shape
result.id        // UUID
result.sizeBytes // number | null
result.mimeType  // detected from magic bytes, not Content-Type header
result.isPublic  // false — always private by default
```

Throws `VaultError(409, "file_already_exists")` if the `(collection, filename)` pair already exists. Vault has no overwrite — delete first or use a versioned filename.

---

### `vault.list(collection?)`

```typescript
const all     = await vault.list();           // all files for this app
const records = await vault.list("records");  // scoped to one collection

// Enumerate collections (no dedicated endpoint)
const collections = [...new Set(all.map(f => f.collection))];
```

Returns `FileResult[]` — empty array if no files, never `null`.

---

### `vault.download(collection, filename)`

```typescript
const buffer = await vault.download("records", "john-doe-xray.jpg");
// Returns ArrayBuffer

// Browser download
const url = URL.createObjectURL(new Blob([buffer], { type: "image/jpeg" }));
const a   = document.createElement("a");
a.href = url; a.download = "xray.jpg"; a.click();
URL.revokeObjectURL(url); // always revoke to avoid memory leaks

// Node.js — write to disk
import { writeFileSync } from "node:fs";
writeFileSync("./xray.jpg", Buffer.from(buffer));
```

---

### `vault.setPublic(collection, filename, isPublic)`

```typescript
// Make a file publicly accessible (no API key required)
await vault.setPublic("avatars", "user-42.png", true);

// Public URL pattern:
// http://api.{org}.local/vault/{appSlug}/{collection}/{filename}
const url = `http://api.clinic.local/vault/myapp/avatars/user-42.png`;

// Revoke public access
await vault.setPublic("avatars", "user-42.png", false);
```

Public files are served with `cache-control: no-store` — visibility changes take effect immediately.

---

### `vault.delete(collection, filename)`

```typescript
await vault.delete("records", "old-scan.jpg");
// Resolves void. Disk bytes + DB row removed. Cannot be undone.
```

---

### Vault error handling

```typescript
import { VaultError } from "@nublestation/vault";

try {
  await vault.upload("docs", "report.pdf", bytes);
} catch (err) {
  if (err instanceof VaultError) {
    // err.status — HTTP status (409, 413, 415, 404, 401…)
    // err.code   — machine-readable string from server
    if (err.status === 409) { /* file already exists */ }
    if (err.status === 401) { /* invalid or missing API key */ }
  } else {
    throw err; // network failure or unexpected error — re-throw
  }
}
```

**All Vault error codes:**

| Code                    | Status | Cause                                              |
|-------------------------|--------|----------------------------------------------------|
| `unauthorized`          | 401    | Missing or invalid API key                         |
| `invalid_segment`       | 400    | Collection or filename contains illegal characters |
| `file_already_exists`   | 409    | `(collection, filename)` already exists            |
| `file_too_large`        | 413    | Exceeds app's `max_file_bytes` (default 50 MB)     |
| `extension_not_allowed` | 415    | Extension blocked by app's allowlist               |
| `invalid_body`          | 400    | `setPublic` body missing or `isPublic` not boolean |
| `not_found`             | 404    | File doesn't exist                                 |
| `request_failed`        | any    | Fallback when server returns no parseable error    |

---

## CLI — Development & Deployment

### Setup

```bash
npm install -g @nublestation/cli
```

### `nuble init` — link a project

Run once per project. Writes config to `~/.nuble/config`.

```bash
nuble init \
  --url  http://api.clinic.local \
  --key  nbl_00366449d578bd6b.JfuicE... \
  --slug myapp
```

| Flag        | Description                             |
|-------------|-----------------------------------------|
| `--url`     | Gateway base URL                        |
| `--key`     | App API key (`nbl_<id>.<secret>`)        |
| `--slug`    | App slug (must match the Console)       |
| `--profile` | Named profile (default: `default`)      |

### `nuble db push` — push schema

Diffs and applies your `defineSchema()` to the platform. Run after any schema change.

```bash
nuble db push
# Reads schema from nuble.config.ts (or nuble.config.js)
# Generates a migration file → .nuble/migrations/<timestamp>.sql
# Applies it to Blaze immediately
```

### `nuble deploy` — ship a frontend

```bash
nuble deploy           # zip + upload existing dist/
nuble deploy --build   # build (reads .env) + zip + upload
nuble deploy --dist ./out  # custom output directory
```

Use `--build` when the project has a `.env` file with `VITE_*` vars that must be baked into the bundle.

### `nuble status`

```bash
nuble status  # checks Gateway reachability for all configured profiles
```

---

## Best practices

1. **Never hardcode API keys.** Read from `process.env` (Node) or `import.meta.env.VITE_*` (Vite). Always add a URL fallback:
   ```typescript
   const url = (import.meta.env.VITE_NUBLESTATION_URL as string) || "http://api.nuble.local";
   ```

2. **Create service clients once at module level.** All clients are stateless — every call is an independent `fetch()`. No connection pools to worry about.

3. **For Identity: call `auth.requireUser()` at the top of every protected page/component.** It handles all three states (unauthenticated → redirect, forbidden → throw/callback, authenticated → continue).

4. **For Blaze: define the schema in a single shared file.** `src/schema.ts` imported by both the client and the CLI ensures the types and the migration are always in sync.

5. **Run `nuble db push` after every schema change.** The platform rejects writes to columns that don't exist yet.

6. **For Vault: use meaningful collection names.** Prefer `kebab-case`. Avoid generic names like `files` — prefer `patient-records`, `invoices`, `avatars`.

7. **Filenames are immutable.** There is no rename or overwrite. Embed version in the filename: `report-v2.pdf`, `2026-06-01-scan.jpg`.

8. **Handle `VaultError(409)` explicitly.** Any upload that may run more than once must handle the conflict case — fail gracefully or delete-and-re-upload.

9. **Always `revokeObjectURL` after browser downloads.** Creating object URLs without revoking leaks memory.

10. **Deploy with `--build` to guarantee env vars are baked in.** A pre-built `dist/` without the correct `VITE_NUBLESTATION_URL` will silently use an empty base URL.

11. **The API origin is always `api.{org}.local`.** Never construct URLs to individual service ports. All traffic goes through the Gateway.

12. **Check `is_public` before building public Vault URLs.** The server checks it on every request — a private file returns `403` regardless of the URL.

---

## Architecture notes

- **Single host, no clustering.** NubleStation runs on one machine.
- **Apps are database rows, not containers.** Creating an app inserts a row and issues an API key — no process is spawned.
- **Frontends are static files.** Caddy serves `dist/` from the host filesystem. No SSR, no runtime for deployed apps.
- **No internet dependency at runtime.** All services run locally — LAN works with the cable unplugged.
- **CORS is allowed for `*.local` and `localhost`.** The Gateway accepts cross-origin requests from any `*.{org}.local` subdomain and `localhost` on any port.
- **Blaze rows are always tenant-scoped.** RLS is enforced at the Postgres layer — you cannot read another app's data even with a direct SQL connection.
- **Collections are implicit.** No "create collection" endpoint. Uploading creates it; deleting the last file removes it.
- **No rename, no overwrite in Vault.** Delete and re-upload is the only way to replace a file.

---

## Quick reference

```typescript
// Identity
import { createIdentityClient } from "@nublestation/identity";
const auth = createIdentityClient({ url, identityUrl, app });

await auth.getSession();                       // → SessionState
await auth.requireUser(opts?);                 // → IdentityUser (or redirect)
await auth.getUser();                          // → IdentityUser | null
await auth.hasAccess(role?);                   // → boolean
await auth.listAppUsers();                     // → AppUser[]
auth.login(redirectUri?);                      // navigate to SSO
await auth.logout(redirectTo?);                // revoke session + navigate
auth.loginUrl(redirectUri?);                   // → string (for <a href>)
```

```typescript
// Blaze
import { defineSchema, t, createBlazeClient } from "@nublestation/blaze";
const schema = defineSchema({ tasks: t.model({ title: t.string().required() }) });
const blaze  = createBlazeClient({ baseUrl, apiKey, schema });

await blaze.db.tasks.list({ limit?, offset? }); // → Row[]
await blaze.db.tasks.get(id);                   // → Row
await blaze.db.tasks.create(data);              // → Row
await blaze.db.tasks.update(id, partial);       // → Row
await blaze.db.tasks.delete(id);                // → void
```

```typescript
// Vault
import { createVaultClient, VaultError } from "@nublestation/vault";
const vault = createVaultClient({ url, apiKey });

await vault.upload(collection, filename, data);        // → FileResult
await vault.list(collection?);                         // → FileResult[]
await vault.download(collection, filename);            // → ArrayBuffer
await vault.setPublic(collection, filename, boolean);  // → FileResult
await vault.delete(collection, filename);              // → void
```

```bash
# CLI
nuble init   --url http://api.{org}.local --key nbl_... --slug myapp
nuble db push                    # push schema changes
nuble deploy                     # zip + upload existing dist/
nuble deploy --build             # build (reads .env) + zip + upload
nuble status                     # check gateway health
```
