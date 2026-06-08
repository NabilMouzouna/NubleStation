import { useState, useLayoutEffect, useEffect, useCallback } from 'react'

type Step = {
  target: string | null
  title: string
  body: string
  placement: 'right' | 'bottom' | 'center'
}

const STEPS: Step[] = [
  {
    target: null,
    title: 'Welcome to Vault',
    body: "Your private file storage, powered by NubleStation. Let's take a quick tour — it'll only take 30 seconds.",
    placement: 'center',
  },
  {
    target: 'sidebar',
    title: 'Folder Tree',
    body: 'All your folders live here. Click any folder to navigate into it. Hover a folder to reveal rename and delete actions.',
    placement: 'right',
  },
  {
    target: 'new-folder-btn',
    title: 'Create Folders',
    body: 'Click here to create a new folder. Folders can be nested inside each other.',
    placement: 'right',
  },
  {
    target: 'upload-btn',
    title: 'Upload Files',
    body: 'Upload any file type by clicking here or dragging files straight onto the grid. You choose Public or Private per file before confirming.',
    placement: 'bottom',
  },
  {
    target: 'file-grid',
    title: 'Your Files',
    body: 'Double-click a folder to open it. Right-click any file or folder for options like rename, delete, download, and visibility toggle.',
    placement: 'center',
  },
]

const TOUR_KEY = 'vault_tour_done'
const PAD = 10
const CARD_W = 300
const CARD_H = 200  // safe estimate for clamping
const MARGIN = 12

type Rect = { top: number; left: number; width: number; height: number }

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function computeCardPos(
  placement: Step['placement'],
  spotRect: Rect | null
): { top: number | string; left: number | string; transform?: string } {
  const vw = window.innerWidth
  const vh = window.innerHeight

  if (!spotRect || placement === 'center') {
    return { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }
  }

  if (placement === 'right') {
    const rawTop = spotRect.top + PAD + spotRect.height / 2 - CARD_H / 2
    const rawLeft = spotRect.left + spotRect.width + PAD + 16
    return {
      top: clamp(rawTop, MARGIN, vh - CARD_H - MARGIN),
      left: clamp(rawLeft, MARGIN, vw - CARD_W - MARGIN),
    }
  }

  // bottom — right-align card to button's right edge, then clamp into viewport
  const rawLeft = spotRect.left + spotRect.width + PAD - CARD_W
  const rawTop = spotRect.top + spotRect.height + PAD + 16

  // If card would overflow the bottom, flip it above the target
  const top = rawTop + CARD_H > vh - MARGIN
    ? spotRect.top - PAD - 16 - CARD_H
    : rawTop

  return {
    top: clamp(top, MARGIN, vh - CARD_H - MARGIN),
    left: clamp(rawLeft, MARGIN, vw - CARD_W - MARGIN),
  }
}

export default function Tutorial() {
  const [hidden, setHidden] = useState(() => !!localStorage.getItem(TOUR_KEY))
  const [step, setStep] = useState(0)
  const [spotRect, setSpotRect] = useState<Rect | null>(null)
  const [fading, setFading] = useState(false)

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  const measureTarget = useCallback(() => {
    if (!current.target) { setSpotRect(null); return }
    const el = document.querySelector(`[data-tutorial="${current.target}"]`)
    if (el) {
      const r = el.getBoundingClientRect()
      setSpotRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
  }, [current.target])

  useLayoutEffect(() => {
    if (hidden) return
    measureTarget()
  }, [step, hidden, measureTarget])

  useEffect(() => {
    if (hidden) return
    window.addEventListener('resize', measureTarget)
    return () => window.removeEventListener('resize', measureTarget)
  }, [hidden, measureTarget])

  const go = useCallback((next: number | 'done') => {
    setFading(true)
    setTimeout(() => {
      if (next === 'done') {
        localStorage.setItem(TOUR_KEY, '1')
        setHidden(true)
      } else {
        setStep(next)
      }
      setFading(false)
    }, 200)
  }, [])

  const advance = useCallback(() => go(isLast ? 'done' : step + 1), [go, isLast, step])
  const skip = useCallback(() => go('done'), [go])

  if (hidden) return null

  const hasSpot = !!spotRect && current.target !== null && current.placement !== 'center'

  const pos = computeCardPos(current.placement, hasSpot ? spotRect : null)

  const cardStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 1002,
    width: CARD_W,
    ...pos,
  }

  // Arrow: only show if we haven't had to flip/clamp significantly
  let arrowSide: 'left' | 'top' | null = null
  if (hasSpot && spotRect) {
    if (current.placement === 'right') arrowSide = 'left'
    else if (current.placement === 'bottom') arrowSide = 'top'
  }

  return (
    <>
      {!hasSpot && <div className="tutorial-backdrop" />}

      {hasSpot && spotRect && (
        <div
          className="tutorial-spotlight"
          style={{
            top: spotRect.top - PAD,
            left: spotRect.left - PAD,
            width: spotRect.width + PAD * 2,
            height: spotRect.height + PAD * 2,
          }}
        />
      )}

      <div className={`tutorial-card${fading ? ' fading' : ''}`} style={cardStyle}>
        {arrowSide === 'left' && <div className="tutorial-arrow arrow-left" />}
        {arrowSide === 'top' && <div className="tutorial-arrow arrow-top" />}

        <div className="tutorial-progress">
          {STEPS.map((_, i) => (
            <div key={i} className={`tutorial-dot${i === step ? ' active' : i < step ? ' done' : ''}`} />
          ))}
        </div>

        <h3 className="tutorial-title">{current.title}</h3>
        <p className="tutorial-body">{current.body}</p>

        <div className="tutorial-footer">
          <button className="tutorial-skip" onClick={skip}>Skip tour</button>
          <button className="tutorial-next btn-primary" onClick={advance}>
            {isLast ? 'Done' : 'Next →'}
          </button>
        </div>
      </div>
    </>
  )
}
