/* ---------------------------------------------------------------------------
 * PreviewModal — opens an in-app preview of a file (double-click a file card).
 *
 * Fetches the file's bytes through the Vault SDK (via the store's getPreviewUrl)
 * and renders inline based on MIME type: images, video, audio, PDF, and text.
 * Anything else falls back to a download prompt. The object URL is revoked on
 * close so we don't leak blobs.
 * ------------------------------------------------------------------------- */
import { useEffect, useState } from 'react'
import type { FileItem } from '../hooks/useVaultStore'

type Props = {
  file: FileItem
  getPreviewUrl: (file: FileItem) => Promise<string>
  onDownload: (file: FileItem) => void
  onClose: () => void
}

type Kind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'other'

function kindOf(mime: string, name: string): Kind {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'application/pdf') return 'pdf'
  if (
    mime.startsWith('text/') ||
    /^application\/(json|xml|javascript|x-sh|x-yaml)/.test(mime) ||
    /\.(txt|md|json|csv|log|ya?ml|xml|js|ts|tsx|jsx|css|html?|sh)$/i.test(name)
  ) return 'text'
  return 'other'
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

export default function PreviewModal({ file, getPreviewUrl, onDownload, onClose }: Props) {
  const kind = kindOf(file.type, file.name)
  const [url, setUrl] = useState<string | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false

    // 'other' types never fetch — we just offer a download.
    if (kind === 'other') { setLoading(false); return }

    ;(async () => {
      try {
        objectUrl = await getPreviewUrl(file)
        if (cancelled) return
        if (kind === 'text') {
          const res = await fetch(objectUrl)
          const body = await res.text()
          if (!cancelled) setText(body)
        }
        if (!cancelled) setUrl(objectUrl)
      } catch {
        if (!cancelled) setError('Could not load this file for preview.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file, kind, getPreviewUrl])

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal preview-modal">
        <div className="modal-header">
          <h2 title={file.name}>{file.name}</h2>
          <button className="modal-close" onClick={onClose} title="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="modal-body preview-body">
          {loading && <div className="preview-status">Loading preview…</div>}

          {!loading && error && <div className="preview-status">{error}</div>}

          {!loading && !error && kind === 'image' && url && (
            <img className="preview-media" src={url} alt={file.name} />
          )}
          {!loading && !error && kind === 'video' && url && (
            <video className="preview-media" src={url} controls autoPlay />
          )}
          {!loading && !error && kind === 'audio' && url && (
            <audio className="preview-audio" src={url} controls autoPlay />
          )}
          {!loading && !error && kind === 'pdf' && url && (
            <iframe className="preview-frame" src={url} title={file.name} />
          )}
          {!loading && !error && kind === 'text' && text !== null && (
            <pre className="preview-text">{text}</pre>
          )}
          {!loading && kind === 'other' && (
            <div className="preview-status">
              <p>No inline preview for this file type ({file.type || 'unknown'}).</p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <span className="preview-meta">{file.type || 'unknown'} · {formatBytes(file.size)}</span>
          <button className="btn-primary" onClick={() => onDownload(file)}>Download</button>
        </div>
      </div>
    </div>
  )
}
