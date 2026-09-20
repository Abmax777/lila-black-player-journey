import { CATEGORY } from '../lib/palette.js'
import { formatClock } from '../lib/data.js'
import { TERMINAL } from './MapCanvas.jsx'

export default function Tooltip({ info }) {
  const d = info.object
  const terminal = d.kind === 'entry' || d.kind === 'exit'
  const hue = terminal
    ? `rgb(${(d.kind === 'entry' ? TERMINAL.entry : TERMINAL.exit).join(',')})`
    : CATEGORY[d.category].hex
  const title = terminal
    ? (d.kind === 'entry' ? 'Journey start' : 'Journey end')
    : CATEGORY[d.category].label

  return (
    <div className="tooltip" style={{ left: info.x + 14, top: info.y + 14 }}>
      <div className="tooltip-head">
        <span className="swatch" style={{ background: hue }} />
        {title}
        {!terminal && <span className="tooltip-raw">{d.event}</span>}
      </div>
      <dl>
        <dt>Actor</dt><dd>{d.human ? 'Human' : 'Bot'} · <code>{d.user}</code></dd>
        <dt>Match</dt><dd><code>{d.match.slice(0, 8)}</code></dd>
        <dt>At</dt><dd>{formatClock(d.t)} into the match</dd>
        {d.oob && <><dt>Note</dt><dd className="warn">Outside drawn map area</dd></>}
      </dl>
    </div>
  )
}
