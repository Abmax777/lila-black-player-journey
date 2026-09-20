import { useEffect, useRef } from 'react'
import { formatClock } from '../lib/data.js'

const SPEEDS = [1, 4, 12]

/**
 * Playback for a single match. `cutoff` is seconds since that match started;
 * every layer filters on it, so scrubbing reveals the match in order.
 */
export default function Timeline({
  duration, cutoff, playing, speed, onScrub, onTogglePlay, onSpeed,
}) {
  const raf = useRef(0)
  const last = useRef(0)

  useEffect(() => {
    if (!playing) return undefined
    last.current = performance.now()
    const step = (now) => {
      const dt = (now - last.current) / 1000
      last.current = now
      onScrub((prev) => {
        const next = prev + dt * speed
        return next >= duration ? duration : next
      })
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, speed, duration, onScrub])

  useEffect(() => {
    if (playing && cutoff >= duration) onTogglePlay(false)
  }, [cutoff, duration, playing, onTogglePlay])

  return (
    <div className="timeline">
      <button className="play" onClick={() => onTogglePlay(!playing)} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? '❚❚' : '▶'}
      </button>
      <span className="clock">{formatClock(cutoff)}</span>
      <input
        className="scrub"
        type="range"
        min={0}
        max={duration}
        step={1}
        value={Math.round(cutoff)}
        onChange={(e) => onScrub(Number(e.target.value))}
        aria-label="Match timeline"
      />
      <span className="clock muted">{formatClock(duration)}</span>
      <div className="speeds">
        {SPEEDS.map((s) => (
          <button key={s} className={`chip tiny${speed === s ? ' active' : ''}`} onClick={() => onSpeed(s)}>
            {s}×
          </button>
        ))}
      </div>
      <button className="link" onClick={() => { onScrub(duration); onTogglePlay(false) }}>
        Full match
      </button>
    </div>
  )
}
