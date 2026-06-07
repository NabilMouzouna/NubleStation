import { useState, useCallback } from 'react'
import type { FileItem, Folder, VaultView } from '../hooks/useVaultStore'
import ContextMenu from './ContextMenu'
import type { ContextMenuItem } from './ContextMenu'

type Props = {
  files: FileItem[]
  folders: Folder[]
  currentFolderId: string | null
  searchQuery: string
  view: VaultView
  onNavigate: (id: string | null) => void
  onDownload: (file: FileItem) => void
  onPreviewFile: (file: FileItem) => void
  onToggleVisibility: (id: string) => void
  onDeleteFile: (id: string) => void
  onRenameFolder: (id: string) => void
  onDeleteFolder: (id: string) => void
  onShare: (id: string) => void
  onUpload: () => void
}

// Capability helpers driven by the caller's role on each file (ADR 016).
const canEdit  = (f: FileItem) => f.role === 'owner' || f.role === 'editor'
const canShare = (f: FileItem) => f.role === 'owner'

type CtxTarget = { id: string; type: 'file' | 'folder'; x: number; y: number }

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function getFileCategory(mime: string): 'image' | 'video' | 'audio' | 'doc' | 'pdf' | 'archive' | 'code' | 'other' {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.includes('zip') || mime.includes('tar') || mime.includes('gz') || mime.includes('rar') || mime.includes('7z')) return 'archive'
  if (mime.includes('text/') || mime.includes('javascript') || mime.includes('json') || mime.includes('xml') || mime.includes('html')) return 'code'
  if (mime.includes('word') || mime.includes('spreadsheet') || mime.includes('presentation') || mime.includes('text/plain')) return 'doc'
  return 'other'
}

