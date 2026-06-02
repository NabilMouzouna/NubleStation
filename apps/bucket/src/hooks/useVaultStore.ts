import { useState, useEffect, useCallback } from 'react'
import { createClient, VaultError } from '@nublestation/client'

// ---------------------------------------------------------------------------
// Types — kept compatible with existing UI components
// ---------------------------------------------------------------------------

export type FileItem = {
  id: string
  name: string
  size: number
  type: string
  isPublic: boolean
  createdAt: number
  folderName: string | null  // maps to Vault collection name
  dataUrl: string          // always '' — image preview falls back to type icon
}

export type Folder = {
  id: string      // same as collection name
  name: string
  createdAt: number
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const NUBLE_URL = import.meta.env.VITE_NUBLESTATION_URL as string
const NUBLE_KEY = import.meta.env.VITE_NUBLESTATION_API_KEY as string
const DEFAULT_COLLECTION = 'files'

if (!NUBLE_URL) console.error('[Bucket] VITE_NUBLESTATION_URL is not set')
if (!NUBLE_KEY) console.error('[Bucket] VITE_NUBLESTATION_API_KEY is not set')

const { vault } = createClient({ url: NUBLE_URL, apiKey: NUBLE_KEY })

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useVaultStore() {
  const [files, setFiles]     = useState<FileItem[]>([])
  const [folders, setFolders] = useState<Folder[]>([
    { id: DEFAULT_COLLECTION, name: DEFAULT_COLLECTION, createdAt: Date.now() },
  ])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const totalBytes = files.reduce((s, f) => s + f.size, 0)

  // ── Load all files on mount ──────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    vault.list()
      .then(rows => {
        if (cancelled) return

        const items: FileItem[] = rows.map(r => ({
          id:        r.id,
          name:      r.filename,
          size:      r.sizeBytes ?? 0,
          type:      r.mimeType ?? 'application/octet-stream',
          isPublic:  r.isPublic,
          createdAt: new Date(r.createdAt).getTime(),
          folderName:  r.collection,
          dataUrl:   '',
        }))
        setFiles(items)

        // Derive folders from unique collection names
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
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof VaultError ? err.code : 'Failed to load files')
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [])

  // ── Upload ───────────────────────────────────────────────────────────────

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
        uploaded.push({
          id:        result.id,
          name:      result.filename,
          size:      result.sizeBytes ?? file.size,
          type:      result.mimeType ?? file.type,
          isPublic,
          createdAt: new Date(result.createdAt).getTime(),
          folderName:  collection,
          dataUrl:   '',
        })
        setFolders(prev =>
          prev.some(f => f.id === collection)
            ? prev
            : [...prev, { id: collection, name: collection, parentId: null, createdAt: Date.now() }]
        )
      }
      setFiles(prev => [...prev, ...uploaded])
      return true
    } catch (err) {
      setError(err instanceof VaultError ? err.code : 'Upload failed')
      return false
    }
  }, [])

  // ── Delete file ──────────────────────────────────────────────────────────

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

  const renameFile = useCallback((_id: string, _name: string) => {
    setError('Rename is not supported — delete and re-upload with the new name.')
    setTimeout(() => setError(null), 3000)
  }, [])

  // ── Toggle visibility ────────────────────────────────────────────────────

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

  // ── Download ─────────────────────────────────────────────────────────────

  const downloadFile = useCallback(async (file: FileItem) => {
    try {
      const bytes = await vault.download(file.folderName ?? DEFAULT_COLLECTION, file.name)
      const url   = URL.createObjectURL(new Blob([bytes], { type: file.type }))
      const a     = document.createElement('a')
      a.href = url; a.download = file.name; a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof VaultError ? err.code : 'Download failed')
    }
  }, [])

  // ── Folders (UI-only — Vault collections are flat) ───────────────────────

  const createFolder = useCallback((name: string, _parentId: string | null): string => {
    const id = name.toLowerCase().replace(/\s+/g, '-')
    setFolders(prev =>
      prev.some(f => f.id === id)
        ? prev
        : [...prev, { id, name, parentId: null, createdAt: Date.now() }]
    )
    return id
  }, [])

  const renameFolder = useCallback((id: string, name: string) => {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f))
  }, [])

  const deleteFolder = useCallback(async (id: string) => {
    const toDelete = files.filter(f => f.folderName === id)
    try {
      await Promise.all(toDelete.map(f =>
        vault.delete(f.folderName ?? DEFAULT_COLLECTION, f.name)
      ))
      setFiles(prev => prev.filter(f => f.folderName !== id))
      setFolders(prev => prev.filter(f => f.id !== id))
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
