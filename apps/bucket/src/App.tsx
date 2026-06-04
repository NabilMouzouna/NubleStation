import { useState, useCallback } from 'react'
import { useVaultStore } from './hooks/useVaultStore'
import type { FileItem, Folder } from './hooks/useVaultStore'
import Sidebar from './components/Sidebar'
import FileGrid from './components/FileGrid'
import UploadModal from './components/UploadModal'
import RenameModal from './components/RenameModal'
import Tutorial from './components/Tutorial'
import './App.css'

type RenameTarget = { id: string; name: string; type: 'file' | 'folder' }

// Collections are flat — breadcrumb is at most one level deep
function getBreadcrumb(folderId: string | null, folders: Folder[]): Folder[] {
  if (!folderId) return []
  const folder = folders.find(f => f.id === folderId)
  return folder ? [folder] : []
}

export default function App() {
  const store = useVaultStore()
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null)

  const breadcrumb = getBreadcrumb(currentFolderId, store.folders)

  const handleUpload = useCallback(async (pending: { file: File; isPublic: boolean }[]) => {
    const items = pending.map(({ file, isPublic }) => ({ file, isPublic, folderName: currentFolderId }))
    await store.addFiles(items)
    setShowUpload(false)
  }, [store, currentFolderId])

  const handleRename = useCallback((newName: string) => {
    if (!renameTarget) return
    if (renameTarget.type === 'file') store.renameFile(renameTarget.id, newName)
    else store.renameFolder(renameTarget.id, newName)
    setRenameTarget(null)
  }, [renameTarget, store])

  const handleDownload = useCallback((file: FileItem) => {
    store.downloadFile(file)
  }, [store])

  const handleCreateFolder = useCallback(() => {
    const name = window.prompt('Folder name:')
    if (name?.trim()) store.createFolder(name.trim(), currentFolderId)
  }, [store, currentFolderId])

  const handleDeleteFolder = useCallback((id: string) => {
    const folder = store.folders.find(f => f.id === id)
    const hasChildren = store.files.some(f => f.folderName === id)
    if (hasChildren && !window.confirm(`Delete "${folder?.name}" and all its contents?`)) return
    store.deleteFolder(id)
    if (currentFolderId === id) setCurrentFolderId(null)
  }, [store, currentFolderId])

  const startRenameFile = useCallback((id: string) => {
    const f = store.files.find(x => x.id === id)
    if (f) setRenameTarget({ id, name: f.name, type: 'file' })
  }, [store.files])

  const startRenameFolder = useCallback((id: string) => {
    const f = store.folders.find(x => x.id === id)
    if (f) setRenameTarget({ id, name: f.name, type: 'folder' })
  }, [store.folders])

  if (store.loading) {
    return (
      <div className="vault-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p style={{ color: 'var(--text-2)' }}>Loading files…</p>
      </div>
    )
  }

  return (
    <div className="vault-app">
      <header className="vault-header">
        <div className="vault-brand">
          <img src="/vault.svg" width={26} height={26} alt="" />
          <span className="vault-brand-name">Vault</span>
          <span className="vault-brand-sub">NubleStation</span>
        </div>
        <div className="vault-search">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            type="search"
            placeholder="Search files and folders…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </header>

      <div className="vault-body">
        <Sidebar
          folders={store.folders}
          currentFolderId={currentFolderId}
          onNavigate={setCurrentFolderId}
          onCreateFolder={handleCreateFolder}
          totalBytes={store.totalBytes}
          onRenameFolder={startRenameFolder}
          onDeleteFolder={handleDeleteFolder}
        />

        <main className="vault-main">
          <div className="vault-toolbar">
            <nav className="vault-breadcrumb">
              <button
                className={!currentFolderId ? 'active' : ''}
                onClick={() => setCurrentFolderId(null)}
              >
                My Vault
              </button>
              {breadcrumb.map((f, i) => (
                <span key={f.id} style={{ display: 'flex', alignItems: 'center' }}>
                  <span className="breadcrumb-sep">/</span>
                  <button
                    className={i === breadcrumb.length - 1 ? 'active' : ''}
                    onClick={() => setCurrentFolderId(f.id)}
                  >
                    {f.name}
                  </button>
                </span>
              ))}
            </nav>
            <div className="vault-actions">
              <button className="btn-ghost" onClick={handleCreateFolder}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M1 4a1 1 0 011-1h4.586a1 1 0 01.707.293L8.414 4.5H14a1 1 0 011 1V13a1 1 0 01-1 1H2a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                  <path d="M8 8v4M6 10h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                New Folder
              </button>
              <button className="btn-primary" onClick={() => setShowUpload(true)} data-tutorial="upload-btn">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M8 10V3M5 6l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Upload
              </button>
            </div>
          </div>

          {store.error && (
            <div className="storage-warning">
              <span>{store.error}</span>
            </div>
          )}

          <FileGrid
            files={store.files}
            folders={store.folders}
            currentFolderId={currentFolderId}
            searchQuery={searchQuery}
            onNavigate={setCurrentFolderId}
            onDownload={handleDownload}
            onToggleVisibility={store.toggleFileVisibility}
            onDeleteFile={store.deleteFile}
            onRenameFile={startRenameFile}
            onRenameFolder={startRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            onUpload={() => setShowUpload(true)}
          />
        </main>
      </div>

      {showUpload && (
        <UploadModal onConfirm={handleUpload} onClose={() => setShowUpload(false)} />
      )}

      <Tutorial />

      {renameTarget && (
        <RenameModal
          initialName={renameTarget.name}
          onConfirm={handleRename}
          onClose={() => setRenameTarget(null)}
        />
      )}
    </div>
  )
}
