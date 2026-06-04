# AGENT.md — NubleStation for AI Agents

Instructions for AI coding agents on how to build, deploy, and integrate with NubleStation services using the SDK and CLI.

---

## What NubleStation is

NubleStation is a self-hosted backend platform running on a single Linux machine on a LAN. It exposes **one API origin** — `http://api.{org}.local` — that routes to four internal services:

| Path prefix   | Service                    | Status    |
|---------------|----------------------------|-----------|
| `/v1/vault/*` | Vault — file storage       | ✅ Live   |
| `/v1/orbit/*` | Orbit — frontend deploy    | ✅ Live   |
| `/v1/db/*`    | Blaze — database           | 🔜 Soon   |
| `/v1/auth/*`  | Identity — auth/SSO        | 🔜 Soon   |

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
# If your app only needs file storage
pnpm add @nublestation/vault

# If your app will use multiple services (umbrella client)
pnpm add @nublestation/client
```

`@nublestation/client` re-exports everything from individual service packages under a unified `createClient()` factory. Both approaches reach the same API.

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

### Error handling

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

**All error codes:**

| Code                   | Status | Cause                                              |
|------------------------|--------|----------------------------------------------------|
| `unauthorized`         | 401    | Missing or invalid API key                         |
| `invalid_segment`      | 400    | Collection or filename contains illegal characters |
| `file_already_exists`  | 409    | `(collection, filename)` already exists            |
| `file_too_large`       | 413    | Exceeds app's `max_file_bytes` (default 50 MB)     |
| `extension_not_allowed`| 415    | Extension blocked by app's allowlist               |
| `invalid_body`         | 400    | `setPublic` body missing or `isPublic` not boolean |
| `not_found`            | 404    | File doesn't exist                                 |
| `request_failed`       | any    | Fallback when server returns no parseable error    |

---

### Complete Vault example

```typescript
import { createVaultClient, VaultError } from "@nublestation/vault";

const vault = createVaultClient({
  url:    process.env.NUBLESTATION_URL!,
  apiKey: process.env.NUBLESTATION_API_KEY!,
});

// Upload with conflict resolution
async function uploadOrReplace(
  collection: string,
  filename: string,
  data: Uint8Array,
) {
  try {
    return await vault.upload(collection, filename, data);
  } catch (err) {
    if (err instanceof VaultError && err.status === 409) {
      await vault.delete(collection, filename);
      return vault.upload(collection, filename, data);
    }
    throw err;
  }
}

// Upload and get a shareable public URL
async function uploadPublic(
  collection: string,
  filename: string,
  data: Uint8Array,
  appSlug: string,
  orgDomain: string,
): Promise<string> {
  await vault.upload(collection, filename, data);
  await vault.setPublic(collection, filename, true);
  return `http://api.${orgDomain}.local/vault/${appSlug}/${collection}/${filename}`;
}
```

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

### `nuble deploy` — ship a frontend

```bash
nuble deploy           # zip + upload existing dist/
nuble deploy --build   # build (reads .env) + zip + upload
nuble deploy --dist ./out  # custom output directory
```

Use `--build` when the project has a `.env` file with `VITE_*` vars that must be baked into the bundle. The flag:

1. Detects your package manager (`pnpm` → `yarn` → `npm`, by lockfile)
2. Reads `.env` from the current directory and merges into the build environment
3. Runs the `build` script
4. Zips `dist/` and uploads

### `nuble status`

```bash
nuble status  # checks Gateway reachability for all configured profiles
```

---

## Best practices

1. **Never hardcode API keys.** Read from `process.env` or `import.meta.env.VITE_*`. Always add a sensible URL fallback:
   ```typescript
   const url = (import.meta.env.VITE_NUBLESTATION_URL as string) || "http://api.nuble.local";
   ```

2. **Create the vault client once at module level.** The object is stateless — every call is an independent `fetch()`.

3. **Use meaningful collection names.** Prefer `kebab-case`. Avoid generic names like `files`. Prefer `patient-records`, `invoices`, `avatars`.

4. **Filenames are immutable.** There is no rename or overwrite. Embed version in the filename: `report-v2.pdf`, `2026-06-01-scan.jpg`.

5. **Handle `VaultError(409)` explicitly.** Any upload that may run more than once must handle the conflict case — fail gracefully or delete-and-re-upload.

6. **Always `revokeObjectURL` after browser downloads.** Creating object URLs without revoking leaks memory.

7. **Trailing newline in `.env`.** Some dotenv parsers skip the last line without one. Always end `.env` files with a newline.

8. **Deploy with `--build` to guarantee env vars are baked in.** A pre-built `dist/` without the correct `VITE_NUBLESTATION_URL` will silently use an empty base URL and fail with 405 errors from Caddy's file server.

9. **The API origin is always `api.{org}.local`.** Never construct URLs to individual service ports. All traffic goes through the Gateway.

10. **Check `is_public` before building public URLs.** The server checks it on every request. If private, the URL returns `403` immediately.

---

## Architecture notes

- **Single host, no clustering.** NubleStation runs on one machine.
- **Apps are database rows, not containers.** Creating an app inserts a row and issues an API key — no process is spawned.
- **Frontends are static files.** Caddy serves `dist/` from the host filesystem. No SSR, no runtime for deployed apps.
- **No internet dependency at runtime.** All services run locally — LAN works with the cable unplugged.
- **CORS is allowed for `*.local` and `localhost`.** The Gateway accepts cross-origin requests from any `*.{org}.local` subdomain and `localhost` on any port.
- **Collections are implicit.** No "create collection" endpoint. Uploading creates it; deleting the last file removes it.
- **No rename, no overwrite.** Delete and re-upload is the only way to replace a file.

---

## Quick reference

```typescript
import { createVaultClient, VaultError } from "@nublestation/vault";

const vault = createVaultClient({ url, apiKey });

await vault.upload(collection, filename, data);        // → FileResult
await vault.list(collection?);                         // → FileResult[]
await vault.download(collection, filename);            // → ArrayBuffer
await vault.setPublic(collection, filename, boolean);  // → FileResult
await vault.delete(collection, filename);              // → void
```

```bash
nuble init --url http://api.{org}.local --key nbl_... --slug myapp
nuble deploy           # zip + upload existing dist/
nuble deploy --build   # build (reads .env) + zip + upload
nuble status           # check gateway health
```
