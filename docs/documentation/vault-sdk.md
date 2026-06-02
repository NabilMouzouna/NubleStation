# Vault SDK — `@nublestation/vault`

Client library for the Vault file storage service. Targets browser apps and Node.js scripts. Framework-agnostic — see [React integration](#react-integration-usevaultstore) for a ready-made React hook.

Related: [`docs/documentation/vault-service.md`](./vault-service.md) (server-side internals)

---

## Installation

```bash
# Monorepo app (workspace dependency)
pnpm add @nublestation/vault --filter <your-app>

# Or, if you consume multiple NubleStation services from one app
pnpm add @nublestation/client --filter <your-app>
# → @nublestation/client re-exports everything from @nublestation/vault
#   and wraps it under nuble.vault.*
```

**Which package to use:**

| Scenario | Use |
|---|---|
| Your app only stores files | `@nublestation/vault` directly |
| Your app also uses Blaze, Identity, etc. | `@nublestation/client` (`nuble.vault.*`) |

They call the same HTTP endpoints. `@nublestation/client` is a thin wrapper that calls `createVaultClient` internally.

---

## Setup

```typescript
import { createVaultClient } from '@nublestation/vault'

const vault = createVaultClient({
  url:    'http://api.clinic.local',  // your org's Gateway base URL
  apiKey: 'nbl_<key_id>.<secret>',   // issued from the Console
})
```

`createVaultClient` is a pure factory — no side effects, no network call at construction time. Create the client once at module level and reuse it. The returned object holds no mutable state; every method call is an independent `fetch()`.

### Config

```typescript
interface ClientConfig {
  url:    string   // Gateway base URL — no trailing slash
  apiKey: string   // API key from Console (format: nbl_<id>.<secret>)
}
```

Every request attaches `Authorization: Bearer <apiKey>`. The Gateway resolves the key to an app context before forwarding to Vault.

---

## Collections

All methods that target a specific file take a `collection` argument. A collection is a **flat namespace prefix** — not a directory. There is no create-collection or list-collections endpoint; a collection comes into existence when the first file is uploaded to it and disappears when its last file is deleted.

**Collection name rules** (enforced by the server):
- Characters: `[a-zA-Z0-9][a-zA-Z0-9._-]*`
- No slashes, no `..`, no leading dots
- Names that violate the pattern return `400 invalid_segment`

Files are addressed by the pair `(collection, filename)`. Both segments must be unique within an app — you cannot have two files named `report.pdf` in the same collection.

---

## Methods

### `vault.upload(collection, filename, data)`

Upload a file to a collection.

```typescript
const file: FileResult = await vault.upload(
  'reports',           // collection name
  'q1-summary.pdf',    // filename (stored as-is)
  data,                // Blob | Uint8Array | ArrayBuffer
)
```

**HTTP:** `POST /v1/vault/files/{collection}/{filename}` — multipart/form-data, field name `file`.

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `collection` | `string` | Target collection name |
| `filename` | `string` | Filename stored on disk and returned in responses |
| `data` | `Blob \| Uint8Array \| ArrayBuffer` | File bytes |

**Response:** `FileResult` — the full metadata record created by the server.

**Notes:**
- Uploaded files are **private by default** (`isPublic: false`). Call `setPublic()` after upload if needed.
- The server detects the real MIME type from the file's magic bytes, regardless of any `Content-Type` you set. The detected type is stored and returned as `mimeType`.
- File size limit: 50 MB per file (configurable per app in the Console).

**Errors:**

| Status | Code | Cause |
|---|---|---|
| 400 | `invalid_segment` | `collection` or `filename` contains illegal characters |
| 401 | `unauthorized` | Missing or invalid API key |
| 409 | `file_already_exists` | A file with this `(collection, filename)` already exists for the app. Vault has no overwrite — delete first or choose a different name. |
| 413 | `file_too_large` | Exceeds `max_file_bytes` configured for the app (default 50 MB) |
| 415 | `extension_not_allowed` | The filename's extension is not in the app's `allowed_extensions` list |

---

### `vault.list(collection?)`

List file metadata. Optionally scoped to a single collection.

```typescript
// All files for this app
const allFiles: FileResult[] = await vault.list()

// Only files in the 'reports' collection
const reports: FileResult[] = await vault.list('reports')
```

**HTTP:**
- `GET /v1/vault/files` — all files
- `GET /v1/vault/files/{collection}` — scoped

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `collection` | `string` (optional) | If provided, only returns files in this collection |

**Response:** `FileResult[]` — empty array if no files exist; never `null`.

**Notes:**
- The response does not include file bytes — only metadata. Use `download()` to fetch bytes.
- There is no pagination. For apps with very large file sets, scope by collection.
- To enumerate existing collections, collect unique `r.collection` values from the response.

**Errors:**

| Status | Code | Cause |
|---|---|---|
| 401 | `unauthorized` | Missing or invalid API key |

---

### `vault.download(collection, filename)`

Fetch the raw bytes of a file.

```typescript
const buffer: ArrayBuffer = await vault.download('reports', 'q1-summary.pdf')

// Trigger a browser download
const url = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }))
const a   = document.createElement('a')
a.href = url; a.download = 'q1-summary.pdf'; a.click()
URL.revokeObjectURL(url)  // free the object URL immediately after click

// Or display an image preview
const imgUrl = URL.createObjectURL(new Blob([buffer], { type: 'image/png' }))
imgElement.src = imgUrl
```

**HTTP:** `GET /v1/vault/files/{collection}/{filename}`

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `collection` | `string` | Collection the file belongs to |
| `filename` | `string` | Exact filename |

**Response:** `ArrayBuffer` — the raw file bytes. The `Content-Type` header in the response reflects the stored MIME type, but the SDK returns only the buffer (no headers).

**Notes:**
- This route requires an API key. For browser-served public files without a key, use the [public URL](#public-file-url) instead.
- Always wrap the buffer in a `Blob` with the correct type before creating an object URL so the browser handles the file correctly.
- Call `URL.revokeObjectURL()` after use to avoid memory leaks.

**Errors:**

| Status | Code | Cause |
|---|---|---|
| 401 | `unauthorized` | Missing or invalid API key |
| 404 | `not_found` | No file at `(collection, filename)` for this app |

---

### `vault.setPublic(collection, filename, isPublic)`

Make a file publicly accessible (no API key required) or revert it to private.

```typescript
// Make public
const updated: FileResult = await vault.setPublic('reports', 'q1-summary.pdf', true)

// Make private again
await vault.setPublic('reports', 'q1-summary.pdf', false)
```

**HTTP:** `PATCH /v1/vault/files/{collection}/{filename}` — body `{ "isPublic": true|false }`, `Content-Type: application/json`.

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `collection` | `string` | Collection the file belongs to |
| `filename` | `string` | Exact filename |
| `isPublic` | `boolean` | `true` = publicly accessible; `false` = API key required |

**Response:** `FileResult` — the updated record with the new `isPublic` value.

**Notes:**
- Once public, the file is accessible at:
  `http://api.{org}.local/vault/{app_slug}/{collection}/{filename}`
  No API key, no auth header needed — anyone on the LAN can fetch it.
- The `is_public` flag is checked on every public request; toggling it takes effect immediately.
- There are no signed URLs or expiring links — public is permanent until you set it back to private.

**Errors:**

| Status | Code | Cause |
|---|---|---|
| 400 | `invalid_body` | Request body is not valid JSON or `isPublic` is not a boolean |
| 401 | `unauthorized` | Missing or invalid API key |
| 404 | `not_found` | No file at `(collection, filename)` for this app |

---

### `vault.delete(collection, filename)`

Permanently delete a file and its metadata.

```typescript
await vault.delete('reports', 'q1-summary.pdf')
// resolves void — no return value
```

**HTTP:** `DELETE /v1/vault/files/{collection}/{filename}`

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `collection` | `string` | Collection the file belongs to |
| `filename` | `string` | Exact filename |

**Response:** `void` — resolves with no value on success.

**Notes:**
- Hard delete — both the disk file and its database row are removed atomically. There is no soft delete, no trash, no recovery.
- Deleting the last file in a collection implicitly removes the collection (it will no longer appear in `list()` responses).
- **Rename is not supported.** Vault has no move or rename operation. To rename, delete and re-upload under the new name.

**Errors:**

| Status | Code | Cause |
|---|---|---|
| 401 | `unauthorized` | Missing or invalid API key |
| 404 | `not_found` | No file at `(collection, filename)` for this app |

---

## Error handling

Every method throws `VaultError` on a non-2xx response. All other errors (network failure, JSON parse error) bubble as standard `Error` instances.

```typescript
import { VaultError } from '@nublestation/vault'

try {
  await vault.upload('docs', 'report.pdf', bytes)
} catch (err) {
  if (err instanceof VaultError) {
    // Server returned a structured error response
    console.error(err.status)  // HTTP status code, e.g. 409
    console.error(err.code)    // machine-readable string, e.g. "file_already_exists"

    if (err.status === 409) {
      // Handle the conflict case specifically
    }
  } else {
    // Unexpected JS error (network down, runtime bug, etc.)
    throw err
  }
}
```

### `VaultError` shape

```typescript
class VaultError extends Error {
  readonly status: number   // HTTP status (400, 401, 404, 409, 413, 415, 500…)
  readonly code:   string   // server error string from { error: "..." } response body
  readonly name:   string   // always "VaultError"
}
```

### All error codes

| Code | Status | Thrown by |
|---|---|---|
| `unauthorized` | 401 | All methods — invalid or missing API key |
| `invalid_segment` | 400 | `upload`, `download`, `setPublic`, `delete` — bad collection or filename |
| `file_already_exists` | 409 | `upload` — `(collection, filename)` pair already exists |
| `file_too_large` | 413 | `upload` — exceeds `max_file_bytes` for the app |
| `extension_not_allowed` | 415 | `upload` — extension not in app's `allowed_extensions` list |
| `invalid_body` | 400 | `setPublic` — body is missing or `isPublic` is not a boolean |
| `not_found` | 404 | `download`, `setPublic`, `delete` — file doesn't exist |
| `request_failed` | any | Fallback when the server returns a non-OK response with no parseable `error` field |

---

## TypeScript types

```typescript
// Config passed to createVaultClient
interface ClientConfig {
  url:    string   // Gateway base URL — no trailing slash
  apiKey: string   // nbl_<key_id>.<secret>
}

// Shape returned by every method (except download and delete)
interface FileResult {
  id:         string          // UUID — stable identifier
  collection: string          // collection the file belongs to
  filename:   string          // exact filename
  mimeType:   string | null   // detected from magic bytes on upload; null if undetectable
  sizeBytes:  number | null   // byte length; null if not recorded
  isPublic:   boolean         // true = accessible without API key
  createdAt:  string          // ISO 8601 timestamp, e.g. "2026-05-30T14:22:00Z"
}
```

Type-only imports (no runtime cost):

```typescript
import type { ClientConfig, FileResult } from '@nublestation/vault'
```

---

## Public file URL

Files made public via `setPublic(..., true)` are served at:

```
http://api.{org}.local/vault/{app_slug}/{collection}/{filename}
```

Example:
```
http://api.clinic.local/vault/tasks/attachments/patient-form.pdf
```

This route goes through the Gateway but requires **no API key**. Anyone on the LAN can request it. The Vault service checks `is_public = true` on every request; if the flag was flipped back to `false`, the URL immediately returns `403 Forbidden`.

Use this URL to embed files directly in `<img src="...">` or `<a href="...">` tags without exposing your API key to the browser.

---

## React integration — `useVaultStore`

The hook below is the canonical React wrapper for the Vault SDK. Copy it into your app — it is not published as a package because it imports React, which would make the SDK browser-only.

```typescript
// hooks/useVaultStore.ts

import { useState, useEffect, useCallback } from 'react'
import { createVaultClient, VaultError } from '@nublestation/vault'
import type { FileResult } from '@nublestation/vault'

// ── Local UI types ───────────────────────────────────────────────────────────
// FileItem is wider than FileResult — it holds UI-only fields (dataUrl)
// without polluting the SDK type.

export type FileItem = {
  id: string
  name: string
  size: number
  type: string
  isPublic: boolean
  createdAt: number      // ms (Date.getTime()), not ISO string
  folderName: string | null  // maps to Vault collection name
  dataUrl: string            // always '' — preview falls back to type icon
}

export type Folder = {
  id: string      // same as collection name
  name: string
  createdAt: number
}

// ── Client — created ONCE at module level ────────────────────────────────────
// createVaultClient() is pure. Module-level avoids rebuilding the object on
// every render.

const vault = createVaultClient({
  url:    import.meta.env.VITE_NUBLESTATION_URL as string,
  apiKey: import.meta.env.VITE_NUBLESTATION_API_KEY as string,
})

const DEFAULT_COLLECTION = 'bucket'

// ── FileResult → FileItem mapper ─────────────────────────────────────────────

function toFileItem(r: FileResult, fallbackSize = 0): FileItem {
  return {
    id:         r.id,
    name:       r.filename,
    size:       r.sizeBytes ?? fallbackSize,
    type:       r.mimeType  ?? 'application/octet-stream',
    isPublic:   r.isPublic,
    createdAt:  new Date(r.createdAt).getTime(),
    folderName: r.collection,
    dataUrl:    '',
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useVaultStore() {
  const [files, setFiles]     = useState<FileItem[]>([])
  const [folders, setFolders] = useState<Folder[]>([
    { id: DEFAULT_COLLECTION, name: DEFAULT_COLLECTION, createdAt: Date.now() },
  ])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const totalBytes = files.reduce((s, f) => s + f.size, 0)

  // vault.list() — fetch all files on mount.
  // `cancelled` guards against React strict-mode double-invoke and
  // unmount-before-fetch races.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    vault.list()
      .then((rows: FileResult[]) => {
        if (cancelled) return
        setFiles(rows.map(r => toFileItem(r)))
        // Derive folders from unique collection values — Vault has no
        // "list collections" endpoint.
        const seen = new Set<string>()
        const derived: Folder[] = []
        for (const r of rows) {
          if (!seen.has(r.collection)) {
            seen.add(r.collection)
            derived.push({ id: r.collection, name: r.collection, createdAt: Date.now() })
          }
        }
        if (!seen.has(DEFAULT_COLLECTION))
          derived.unshift({ id: DEFAULT_COLLECTION, name: DEFAULT_COLLECTION, createdAt: Date.now() })
        setFolders(derived)
      })
      .catch(err => {
        if (!cancelled)
          setError(err instanceof VaultError ? err.code : 'Failed to load files')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // vault.upload() — convert browser File → Uint8Array, then upload.
  // After upload, call setPublic() if the user flagged the file as public
  // (upload always creates private files).
  // Optimistic: appends to files[] immediately using the server-returned
  // FileResult (authoritative id and createdAt).
  const addFiles = useCallback(async (
    pending: { file: File; isPublic: boolean; folderName: string | null }[]
  ): Promise<boolean> => {
    try {
      const uploaded: FileItem[] = []
      for (const { file, isPublic, folderName } of pending) {
        const collection = folderName ?? DEFAULT_COLLECTION
        const bytes      = new Uint8Array(await file.arrayBuffer())
        const result     = await vault.upload(collection, file.name, bytes)
        if (isPublic) await vault.setPublic(collection, file.name, true)
        uploaded.push(toFileItem(result, file.size))
        setFolders(prev =>
          prev.some(f => f.id === collection)
            ? prev
            : [...prev, { id: collection, name: collection, createdAt: Date.now() }]
        )
      }
      setFiles(prev => [...prev, ...uploaded])
      return true
    } catch (err) {
      setError(err instanceof VaultError ? err.code : 'Upload failed')
      return false
    }
  }, [])

  // vault.delete() — requires collection + filename, looked up from local state
  // using the stable id.
  const deleteFile = useCallback(async (id: string) => {
    const file = files.find(f => f.id === id)
    if (!file) return
    try {
      await vault.delete(file.folderName ?? DEFAULT_COLLECTION, file.name)
      setFiles(prev => prev.filter(f => f.id !== id))
    } catch (err) {
      setError(err instanceof VaultError ? err.code : 'Delete failed')
    }
  }, [files])

  // Vault has no rename endpoint — the only way to rename is delete + re-upload.
  const renameFile = useCallback((_id: string, _name: string) => {
    setError('Rename is not supported — delete and re-upload with the new name.')
    setTimeout(() => setError(null), 3000)
  }, [])

  // vault.setPublic() — optimistic toggle. Does not revert local state on error.
  const toggleFileVisibility = useCallback(async (id: string) => {
    const file = files.find(f => f.id === id)
    if (!file) return
    try {
      await vault.setPublic(file.folderName ?? DEFAULT_COLLECTION, file.name, !file.isPublic)
      setFiles(prev => prev.map(f => f.id === id ? { ...f, isPublic: !f.isPublic } : f))
    } catch (err) {
      setError(err instanceof VaultError ? err.code : 'Failed to update visibility')
    }
  }, [files])

  // vault.download() — returns ArrayBuffer. Wrap in a Blob with the correct
  // MIME type, create an object URL for a programmatic <a> click, then revoke.
  const downloadFile = useCallback(async (file: FileItem) => {
    try {
      const buffer = await vault.download(file.folderName ?? DEFAULT_COLLECTION, file.name)
      const url    = URL.createObjectURL(new Blob([buffer], { type: file.type }))
      const a      = document.createElement('a')
      a.href = url; a.download = file.name; a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof VaultError ? err.code : 'Download failed')
    }
  }, [])

  // Folder helpers — UI-only state. No server calls.
  // Collections are created implicitly on first upload to them.
  const createFolder = useCallback((name: string, _parentId: string | null): string => {
    const id = name.toLowerCase().replace(/\s+/g, '-')
    setFolders(prev =>
      prev.some(f => f.id === id)
        ? prev
        : [...prev, { id, name, createdAt: Date.now() }]
    )
    return id
  }, [])

  const renameFolder = useCallback((id: string, name: string) => {
    // UI label only — files still live under the original collection name on disk.
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f))
  }, [])

  const deleteFolder = useCallback(async (id: string) => {
    const toDelete = files.filter(f => f.folderName === id)
    try {
      await Promise.all(
        toDelete.map(f => vault.delete(f.folderName ?? DEFAULT_COLLECTION, f.name))
      )
      setFiles(prev    => prev.filter(f => f.folderName !== id))
      setFolders(prev  => prev.filter(f => f.id !== id))
    } catch (err) {
      setError(err instanceof VaultError ? err.code : 'Failed to delete folder')
    }
  }, [files])

  return {
    files, folders, totalBytes, loading, error,
    addFiles, deleteFile, renameFile,
    toggleFileVisibility, downloadFile,
    createFolder, renameFolder, deleteFolder,
  }
}
```

### What the hook provides

| Returned value | Type | Description |
|---|---|---|
| `files` | `FileItem[]` | All files for the app, kept in sync with every mutation |
| `folders` | `Folder[]` | Unique collections derived from `files`, plus the default collection |
| `totalBytes` | `number` | Sum of `file.size` across all files |
| `loading` | `boolean` | `true` while the initial `vault.list()` is in flight |
| `error` | `string \| null` | Last error code; `null` if no error |
| `addFiles(pending)` | `async → boolean` | Upload one or more files; returns `true` on full success |
| `deleteFile(id)` | `async → void` | Delete by stable `FileItem.id` |
| `renameFile(id, name)` | `→ void` | Sets an error message (rename unsupported) |
| `toggleFileVisibility(id)` | `async → void` | Toggle `isPublic` |
| `downloadFile(file)` | `async → void` | Triggers browser file download |
| `createFolder(name, parentId)` | `→ string` | UI-only; returns the new folder id |
| `renameFolder(id, name)` | `→ void` | UI label rename only |
| `deleteFolder(id)` | `async → void` | Deletes all files in the collection, then removes the folder |

### Environment variables

The hook reads two Vite env vars:

| Variable | Description |
|---|---|
| `VITE_NUBLESTATION_URL` | Gateway base URL, e.g. `http://api.clinic.local` |
| `VITE_NUBLESTATION_API_KEY` | App API key from the Console (format: `nbl_<id>.<secret>`) |

---

## References

- SDK source — `packages/vault/src/`
- Vault service internals — `docs/documentation/vault-service.md`
- ADR 012 — `docs/adr/012-vault-storage-service.md`
- ADR 008 — `docs/adr/008-cli-sdk-architecture.md`
