# @nublestation/vault

File storage SDK for [NubleStation](https://nabilmouzouna.github.io/NubleStation/) — upload, download, list, share, and control public/private access to files from your app.

```bash
npm install @nublestation/vault
```

## Quick start

```typescript
import { createVaultClient } from "@nublestation/vault";

const vault = createVaultClient({
  url:    "http://api.clinic.local",   // your NubleStation gateway
  apiKey: "nbl_<key_id>.<secret>",     // API key from the Console
});

// Upload a file to the "reports" collection
await vault.upload("reports", "q1.pdf", file);

// List everything the caller can see in that collection
const files = await vault.list("reports");

// Download raw bytes
const bytes = await vault.download("reports", "q1.pdf");
```

Get an API key from the Console: **Apps → your app → Settings → Generate API key**. The key is scoped to a single app — every request made with it is isolated to that app's files.

## Collections

A **collection** is a flat namespace for files (think of it as a top-level folder). You choose the names — e.g. `"reports"`, `"avatars"`, `"uploads"`. Files are addressed by `(collection, filename)`.

## API

`createVaultClient(config)` returns a client with these methods:

| Method | Returns | Description |
|---|---|---|
| `upload(collection, filename, data)` | `Promise<FileResult>` | Upload a `Blob`, `Uint8Array`, or `ArrayBuffer`. Stamped with the caller as owner. |
| `download(collection, filename)` | `Promise<ArrayBuffer>` | Fetch a file's raw bytes. |
| `list(collection?)` | `Promise<FileResult[]>` | Every file the caller can see, optionally scoped to one collection. |
| `listMine(collection?)` | `Promise<FileResult[]>` | Files the caller owns. |
| `listSharedWithMe()` | `Promise<FileResult[]>` | Files other users have shared with the caller. |
| `listPublic(collection?)` | `Promise<FileResult[]>` | Public files in this app. |
| `setPublic(collection, filename, isPublic)` | `Promise<FileResult>` | Toggle a file public or private. |
| `delete(collection, filename)` | `Promise<void>` | Permanently delete a file and its metadata. |
| `share(collection, filename, granteeUserId, role)` | `Promise<void>` | Share a file with one user as `"viewer"` or `"editor"`. Pass `null` for `filename` to share the whole collection. |
| `unshare(collection, filename, granteeUserId)` | `Promise<void>` | Revoke a previously created share. |
| `listGrants(collection, filename)` | `Promise<Grant[]>` | List who a resource you own is shared with. |

### Config

```typescript
interface ClientConfig {
  url: string;     // Gateway base URL, e.g. http://api.clinic.local
  apiKey: string;  // API key issued from the Console (nbl_...)
}
```

### Types

```typescript
type GrantRole = "viewer" | "editor";

interface FileResult {
  id: string;
  ownerId: string | null;          // Identity user id of the owner
  collection: string;
  filename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  isPublic: boolean;
  createdAt: string;               // ISO 8601
  role?: GrantRole | "owner" | "public";
}

interface Grant {
  granteeUserId: string;
  granteeEmail: string;
  granteeName: string | null;
  collection: string;
  filename: string | null;         // null = whole-collection grant
  role: GrantRole;
  createdAt: string;
}
```

## Error handling

Every method throws `VaultError` on a non-2xx response.

```typescript
import { VaultError } from "@nublestation/vault";

try {
  await vault.upload("docs", "report.pdf", bytes);
} catch (err) {
  if (err instanceof VaultError) {
    console.error(err.status, err.code); // e.g. 401 "unauthorized"
  }
}
```

| Code | Status | Meaning |
|---|---|---|
| `unauthorized` | 401 | API key missing, invalid, or revoked |
| `forbidden` | 403 | The caller has no access to that file |
| `not_found` | 404 | File or collection does not exist |
| `internal_error` | 500 | Unexpected server error |

## Browser usage

In a bundler (Vite, etc.) read config from env so the key isn't hard-coded:

```typescript
const vault = createVaultClient({
  url:    import.meta.env.VITE_NUBLESTATION_URL,
  apiKey: import.meta.env.VITE_NUBLESTATION_API_KEY,
});
```

## How it works

The SDK sends plain HTTP to `api.{org}.local` with an `Authorization: Bearer nbl_...` header. The Gateway validates the key, resolves your app, and HMAC-signs the forwarded request before it reaches Vault — your app never handles internal secrets.

## License

MIT
