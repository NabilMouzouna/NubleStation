import { useEffect, useRef } from 'react'

export type ContextMenuItem = {
  label: string
  icon?: React.ReactNode
  danger?: boolean
  onClick: () => void
}

type Props = {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [onClose])

  // Clamp to viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(y, window.innerHeight - 180),
    left: Math.min(x, window.innerWidth - 180),
    zIndex: 200,
  }

  return (
    <div ref={ref} className="ctx-menu" style={style}>
      {items.map((item, i) => (
        <button
          key={i}
          className={`ctx-item${item.danger ? ' ctx-danger' : ''}`}
          onClick={() => { item.onClick(); onClose() }}
        >
          {item.icon && <span className="ctx-icon">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>
  )
}
