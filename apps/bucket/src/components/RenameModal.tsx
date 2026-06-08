import { useState, useRef, useEffect } from 'react'

type Props = {
  initialName: string
  onConfirm: (name: string) => void
  onClose: () => void
}

export default function RenameModal({ initialName, onConfirm, onClose }: Props) {
  const [name, setName] = useState(initialName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.select()
  }, [])

  const submit = () => {
    const trimmed = name.trim()
    if (trimmed) onConfirm(trimmed)
  }

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 380 }}>
        <div className="modal-header">
          <h2>Rename</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <input
            ref={inputRef}
            className="text-input"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose() }}
            autoFocus
          />
        </div>
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={!name.trim()}>Rename</button>
        </div>
      </div>
    </div>
  )
}
