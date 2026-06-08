import { useState } from 'react'
import type { Folder } from '../hooks/useVaultStore'

type Props = {
  folders: Folder[]
  currentFolderId: string | null
  onNavigate: (id: string | null) => void
  onCreateFolder: () => void
  totalBytes: number
  onRenameFolder: (id: string) => void
  onDeleteFolder: (id: string) => void
}

const MAX_BYTES = 50 * 1024 * 1024

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}


export default function Sidebar({
  folders,
  currentFolderId,
  onNavigate,
  onCreateFolder,
  totalBytes,
  onRenameFolder,
  onDeleteFolder,
}: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const pct = Math.min((totalBytes / MAX_BYTES) * 100, 100)

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`} data-tutorial="sidebar">
      {/* Header row: label + collapse toggle */}
      <div className="sidebar-header">
        {!collapsed && <span className="sidebar-section-label">Storage</span>}
        <button
          className="sidebar-collapse-btn"
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronIcon flipped={collapsed} />
        </button>
      </div>

      {/* Content hidden when collapsed */}
      <div className="sidebar-content">
        <nav className="sidebar-nav">
          <button
            className={`sidebar-folder${!currentFolderId ? ' active' : ''}`}
            style={{ paddingLeft: 12 }}
            onClick={() => onNavigate(null)}
          >
            <HomeIcon active={!currentFolderId} />
            <span className="sidebar-folder-name">All Files</span>
          </button>

          {/* Collections are flat — no nesting */}
          {folders.map(f => {
            const isActive = currentFolderId === f.id
            return (
              <div
                key={f.id}
                className={`sidebar-folder${isActive ? ' active' : ''}`}
                style={{ paddingLeft: 24 }}
                onClick={() => onNavigate(f.id)}
              >
                <FolderIcon active={isActive} />
                <span className="sidebar-folder-name">{f.name}</span>
                <span className="sidebar-folder-actions" onClick={e => e.stopPropagation()}>
                  <button title="Rename" onClick={() => onRenameFolder(f.id)}>
                    <PencilIcon />
                  </button>
                  <button title="Delete" onClick={() => onDeleteFolder(f.id)}>
                    <TrashIcon />
                  </button>
                </span>
              </div>
            )
          })}
        </nav>

        <button
          className="sidebar-new-folder"
          onClick={onCreateFolder}
          data-tutorial="new-folder-btn"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          New Folder
        </button>

        <div className="sidebar-storage">
          <div className="storage-bar-track">
            <div
              className="storage-bar-fill"
              style={{ width: `${pct}%`, background: pct > 80 ? '#ef4444' : 'var(--accent)' }}
            />
          </div>
          <div className="storage-label">
            <span>{formatBytes(totalBytes)}</span>
            <span>{formatBytes(MAX_BYTES)}</span>
          </div>
        </div>
      </div>
    </aside>
  )
}

function ChevronIcon({ flipped }: { flipped: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 16 16" fill="none"
      style={{ transition: 'transform 0.25s ease', transform: flipped ? 'rotate(180deg)' : 'none' }}
    >
      <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function FolderIcon({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M1 4a1 1 0 011-1h4.586a1 1 0 01.707.293L8.414 4.5H14a1 1 0 011 1V13a1 1 0 01-1 1H2a1 1 0 01-1-1V4z"
        fill={active ? 'var(--accent)' : 'var(--text)'}
        opacity={active ? 1 : 0.5}
      />
    </svg>
  )
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M2 6.5L8 2l6 4.5V14a1 1 0 01-1 1H3a1 1 0 01-1-1V6.5z"
        fill={active ? 'var(--accent)' : 'var(--text)'}
        opacity={active ? 1 : 0.5}
      />
      <path d="M6 15v-5h4v5" stroke="var(--bg)" strokeWidth="1.2"/>
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <path d="M11 2l3 3-9 9H2v-3L11 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <path d="M3 5h10M6 5V3h4v2M5 5l1 8h4l1-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