function FileTypeIcon({ mime, dataUrl }: { mime: string; dataUrl: string }) {
  const cat = getFileCategory(mime)

  if (cat === 'image' && dataUrl) {
    return (
      <div className="file-thumb">
        <img src={dataUrl} alt="" />
      </div>
    )
  }

  const icons: Record<string, React.ReactNode> = {
    image: (
      <svg viewBox="0 0 40 40" fill="none" className="file-icon-svg" style={{ color: '#60a5fa' }}>
        <rect width="40" height="40" rx="8" fill="currentColor" opacity="0.12"/>
        <rect x="8" y="10" width="24" height="20" rx="3" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="14" cy="17" r="2" fill="currentColor"/>
        <path d="M8 26l7-6 5 5 3-3 9 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    video: (
      <svg viewBox="0 0 40 40" fill="none" className="file-icon-svg" style={{ color: '#f97316' }}>
        <rect width="40" height="40" rx="8" fill="currentColor" opacity="0.12"/>
        <rect x="6" y="11" width="20" height="18" rx="3" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M26 16l8-4v16l-8-4V16z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
    audio: (
      <svg viewBox="0 0 40 40" fill="none" className="file-icon-svg" style={{ color: '#a78bfa' }}>
        <rect width="40" height="40" rx="8" fill="currentColor" opacity="0.12"/>
        <circle cx="20" cy="20" r="10" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="20" cy="20" r="3" fill="currentColor"/>
        <path d="M20 10v4M20 26v4M10 20h4M26 20h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    pdf: (
      <svg viewBox="0 0 40 40" fill="none" className="file-icon-svg" style={{ color: '#ef4444' }}>
        <rect width="40" height="40" rx="8" fill="currentColor" opacity="0.12"/>
        <path d="M12 6h11l9 9v19a2 2 0 01-2 2H12a2 2 0 01-2-2V8a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M23 6v9h9" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <text x="12" y="32" fontSize="8" fontWeight="700" fill="currentColor" fontFamily="monospace">PDF</text>
      </svg>
    ),
    archive: (
      <svg viewBox="0 0 40 40" fill="none" className="file-icon-svg" style={{ color: '#f59e0b' }}>
        <rect width="40" height="40" rx="8" fill="currentColor" opacity="0.12"/>
        <rect x="10" y="8" width="20" height="24" rx="2" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M17 8v24M17 13h6M17 18h6M17 23h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    code: (
      <svg viewBox="0 0 40 40" fill="none" className="file-icon-svg" style={{ color: '#34d399' }}>
        <rect width="40" height="40" rx="8" fill="currentColor" opacity="0.12"/>
        <path d="M14 16l-6 4 6 4M26 16l6 4-6 4M22 12l-4 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    doc: (
      <svg viewBox="0 0 40 40" fill="none" className="file-icon-svg" style={{ color: '#3b82f6' }}>
        <rect width="40" height="40" rx="8" fill="currentColor" opacity="0.12"/>
        <path d="M12 6h11l9 9v19a2 2 0 01-2 2H12a2 2 0 01-2-2V8a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M23 6v9h9" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M14 22h12M14 26h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    other: (
      <svg viewBox="0 0 40 40" fill="none" className="file-icon-svg" style={{ color: 'var(--text)' }}>
        <rect width="40" height="40" rx="8" fill="currentColor" opacity="0.08"/>
        <path d="M12 6h11l9 9v19a2 2 0 01-2 2H12a2 2 0 01-2-2V8a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M23 6v9h9" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
  }

  return <div className="file-icon-wrap">{icons[cat]}</div>
}

function VisibilityBadge({ isPublic, onToggle }: { isPublic: boolean; onToggle: () => void }) {
  return (
    <button
      className={`vis-badge${isPublic ? ' public' : ''}`}
      onClick={e => { e.stopPropagation(); onToggle() }}
      title={isPublic ? 'Public — click to make private' : 'Private — click to make public'}
    >
      {isPublic ? (
        <>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M8 2C8 2 6 5 6 8s2 6 2 6M8 2c0 0 2 3 2 6s-2 6-2 6M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Public
        </>
      ) : (
        <>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <rect x="3" y="7" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Private
        </>
      )}
    </button>
  )
}

function RoleBadge({ file, view }: { file: FileItem; view: VaultView }) {
  // What to show when the caller is NOT the owner: their grant role, or "Public".
  const text = view === 'public'
    ? 'Public'
    : file.role === 'editor' ? 'Can edit'
    : file.role === 'viewer' ? 'View only'
    : file.isPublic ? 'Public' : 'Shared'
  return <span className="vis-badge" style={{ cursor: 'default' }} title="Your access to this file">{text}</span>
}

export default function FileGrid({
  files,
  folders,
  currentFolderId,
  searchQuery,
  view,
  onNavigate,
  onDownload,
  onPreviewFile,
  onToggleVisibility,
  onDeleteFile,
  onRenameFolder,
  onDeleteFolder,
  onShare,
  onUpload,
}: Props) {
  const [ctx, setCtx] = useState<CtxTarget | null>(null)
  const [draggingOver, setDraggingOver] = useState(false)

  const showCtx = useCallback((e: React.MouseEvent, id: string, type: 'file' | 'folder') => {
    e.preventDefault()
    setCtx({ id, type, x: e.clientX, y: e.clientY })
  }, [])

  // Collections are flat: show all collections as folders only at the root view
  const subfolders = currentFolderId === null
    ? folders.filter(f => !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : []

  const currentFiles = files.filter(f =>
    (currentFolderId === null || f.folderName === currentFolderId) &&
    (searchQuery ? f.name.toLowerCase().includes(searchQuery.toLowerCase()) : true)
  )
  const isEmpty = subfolders.length === 0 && currentFiles.length === 0

  const ctxFile = ctx?.type === 'file' ? files.find(x => x.id === ctx.id) : undefined

  const ctxItems: ContextMenuItem[] = ctx
    ? ctx.type === 'file'
      ? [
          {
            label: 'Download',
            icon: <DownloadIcon />,
            onClick: () => { if (ctxFile) onDownload(ctxFile) },
          },
          ...(ctxFile && canShare(ctxFile) ? [{
            label: 'Share',
            icon: <ShareIcon />,
            onClick: () => onShare(ctx.id),
          }] : []),
          ...(ctxFile && canShare(ctxFile) ? [{
            label: ctxFile.isPublic ? 'Make Private' : 'Make Public',
            icon: <GlobeIcon />,
            onClick: () => onToggleVisibility(ctx.id),
          }] : []),
          ...(ctxFile && canEdit(ctxFile) ? [{
            label: 'Delete',
            icon: <TrashIcon />,
            danger: true,
            onClick: () => onDeleteFile(ctx.id),
          }] : []),
        ]
      : [
          {
            label: 'Open',
            icon: <FolderOpenIcon />,
            onClick: () => onNavigate(ctx.id),
          },
          {
            label: 'Rename',
            icon: <PencilIcon />,
            onClick: () => onRenameFolder(ctx.id),
          },
          {
            label: 'Delete',
            icon: <TrashIcon />,
            danger: true,
            onClick: () => onDeleteFolder(ctx.id),
          },
        ]
    : []

  return (
    <div
      className={`file-grid-area${draggingOver ? ' drag-over' : ''}`}
      data-tutorial="file-grid"
      onDragOver={e => { e.preventDefault(); setDraggingOver(true) }}
      onDragLeave={() => setDraggingOver(false)}
      onDrop={e => { e.preventDefault(); setDraggingOver(false); onUpload() }}
    >
      {isEmpty ? (
        <div className="empty-state">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ opacity: 0.3 }}>
            <rect x="4" y="12" width="40" height="32" rx="4" stroke="var(--text-h)" strokeWidth="2"/>
            <path d="M4 20h40" stroke="var(--text-h)" strokeWidth="2"/>
            <path d="M4 16a4 4 0 014-4h8l4 4" stroke="var(--text-h)" strokeWidth="2" strokeLinejoin="round"/>
            <path d="M24 30v-8M20 26l4-4 4 4" stroke="var(--text-h)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <p>{searchQuery ? 'No results for "' + searchQuery + '"' : 'Drop files here or click Upload'}</p>
          {!searchQuery && (
            <button className="btn-primary" onClick={onUpload}>Upload Files</button>
          )}
        </div>
      ) : (
        <div className="file-grid">
          {/* Folders first */}
          {subfolders.map(folder => (
            <div
              key={folder.id}
              className="file-card folder-card"
              onDoubleClick={() => onNavigate(folder.id)}
              onContextMenu={e => showCtx(e, folder.id, 'folder')}
              title="Double-click to open"
            >
              <div className="file-card-icon">
                <svg viewBox="0 0 40 40" fill="none" className="file-icon-svg" style={{ color: '#f59e0b' }}>
                  <rect width="40" height="40" rx="8" fill="currentColor" opacity="0.12"/>
                  <path d="M6 14a2 2 0 012-2h9.172a2 2 0 011.414.586L20 14h12a2 2 0 012 2V30a2 2 0 01-2 2H8a2 2 0 01-2-2V14z" fill="currentColor" opacity="0.9"/>
                </svg>
              </div>
              <div className="file-card-meta">
                <span className="file-card-name" title={folder.name}>{folder.name}</span>
                <span className="file-card-info">{formatDate(folder.createdAt)}</span>
              </div>
              <div className="file-card-actions">
                <button
                  className="icon-btn"
                  title="Rename"
                  onClick={e => { e.stopPropagation(); onRenameFolder(folder.id) }}
                >
                  <PencilIcon />
                </button>
                <button
                  className="icon-btn danger"
                  title="Delete"
                  onClick={e => { e.stopPropagation(); onDeleteFolder(folder.id) }}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}

          {/* Files */}
          {currentFiles.map(file => (
            <div
              key={file.id}
              className="file-card"
              onDoubleClick={() => onPreviewFile(file)}
              onContextMenu={e => showCtx(e, file.id, 'file')}
              title="Double-click to preview"
            >
              <div className="file-card-icon">
                <FileTypeIcon mime={file.type} dataUrl={file.dataUrl} />
              </div>
              <div className="file-card-meta">
                <span className="file-card-name" title={file.name}>{file.name}</span>
                <span className="file-card-info">
                  {formatBytes(file.size)} · {formatDate(file.createdAt)}
                </span>
              </div>
              <div className="file-card-footer">
                {canShare(file)
                  ? <VisibilityBadge isPublic={file.isPublic} onToggle={() => onToggleVisibility(file.id)} />
                  : <RoleBadge file={file} view={view} />}
                <div className="file-card-actions">
                  <button
                    className="icon-btn"
                    title="Download"
                    onClick={e => { e.stopPropagation(); onDownload(file) }}
                  >
                    <DownloadIcon />
                  </button>
                  {canShare(file) && (
                    <button
                      className="icon-btn"
                      title="Share"
                      onClick={e => { e.stopPropagation(); onShare(file.id) }}
                    >
                      <ShareIcon />
                    </button>
                  )}
                  {canEdit(file) && (
                    <button
                      className="icon-btn danger"
                      title="Delete"
                      onClick={e => { e.stopPropagation(); onDeleteFile(file.id) }}
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          items={ctxItems}
          onClose={() => setCtx(null)}
        />
      )}

      {draggingOver && (
        <div className="drop-overlay">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ color: 'var(--accent)' }}>
            <path d="M20 25V10M13 17l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M6 30v3a2 2 0 002 2h24a2 2 0 002-2v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <p>Drop to upload</p>
        </div>
      )}
    </div>
  )
}

function DownloadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M8 3v8M5 8l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2 13v1a1 1 0 001 1h10a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M11 2l3 3-9 9H2v-3L11 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M3 5h10M6 5V3h4v2M5 5l1 8h4l1-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <circle cx="12" cy="3.5" r="2" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="4" cy="8" r="2" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="12" cy="12.5" r="2" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M10.2 4.6L5.8 7M5.8 9l4.4 2.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8 2C8 2 6 5 6 8s2 6 2 6M8 2c0 0 2 3 2 6s-2 6-2 6M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function FolderOpenIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M1 5a1 1 0 011-1h4l1.5 1.5H14a1 1 0 011 1V12a1 1 0 01-1 1H2a1 1 0 01-1-1V5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M1 8h14" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  )
}
