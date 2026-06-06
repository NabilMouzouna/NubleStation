/* ---------------------------------------------------------------------------
 * ShareModal — share one file with individual users (ADR 016).
 *
 * Lists who the file is currently shared with (revocable), and lets the owner
 * add a person from the app's user list as viewer or editor. People come from
 * identity.listAppUsers() (everyone with access to Bucket); grants come from
 * vault.listGrants() via the store.
 * ------------------------------------------------------------------------- */
import { useEffect, useState } from 'react'
import type { FileItem, Grant, GrantRole } from '../hooks/useVaultStore'
import { identity } from '../hooks/useIdentity'
import type { AppUser } from '@nublestation/identity'

type Props = {
  file: FileItem
  onClose: () => void
  getGrants: (file: FileItem) => Promise<Grant[]>
  onShare: (file: FileItem, granteeUserId: string, role: GrantRole) => Promise<void>
  onUnshare: (file: FileItem, granteeUserId: string) => Promise<void>
}

function label(u: AppUser): string {
  return u.displayName ?? u.email
}

export default function ShareModal({ file, onClose, getGrants, onShare, onUnshare }: Props) {
  const [users, setUsers]   = useState<AppUser[]>([])
  const [grants, setGrants] = useState<Grant[]>([])
  const [selected, setSelected] = useState('')
  const [role, setRole] = useState<GrantRole>('viewer')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = () => getGrants(file).then(setGrants).catch(() => setGrants([]))

  useEffect(() => {
    identity.listAppUsers().then(setUsers).catch(() => setUsers([]))
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id])

  // People not yet granted (and excluding owners — listAppUsers already drops self)
  const grantedIds = new Set(grants.map(g => g.granteeUserId))
  const candidates = users.filter(u => !grantedIds.has(u.id))

  const submitShare = async () => {
    if (!selected) return
    setBusy(true); setError(null)
    try {
      await onShare(file, selected, role)
      setSelected('')
      await refresh()
    } catch {
      setError('Could not share — please retry.')
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (granteeUserId: string) => {
    setBusy(true); setError(null)
    try {
      await onUnshare(file, granteeUserId)
      await refresh()
    } catch {
      setError('Could not revoke — please retry.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 440 }}>
        <div className="modal-header">
          <h2>Share “{file.name}”</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Add people */}
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              className="text-input"
              style={{ flex: 1 }}
              value={selected}
              onChange={e => setSelected(e.target.value)}
            >
              <option value="">Add a person…</option>
              {candidates.map(u => (
                <option key={u.id} value={u.id}>{label(u)} ({u.email})</option>
              ))}
            </select>
            <select
              className="text-input"
              style={{ width: 110 }}
              value={role}
              onChange={e => setRole(e.target.value as GrantRole)}
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <button className="btn-primary" onClick={submitShare} disabled={!selected || busy}>
              Share
            </button>
          </div>

          {error && <div className="storage-warning"><span>{error}</span></div>}

          {/* Current grants */}
          <div>
            <span className="sidebar-section-label">People with access</span>
            {grants.length === 0 ? (
              <p style={{ color: 'var(--text-2)', fontSize: 13, margin: '8px 0 0' }}>
                Only you. Private to your account.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {grants.map(g => {
                  return (
                    <li
                      key={g.granteeUserId}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, background: 'var(--surface-2, rgba(127,127,127,0.08))' }}
                    >
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.granteeName ?? g.granteeEmail}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'capitalize' }}>{g.role}</span>
                      <button className="icon-btn danger" title="Remove access" disabled={busy} onClick={() => revoke(g.granteeUserId)}>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                          <path d="M3 5h10M6 5V3h4v2M5 5l1 8h4l1-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
