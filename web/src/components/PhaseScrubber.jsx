import { useEffect, useRef } from 'react'
import { formatClock } from '../lib/data.js'

const WINDOWS = [
  { s: 60, label: '1 min' },
  { s: 120, label: '2 min' },
  { s: 300, label: '5 min' },
]

/**
 * Match-phase window, across every match at once.
 *
 * `t` is stored relative to each match's own start, so one window can be
 * applied to all of them together: "where is everyone between minute 5 and
 * minute 6", pooled over hundreds of runs. That is the question behind pacing
 * and storm pressure, and it is not answerable one match at a time.
 */
export default function PhaseScrubber({
  maxElapsed, start, window: win, playing, onStart, onWindow, onTogglePlay, onClear,
}) {
  const raf = useRef(0)
  const last = useRef(0)

  useEffect(() => {
    if (!playing || win == null) return undefined
    last.current = performance.now()
    const step = (now) => {
      const dt = (now - last.current) / 1000
      last.current = now
      onStart((prev) => {
        const next = prev + dt * 12
        return next + win >= maxElapsed ? 0 : next
      })
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, win, maxElapsed, onStart])

  const active = win != null

  return (
    <div className="timeline phase">
      <button
        className="play"
        onClick={() => onTogglePlay(!playing)}
        disabled={!active}
        aria-label={playing ? 'Pause phase playback' : 'Play phase playback'}
      >
        {playing ? '❚❚' : '▶'}
      </button>

      <span className="phase-label">
        <em>Match phase</em>
        <span className="clock">
          {active ? `${formatClock(start)}–${formatClock(start + win)}` : 'All phases'}
        </span>
      </span>

      <input
        className="scrub"
        type="range"
        min={0}
        max={Math.max(1, maxElapsed - (win ?? 0))}
        step={5}
        value={Math.round(start)}
        disabled={!active}
        onChange={(e) => onStart(Number(e.target.value))}
        aria-label="Match phase window start, applied across every run"
      />

      <span className="clock muted">{formatClock(maxElapsed)}</span>

      <div className="speeds" role="group" aria-label="Phase window length">
        {WINDOWS.map((w) => (
          <button
            key={w.s}
            className={`chip tiny${win === w.s ? ' active' : ''}`}
            onClick={() => onWindow(win === w.s ? null : w.s)}
          >
            {w.label}
          </button>
        ))}
      </div>

      {active && <button className="link" onClick={onClear}>Clear</button>}
      {!active && (
        <span className="hint inline">
          Pick a window to see every run at the same point in its own match
        </span>
      )}
    </div>
  )
}
