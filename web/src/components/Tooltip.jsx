import { CATEGORY } from '../lib/palette.js'
import { formatClock } from '../lib/data.js'

export default function Tooltip({ info }) {
  const d = info.object
  const cat = CATEGORY[d.category]
  return (
    <div className="tooltip" style={{ left: info.x + 14, top: info.y + 14 }}>
      <div className="tooltip-head">
        <span className="swatch" style={{ background: cat.hex }} />
        {cat.label}
        <span className="tooltip-raw">{d.event}</span>
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
