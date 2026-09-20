/**
 * First-run orientation.
 *
 * The three most useful things this tool does are also the three least
 * discoverable: nothing on screen suggests that coverage, the area inspector
 * or the phase window exist. Each card leads with the question it answers
 * rather than the feature's name — "which ground do players never walk on"
 * is findable; "coverage gradient" requires you to already know.
 *
 * Three cards, not a tour. Orientation, then out of the way.
 */

const CARDS = [
  {
    q: 'Which ground do players never walk on?',
    how: 'Show me → What they never touch',
    detail: 'Shades the map by how many runs came through. On Ambrose Valley, 27% of playable ground has never been entered.',
    icon: (
      <>
        <rect x="2.5" y="2.5" width="19" height="19" rx="3" />
        <path d="M2.5 9h19M9 2.5v19" opacity="0.45" />
        <path d="M2.5 9h6.5v-6.5" fill="currentColor" opacity="0.25" stroke="none" />
      </>
    ),
  },
  {
    q: 'Did they skip this building, or never get near it?',
    how: 'Press I, drag a box',
    detail: 'Entry rate against how many runs passed within 50 m. Those are opposite design problems and they need opposite fixes.',
    icon: (
      <>
        <path d="M3 7V3h4M17 3h4v4M21 17v4h-4M7 21H3v-4" />
        <rect x="8" y="8" width="8" height="8" strokeDasharray="2.4 2" />
      </>
    ),
  },
  {
    q: 'Where is everyone at minute 2, versus minute 10?',
    how: 'Match phase, along the bottom',
    detail: 'One time window applied to every run at once. 561 runs are alive between 1:00 and 2:00; 130 remain at 10:00.',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6.5V12l3.5 2.5" />
      </>
    ),
  },
]

export default function FirstRun({ onClose }) {
  return (
    <div className="firstrun-backdrop" role="presentation" onClick={onClose}>
      <div
        className="firstrun"
        role="dialog"
        aria-modal="true"
        aria-label="What this tool can tell you"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Three things this tool can tell you</h2>
        <p className="firstrun-sub">
          Lila Black telemetry, five days, 796 runs across three maps.
        </p>

        <ul className="firstrun-cards">
          {CARDS.map((c) => (
            <li key={c.q}>
              <svg viewBox="0 0 24 24" aria-hidden="true">{c.icon}</svg>
              <h3>{c.q}</h3>
              <p className="detail">{c.detail}</p>
              <p className="how">{c.how}</p>
            </li>
          ))}
        </ul>

        <div className="firstrun-foot">
          <span className="hint">Press <kbd>?</kbd> any time for keyboard shortcuts.</span>
          <button className="primary" onClick={onClose} autoFocus>Start exploring</button>
        </div>
      </div>
    </div>
  )
}
