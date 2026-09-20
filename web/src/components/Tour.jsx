import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Opt-in guided tour.
 *
 * Two things make this different from pointing at buttons:
 *
 *  1. Each step DRIVES the app into the state it describes. Several of the
 *     things worth showing do not exist in the DOM until activated — the
 *     inspector panel, the coverage sub-controls, the match timeline — so a
 *     tour that only highlighted selectors would break on half its steps.
 *     Driving the state also means the viewer watches the feature work rather
 *     than reading a description of it.
 *
 *  2. It is never forced. Coach marks get clicked through unread when they are
 *     long or unsolicited, so this is six steps, launched deliberately, and
 *     abandonable at any point.
 */

const PAD = 8
const POPOVER_W = 320
const GAP = 14

export default function Tour({ steps, onClose }) {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState(null)
  const popRef = useRef(null)
  const step = steps[i]

  /**
   * Put the app into this step's state, bring the target into view, then
   * measure once React has painted and any scrolling has settled.
   *
   * The scroll matters: the sidebar scrolls independently, and the share
   * section sits below its fold. Highlighting something off-screen is worse
   * than not highlighting it -- the page dims and the spotlight is nowhere to
   * be found.
   */
  useEffect(() => {
    let cancelled = false
    step.before?.()

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const bring = requestAnimationFrame(() => {
      if (cancelled || !step.target) return
      const el = document.querySelector(step.target)
      if (!el) return
      const r = el.getBoundingClientRect()
      const offscreen = r.top < 0 || r.bottom > window.innerHeight
        || r.left < 0 || r.right > window.innerWidth
      if (offscreen) {
        el.scrollIntoView({ block: 'center', inline: 'nearest',
                            behavior: reduced ? 'auto' : 'smooth' })
      }
    })

    const settle = setTimeout(() => {
      if (cancelled) return
      measure()
    }, step.settle ?? 460)

    return () => { cancelled = true; cancelAnimationFrame(bring); clearTimeout(settle) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i])

  const measure = useCallback(() => {
    const el = step.target ? document.querySelector(step.target) : null
    if (!el) { setRect(null); return }
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i])

  useLayoutEffect(() => {
    const onChange = () => measure()
    window.addEventListener('resize', onChange)
    window.addEventListener('scroll', onChange, true)
    return () => {
      window.removeEventListener('resize', onChange)
      window.removeEventListener('scroll', onChange, true)
    }
  }, [measure])

  useEffect(() => { popRef.current?.focus() }, [i])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const next = () => (i + 1 < steps.length ? setI(i + 1) : onClose())
  const back = () => setI(Math.max(0, i - 1))

  // Padded, then clamped: several targets are full-bleed (the canvas, the
  // timeline, the inspector column), so an unclamped ring would run off the
  // edge of the screen on its own.
  const spot = rect && clampToViewport({
    top: rect.top - PAD,
    left: rect.left - PAD,
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
  })

  return (
    <>
      {/* Swallows clicks so the app cannot be changed underneath the tour. */}
      <div className="tour-blocker" onClick={onClose} role="presentation" />

      {spot
        ? <div className="tour-spotlight" style={spot} aria-hidden="true" />
        : <div className="tour-dim" aria-hidden="true" />}

      <div
        ref={popRef}
        className="tour-popover"
        style={placePopover(spot, step.place)}
        role="dialog"
        aria-modal="true"
        aria-label={step.title}
        tabIndex={-1}
      >
        <p className="tour-count">Step {i + 1} of {steps.length}</p>
        <h3>{step.title}</h3>
        <p className="tour-body">{step.body}</p>
        <div className="tour-actions">
          <button className="link" onClick={onClose}>Skip</button>
          <div className="tour-nav">
            {i > 0 && <button className="chip" onClick={back}>Back</button>}
            <button className="primary" onClick={next}>
              {i + 1 === steps.length ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function clampToViewport(r) {
  const m = 4
  const top = Math.max(m, r.top)
  const left = Math.max(m, r.left)
  return {
    top,
    left,
    width: Math.min(r.left + r.width, window.innerWidth - m) - left,
    height: Math.min(r.top + r.height, window.innerHeight - m) - top,
  }
}

/**
 * Anchor the popover to the spotlight, flipping when it would leave the
 * viewport. With no target it sits centred, which is what the map steps want.
 */
function placePopover(spot, place = 'right') {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (!spot) {
    return { left: vw / 2 - POPOVER_W / 2, top: vh / 2 - 90 }
  }

  let left
  let top
  if (place === 'right' || place === 'left') {
    left = place === 'right' ? spot.left + spot.width + GAP : spot.left - POPOVER_W - GAP
    if (left + POPOVER_W > vw - 12) left = spot.left - POPOVER_W - GAP
    if (left < 12) left = Math.min(vw - POPOVER_W - 12, spot.left + spot.width + GAP)
    top = spot.top + spot.height / 2 - 90
  } else {
    top = place === 'bottom' ? spot.top + spot.height + GAP : spot.top - 200 - GAP
    if (top + 200 > vh - 12) top = spot.top - 200 - GAP
    left = spot.left + spot.width / 2 - POPOVER_W / 2
  }

  return {
    left: Math.max(12, Math.min(left, vw - POPOVER_W - 12)),
    top: Math.max(12, Math.min(top, vh - 200)),
  }
}
