/**
 * useVaultStore — React hook powered by @nublestation/vault
 *
 * ── HOW THE VAULT SDK IS SET UP ──────────────────────────────────────────────
 *
 *  Package:  @nublestation/vault   
 *
 *  The SDK exports three things you need:
 *
 *    createVaultClient(config) → vault object
 *      Factory function. Pass { url, apiKey } once. Returns a plain object
 *      (no class, no global state) with 5 async methods. Calling it at module
 *      level means we build it once and reuse across renders.
 *
 *    VaultError
 *      The only error type the client throws. Has two fields:
 *        .status  (HTTP status, e.g. 404, 409, 500)
 *        .code    (machine-readable string from the server, e.g. "not_found")
 *      Use `err instanceof VaultError` to distinguish SDK errors from
 *      unexpected JS exceptions.
 *
 *    FileResult  (type-only import)
 *      The shape the server returns for every file:
 *        { id, collection, filename, mimeType, sizeBytes, isPublic, createdAt }
 *
 * ── THE 5 SDK METHODS ────────────────────────────────────────────────────────
 *
 *  vault.upload(collection, filename, data)
 *    POST /v1/vault/files/{collection}/{filename}
 *    data can be Blob | Uint8Array | ArrayBuffer.
 *    Returns FileResult of the newly created file.
 *    Throws VaultError(409, "conflict") if a file with that name already exists.
 *
 *  vault.list(collection?)
 *    GET /v1/vault/files           ← all files (no collection arg)
 *    GET /v1/vault/files/{collection}  ← scoped to one collection
 *    Returns FileResult[].
 *
 *  vault.download(collection, filename)
 *    GET /v1/vault/files/{collection}/{filename}
 *    Returns ArrayBuffer (the raw bytes). Wrap in a Blob to trigger a browser
 *    download or display a preview.
 *
 *  vault.setPublic(collection, filename, isPublic)
 *    PATCH /v1/vault/files/{collection}/{filename}  { isPublic: true|false }
 *    Public files are accessible without an API key at:
 *      GET api.{org}.local/vault/{slug}/{collection}/{filename}
 *    Returns the updated FileResult.
 *
 *  vault.delete(collection, filename)
 *    DELETE /v1/vault/files/{collection}/{filename}
 *    Permanently removes the file and its metadata. Returns void.
 *
 * ── COLLECTIONS vs. FOLDERS ──────────────────────────────────────────────────
 *
 *  Vault collections are a FLAT namespace — NOT real directories.
 *  There is no "create collection" call: uploading to "reports/q1.pdf" in
 *  collection "reports" implicitly creates that collection.
 *
 *  This hook maps collections → UI "folders":
 *    • Folders are derived from the set of unique collection names in the file
 *      list (see the useEffect below).
 *    • createFolder() only updates React state — no server call needed.
 *    • deleteFolder() deletes every file in that collection, then removes the
 *      folder from state. The collection disappears once its last file is gone.
 *
 * ── OPTIMISTIC UPDATES ───────────────────────────────────────────────────────
 *
 *  Every mutation updates local React state immediately instead of re-fetching
 *  the full list. This keeps the UI snappy even on a slow LAN.
 *  Errors roll back via the setError() call; we do NOT currently undo the
 *  optimistic update (acceptable for a demo — add compensating setFiles() calls
 *  inside the catch blocks if you need rollback).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from 'react'

// Direct import from @nublestation/vault — the lower-level package.
// This skips @nublestation/client (the umbrella wrapper) and talks to the
// vault-specific factory and error class directly.
import { createVaultClient, VaultError } from '@nublestation/vault'
import type { FileResult } from '@nublestation/vault'

// ---------------------------------------------------------------------------
// Types — local UI shape, separate from the SDK's FileResult
// ---------------------------------------------------------------------------

// FileItem is what the UI components consume. It's deliberately wider than
// FileResult so UI-only fields (dataUrl) can live here without polluting the SDK.
export type FileItem = {
  id: string
  name: string
  size: number
  type: string
  isPublic: boolean
  createdAt: number      // milliseconds (JS Date.getTime()), not ISO string
  folderName: string | null  // maps to Vault collection name
  dataUrl: string            // always '' — image preview falls back to type icon
}

export type Folder = {
  id: string      // same as collection name (the stable key)
  name: string
  createdAt: number
}

// ---------------------------------------------------------------------------
// SDK client — created ONCE at module level, not inside the hook.
//
// Why module level?
//   createVaultClient() is pure (no side effects, no fetch). Putting it inside
//   useVaultStore() would rebuild the object on every render for no benefit.
//   Module-level means a single shared instance for the whole app.
// ---------------------------------------------------------------------------

const NUBLE_URL = import.meta.env.VITE_NUBLESTATION_URL as string
const NUBLE_KEY = import.meta.env.VITE_NUBLESTATION_API_KEY as string
const DEFAULT_COLLECTION = 'bucket'  // files with no explicit folder land here

if (!NUBLE_URL) console.error('[Bucket] VITE_NUBLESTATION_URL is not set')
if (!NUBLE_KEY) console.error('[Bucket] VITE_NUBLESTATION_API_KEY is not set')

// vault is the object returned by createVaultClient — it holds no internal
// state, just a config reference. Every method call is a fresh fetch().
const vault = createVaultClient({ url: NUBLE_URL, apiKey: NUBLE_KEY })

// ---------------------------------------------------------------------------
// Helper — maps a SDK FileResult row → our local FileItem shape
// ---------------------------------------------------------------------------

function toFileItem(r: FileResult, fallbackSize = 0): FileItem {
  return {
    id:         r.id,
    name:       r.filename,
    size:       r.sizeBytes ?? fallbackSize,
    type:       r.mimeType  ?? 'application/octet-stream',
    isPublic:   r.isPublic,
    createdAt:  new Date(r.createdAt).getTime(),  // ISO → ms
    folderName: r.collection,
    dataUrl:    '',
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useVaultStore() {
  const [files, setFiles]     = useState<FileItem[]>([])
  const [folders, setFolders] = useState<Folder[]>([
    // Seed the default collection so the UI shows at least one "folder"
    // before the list fetch completes.
    { id: DEFAULT_COLLECTION, name: DEFAULT_COLLECTION, createdAt: Date.now() },
  ])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const totalBytes = files.reduce((s, f) => s + f.size, 0)

  // ── vault.list() — load all files on mount ──────────────────────────────
  //
  // vault.list() with no argument calls GET /v1/vault/files and returns
  // every file across all collections. We then derive folders from the
  // unique collection names in the response.
  //
  // The `cancelled` flag guards against the React double-invoke in strict mode
  // and cases where the component unmounts before the fetch completes.

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    vault.list()                         // ← SDK call: GET /v1/vault/files
      .then((rows: FileResult[]) => {
        if (cancelled) return

        setFiles(rows.map(r => toFileItem(r)))

        // Derive folders from unique collection values in the response.
        // Vault has no "list collections" endpoint — collections only exist
        // as labels on files, so this is the only way to enumerate them.
        const seen = new Set<string>()
        const derived: Folder[] = []
        for (const r of rows) {
          if (!seen.has(r.collection)) {
            seen.add(r.collection)
            derived.push({ id: r.collection, name: r.collection, createdAt: Date.now() })
          }
        }
        // Always keep the default collection visible even if it has no files yet.
        if (!seen.has(DEFAULT_COLLECTION)) {
          derived.unshift({ id: DEFAULT_COLLECTION, name: DEFAULT_COLLECTION, createdAt: Date.now() })
        }
        setFolders(derived)
      })
      .catch(err => {
        if (!cancelled) {
          // VaultError.code is the server's machine-readable error string (e.g. "unauthorized").
          // Fall back to a generic message for unexpected JS errors.
          setError(err instanceof VaultError ? err.code : 'Failed to load files')
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }  // cleanup: ignore stale response
  }, [])

  // ── vault.upload() — add one or more files ──────────────────────────────
  //
  // SDK signature: vault.upload(collection, filename, data) → FileResult
  //
  // data must be Blob | Uint8Array | ArrayBuffer.
  // We convert the browser File via file.arrayBuffer() → Uint8Array because
  // Uint8Array is the most explicit form and avoids any Blob quirks.
  //
  // After upload we call vault.setPublic() only when the user toggled isPublic.
  // The upload endpoint always creates private files — there's no combined
  // "upload and make public" endpoint.
  //
  // Optimistic update: we append to `files` immediately using the FileResult
  // the server returned (so the id and createdAt are authoritative).

  const addFiles = useCallback(async (
    pending: { file: File; isPublic: boolean; folderName: string | null }[]
  ): Promise<boolean> => {
    try {
      const uploaded: FileItem[] = []

      for (const { file, isPublic, folderName } of pending) {
        const collection = folderName ?? DEFAULT_COLLECTION

        // Convert browser File → Uint8Array so the SDK can send it as FormData.
        const bytes  = new Uint8Array(await file.arrayBuffer())

        // vault.upload() → POST /v1/vault/files/{collection}/{filename}
        // Returns the full FileResult with id, mimeType, sizeBytes, etc.
        const result = await vault.upload(collection, file.name, bytes)

        // If the user marked this file public, patch visibility immediately.
        // vault.setPublic() → PATCH /v1/vault/files/{collection}/{filename}
        if (isPublic) await vault.setPublic(collection, file.name, true)

        uploaded.push(toFileItem(result, file.size))

        // Add the collection as a folder in UI state if it's new.
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

  // ── vault.delete() — remove a single file ───────────────────────────────
  //
  // SDK signature: vault.delete(collection, filename) → void
  //
  // We look up the file's collection + filename from local state because the
  // caller only passes the id (the stable UI key). vault.delete() needs both
  // the collection and filename to construct the path.
  //
  // DELETE /v1/vault/files/{collection}/{filename}

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

  // ── Rename — not supported by Vault ─────────────────────────────────────
  //
  // Vault stores files at an immutable path (collection/filename). There is
  // no PATCH/PUT for renaming — the only way to rename is delete + re-upload.
  // We surface this as an error message rather than silently ignoring the call.

  const renameFile = useCallback((_id: string, _name: string) => {
    setError('Rename is not supported — delete and re-upload with the new name.')
    setTimeout(() => setError(null), 3000)
  }, [])

  // ── vault.setPublic() — toggle file visibility ───────────────────────────
  //
  // SDK signature: vault.setPublic(collection, filename, isPublic) → FileResult
  //
  // PATCH /v1/vault/files/{collection}/{filename}  { isPublic: true|false }
  //
  // Public files are served without auth at:
  //   GET api.{org}.local/vault/{slug}/{collection}/{filename}
  // Private files require a Bearer API key in the Authorization header.
  //
  // We optimistically toggle the local flag — if the PATCH fails we show the
  // error but don't revert the local state (acceptable for a demo).

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

  // ── vault.download() — get raw bytes ─────────────────────────────────────
  //
  // SDK signature: vault.download(collection, filename) → ArrayBuffer
  //
  // GET /v1/vault/files/{collection}/{filename}
  //
  // The SDK returns the raw ArrayBuffer. We wrap it in a Blob with the correct
  // MIME type so the browser knows how to handle it, then create an object URL
  // for a programmatic <a> click. The object URL is revoked immediately after
  // the click to avoid memory leaks.

  const downloadFile = useCallback(async (file: FileItem) => {
    try {
      const buffer = await vault.download(file.folderName ?? DEFAULT_COLLECTION, file.name)
      const url    = URL.createObjectURL(new Blob([buffer], { type: file.type }))
      const a      = document.createElement('a')
      a.href = url; a.download = file.name; a.click()
      URL.revokeObjectURL(url)  // free the object URL immediately
    } catch (err) {
      setError(err instanceof VaultError ? err.code : 'Download failed')
    }
  }, [])

  // ── Folders (UI-only — Vault collections are implicit) ───────────────────
  //
  // None of the three folder operations below make a server call.
  // Collections are created implicitly when the first file is uploaded to them.
  // "Deleting a folder" means deleting every file in it — after the last file
  // is gone, the collection simply ceases to appear in vault.list() responses.

  const createFolder = useCallback((name: string, _parentId: string | null): string => {
    // Normalise the name to a slug safe for use as a collection name.
    const id = name.toLowerCase().replace(/\s+/g, '-')
    setFolders(prev =>
      prev.some(f => f.id === id)
        ? prev                                           // already exists, no-op
        : [...prev, { id, name, createdAt: Date.now() }]
    )
    return id
  }, [])

  const renameFolder = useCallback((id: string, name: string) => {
    // UI-only rename — does NOT rename the server-side collection.
    // Files still live under the old collection name; this only updates the label.
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f))
  }, [])

  const deleteFolder = useCallback(async (id: string) => {
    // Delete every file in this collection via vault.delete(), then remove the
    // folder from state. Uses Promise.all for parallel deletes.
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
    files,
    folders,
    totalBytes,
    loading,
    error,
    addFiles,
    deleteFile,
    renameFile,
    toggleFileVisibility,
    downloadFile,
    createFolder,
    renameFolder,
    deleteFolder,
  }
}
