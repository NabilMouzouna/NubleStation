/**
 * useVaultStore — React hook powered by @nublestation/vault
 *
 * ── OWNERSHIP & SHARING (ADR 016) ────────────────────────────────────────────
 *
 *  Bucket is an S3-style app: every file is owned by the Identity user who
 *  uploaded it and is private by default. The store exposes three views, each
 *  backed by a dedicated SDK call:
 *
 *    view "mine"   → vault.listMine()           files I own (full folder tree)
 *    view "shared" → vault.listSharedWithMe()   files others shared with me
 *    view "public" → vault.listPublic()         public files across the app
 *
 *  Sharing is per-individual (viewer / editor):
 *    vault.share(collection, filename, granteeUserId, role)
 *    vault.unshare(collection, filename, granteeUserId)
 *    vault.listGrants(collection, filename)
 *
 *  The session cookie identifies the user; the Gateway resolves it to a user_id
 *  and Vault stamps/checks ownership. None of this is the developer's job beyond
 *  picking the right list call and offering a share UI.
 *
 * ── THE SDK METHODS ──────────────────────────────────────────────────────────
 *
 *  vault.upload(collection, filename, data)   → POST  /v1/vault/files/{c}/{f}
 *  vault.listMine(collection?)                → GET   /v1/vault/files/mine
 *  vault.listSharedWithMe()                   → GET   /v1/vault/files/shared
 *  vault.listPublic(collection?)              → GET   /v1/vault/files/public
 *  vault.download(collection, filename)       → GET   /v1/vault/files/{c}/{f}
 *  vault.setPublic(collection, filename, b)   → PATCH /v1/vault/files/{c}/{f}
 *  vault.delete(collection, filename)         → DELETE/v1/vault/files/{c}/{f}
 *  vault.share / unshare / listGrants         → /v1/vault/grants
 *
 * ── COLLECTIONS vs. FOLDERS ──────────────────────────────────────────────────
 *
 *  Collections are a flat namespace (not real directories). Uploading to
 *  "reports/q1.pdf" implicitly creates the "reports" collection. The "mine"
 *  view maps the unique collection names of my files → UI folders.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from 'react'

import { createVaultClient, VaultError } from '@nublestation/vault'
import type { FileResult, Grant, GrantRole } from '@nublestation/vault'

// ---------------------------------------------------------------------------
// Types — local UI shape, separate from the SDK's FileResult
// ---------------------------------------------------------------------------

export type VaultView = 'mine' | 'shared' | 'public'

export type FileRole = 'owner' | 'editor' | 'viewer' | 'public'

export type FileItem = {
  id: string
  name: string
  size: number
  type: string
  isPublic: boolean
  createdAt: number      // milliseconds (JS Date.getTime()), not ISO string
  folderName: string | null  // maps to Vault collection name
  dataUrl: string            // always '' — image preview falls back to type icon
  ownerId: string | null     // Identity user id of the owner (ADR 016)
  role?: FileRole            // the caller's relationship to this file
}

export type Folder = {
  id: string      // same as collection name (the stable key)
  name: string
  createdAt: number
}

export type { Grant, GrantRole } from '@nublestation/vault'

// ---------------------------------------------------------------------------
// SDK client — created ONCE at module level (pure factory, no side effects).
// ---------------------------------------------------------------------------

const NUBLE_URL = (import.meta.env.VITE_NUBLESTATION_URL as string) || 'http://api.nuble.local'
const NUBLE_KEY = import.meta.env.VITE_NUBLESTATION_API_KEY as string
const DEFAULT_COLLECTION = 'bucket'

if (!NUBLE_KEY) console.error('[Bucket] VITE_NUBLESTATION_API_KEY is not set')

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
    ownerId:    r.ownerId,
    role:       r.role,
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useVaultStore() {
  const [view, setViewState] = useState<VaultView>('mine')
  const [files, setFiles]     = useState<FileItem[]>([])
  const [folders, setFolders] = useState<Folder[]>([
    { id: DEFAULT_COLLECTION, name: DEFAULT_COLLECTION, createdAt: Date.now() },
  ])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const totalBytes = files.reduce((s, f) => s + f.size, 0)

  // ── Load the active view ─────────────────────────────────────────────────
  // "mine" derives folders from my collections; the other views are flat.
  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const load = async (): Promise<{ rows: FileResult[] }> => {
      if (view === 'mine')   return { rows: await vault.listMine() }
      if (view === 'shared') return { rows: await vault.listSharedWithMe() }
      return { rows: await vault.listPublic() }
    }

    load()
      .then(({ rows }) => {
        if (cancelled) return
        setFiles(rows.map((r) => toFileItem(r)))

        if (view === 'mine') {
          const seen = new Set<string>()
          const derived: Folder[] = []
          for (const r of rows) {
            if (!seen.has(r.collection)) {
              seen.add(r.collection)
              derived.push({ id: r.collection, name: r.collection, createdAt: Date.now() })
            }
          }
          if (!seen.has(DEFAULT_COLLECTION)) {
            derived.unshift({ id: DEFAULT_COLLECTION, name: DEFAULT_COLLECTION, createdAt: Date.now() })
          }
          setFolders(derived)
        } else {
          setFolders([])
        }
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('[Vault] list failed:', err instanceof VaultError ? err.code : err)
        setFiles([])
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [view])

  const setView = useCallback((v: VaultView) => {
    setError(null)
    setViewState(v)
  }, [])

  // ── vault.upload() — add files to the current collection (owner = me) ─────
  const addFiles = useCallback(async (
    pending: { file: File; isPublic: boolean; folderName: string | null }[]
  ): Promise<boolean> => {
    try {
      const uploaded: FileItem[] = []

      for (const { file, isPublic, folderName } of pending) {
        const collection = folderName ?? DEFAULT_COLLECTION
        const bytes  = new Uint8Array(await file.arrayBuffer())
        const result = await vault.upload(collection, file.name, bytes)
        if (isPublic) await vault.setPublic(collection, file.name, true)

        uploaded.push({ ...toFileItem(result, file.size), isPublic, role: 'owner' })

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

  // ── vault.setPublic() — toggle file visibility (owner only) ──────────────
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

  // ── Sharing (ADR 016) ────────────────────────────────────────────────────
  const getGrants = useCallback(async (file: FileItem): Promise<Grant[]> => {
    return vault.listGrants(file.folderName ?? DEFAULT_COLLECTION, file.name)
  }, [])

  const shareFile = useCallback(async (file: FileItem, granteeUserId: string, role: GrantRole) => {
    await vault.share(file.folderName ?? DEFAULT_COLLECTION, file.name, granteeUserId, role)
  }, [])

  const unshareFile = useCallback(async (file: FileItem, granteeUserId: string) => {
    await vault.unshare(file.folderName ?? DEFAULT_COLLECTION, file.name, granteeUserId)
  }, [])

  // ── Folders (UI-only — Vault collections are implicit) ───────────────────
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
    view,
    setView,
    files,
    folders,
    totalBytes,
    loading,
    error,
    addFiles,
    deleteFile,
    toggleFileVisibility,
    downloadFile,
    getGrants,
    shareFile,
    unshareFile,
    createFolder,
    renameFolder,
    deleteFolder,
  }
}
