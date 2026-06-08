/* ---------------------------------------------------------------------------
 * PreviewModal — file preview with inline comment thread (Blaze-backed).
 * ------------------------------------------------------------------------- */
import { useEffect, useRef, useState } from 'react'
import type { FileItem } from '../hooks/useVaultStore'
import { useComments } from '../hooks/useComments'
import type { Comment } from '../hooks/useComments'
import type { AuthSession } from './AuthGate'

type Props = {
  file: FileItem
  session: AuthSession
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

// ── Comment panel ──────────────────────────────────────────────────────────

function CommentItem({
  comment,
  isMine,
  onEdit,
  onDelete,
}: {
  comment: Comment
  isMine: boolean
  onEdit: (id: string, body: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const [busy, setBusy] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function startEdit() {
    setDraft(comment.body)
    setEditing(true)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  async function save() {
    if (!draft.trim() || draft === comment.body) { setEditing(false); return }
    setBusy(true)
    try { await onEdit(comment.id, draft.trim()) } finally { setBusy(false); setEditing(false) }
  }

  async function del() {
    setBusy(true)
    try { await onDelete(comment.id) } finally { setBusy(false) }
  }

  return (
    <div className="comment-item">
      <div className="comment-meta">
        <span className="comment-author">{comment.author_name}</span>
        {isMine && !editing && (
          <div className="comment-actions">
            <button className="comment-action-btn" onClick={startEdit} title="Edit">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
            </button>
            <button className="comment-action-btn comment-delete-btn" onClick={del} disabled={busy} title="Delete">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        )}
      </div>
      {editing ? (
        <div className="comment-edit">
          <textarea
            ref={textareaRef}
            className="comment-textarea"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={3}
            onKeyDown={e => { if (e.key === 'Escape') setEditing(false) }}
          />
          <div className="comment-edit-actions">
            <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={save} disabled={busy || !draft.trim()}>Save</button>
          </div>
        </div>
      ) : (
        <p className="comment-body">{comment.body}</p>
      )}
    </div>
  )
}

function CommentsPanel({
  fileId,
  session,
}: {
  fileId: string
  session: AuthSession
}) {
  const { comments, loading, error, add, edit, remove } = useComments(fileId, session)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  async function submit() {
    if (!draft.trim()) return
    setPosting(true)
    try {
      await add(draft.trim())
      setDraft('')
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="comments-panel">
      <div className="comments-header">Comments</div>

      <div className="comments-list">
        {loading && <p className="comments-empty">Loading…</p>}
        {!loading && error && <p className="comments-empty" style={{ color: 'var(--danger, #e53e3e)' }}>{error}</p>}
        {!loading && !error && comments.length === 0 && (
          <p className="comments-empty">No comments yet. Be the first.</p>
        )}
        {!loading && !error && comments.map(c => (
          <CommentItem
            key={c.id}
            comment={c}
            isMine={c.author_id === session.user.id}
            onEdit={edit}
            onDelete={remove}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="comments-compose">
        <textarea
          className="comment-textarea"
          placeholder="Add a comment…"
          value={draft}
          rows={2}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit() }}
        />
        <button
          className="btn-primary"
          style={{ alignSelf: 'flex-end', fontSize: 12, padding: '5px 12px' }}
          onClick={submit}
          disabled={posting || !draft.trim()}
        >
          {posting ? 'Posting…' : 'Post'}
        </button>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function PreviewModal({ file, session, getPreviewUrl, onDownload, onClose }: Props) {
  const kind = kindOf(file.type, file.name)
  const [url, setUrl] = useState<string | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false

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

        <div className="preview-split">
          {/* ── File preview (left) ── */}
          <div className="preview-body">
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

          {/* ── Comments (right) ── */}
          <CommentsPanel fileId={file.id} session={session} />
        </div>

        <div className="modal-footer">
          <span className="preview-meta">{file.type || 'unknown'} · {formatBytes(file.size)}</span>
          <button className="btn-primary" onClick={() => onDownload(file)}>Download</button>
        </div>
      </div>
    </div>
  )
}
