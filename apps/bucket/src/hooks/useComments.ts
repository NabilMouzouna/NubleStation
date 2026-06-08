import { useState, useEffect, useCallback } from 'react'
import { nuble } from '../lib/blaze'
import type { AuthSession } from '../components/AuthGate'

export type Comment = {
  id: string
  file_id: string
  body: string
  author_id: string
  author_name: string
  app_id: string
}

export function useComments(fileId: string, session: AuthSession) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // M5 auto-REST returns all rows for the app; filter client-side by file_id.
      const all = await nuble.db.file_comments.list({ limit: 200 })
      setComments((all as Comment[]).filter(c => c.file_id === fileId))
    } catch (e) {
      setError('Could not load comments')
      console.error('[useComments] load:', e)
    } finally {
      setLoading(false)
    }
  }, [fileId])

  useEffect(() => { void load() }, [load])

  const add = useCallback(async (body: string) => {
    const created = await nuble.db.file_comments.create({
      file_id:     fileId,
      body,
      author_id:   session.user.id,
      author_name: session.user.displayName ?? session.user.email,
    })
    setComments(prev => [...prev, created as Comment])
  }, [fileId, session])

  const edit = useCallback(async (id: string, body: string) => {
    const updated = await nuble.db.file_comments.update(id, { body })
    setComments(prev => prev.map(c => c.id === id ? { ...c, ...(updated as Comment) } : c))
  }, [])

  const remove = useCallback(async (id: string) => {
    await nuble.db.file_comments.delete(id)
    setComments(prev => prev.filter(c => c.id !== id))
  }, [])

  return { comments, loading, error, add, edit, remove }
}
