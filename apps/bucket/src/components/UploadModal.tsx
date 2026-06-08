import { useState, useRef, useCallback } from 'react'

type PendingFile = { file: File; isPublic: boolean }

type Props = {
  onConfirm: (files: PendingFile[]) => void
  onClose: () => void
}

export default function UploadModal({ onConfirm, onClose }: Props) {
  const [pending, setPending] = useState<PendingFile[]>([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return
    const arr = Array.from(fileList)
    setPending(prev => [
      ...prev,
      ...arr
        .filter(f => !prev.some(p => p.file.name === f.name && p.file.size === f.size))
        .map(f => ({ file: f, isPublic: false })),
    ])
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }, [addFiles])

  const toggle = (i: number) => {
    setPending(prev => prev.map((p, j) => j === i ? { ...p, isPublic: !p.isPublic } : p))
  }

  const remove = (i: number) => {
    setPending(prev => prev.filter((_, j) => j !== i))
  }

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-header">
          <h2>Upload Files</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Drop zone */}
          <div
            className={`drop-zone${dragging ? ' dragging' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ color: 'var(--accent)' }}>
              <rect width="32" height="32" rx="8" fill="var(--accent-bg)"/>
              <path d="M16 20V12M12 16l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M9 22v1a1 1 0 001 1h12a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-h)' }}>
              Drop files here or <span style={{ color: 'var(--accent)', fontWeight: 500 }}>browse</span>
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text)' }}>Any file type accepted</p>
            <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={e => addFiles(e.target.files)} />
          </div>

          {/* File list */}
          {pending.length > 0 && (
            <div className="upload-list">
              {pending.map((p, i) => (
                <div key={i} className="upload-item">
                  <span className="upload-name" title={p.file.name}>{p.file.name}</span>
                  <span className="upload-size">{formatBytes(p.file.size)}</span>
                  <button
                    className={`vis-badge${p.isPublic ? ' public' : ''}`}
                    onClick={() => toggle(i)}
                    title="Toggle visibility"
                  >
                    {p.isPublic ? (
                      <><GlobeIcon /> Public</>
                    ) : (
                      <><LockIcon /> Private</>
                    )}
                  </button>
                  <button className="upload-remove" onClick={() => remove(i)} title="Remove">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            disabled={pending.length === 0}
            onClick={() => onConfirm(pending)}
          >
            Upload {pending.length > 0 ? `${pending.length} file${pending.length > 1 ? 's' : ''}` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="7" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8 2C8 2 6 5 6 8s2 6 2 6M8 2c0 0 2 3 2 6s-2 6-2 6M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}
