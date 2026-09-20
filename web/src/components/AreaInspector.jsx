import { NEAR_METRES } from '../lib/area.js'
import { formatClock } from '../lib/data.js'

/**
 * Results panel for a drawn selection.
 *
 * Ordered by the question a designer is actually asking: did people go in,
 * and if not, was it because they couldn't get there or because they didn't
 * bother? Everything else is supporting detail.
 */
export default function AreaInspector({ result, onClear }) {
  if (!result) {
    return (
      <div className="inspector empty">
        <h2>Area inspector</h2>
        <p className="hint">
          Drag a rectangle on the map to measure it. Entry rate, dwell,
          combat, and whether unused ground is bypassed or simply remote.
        </p>
      </div>
    )
  }

  const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)
  const topBearings = [...result.bearings].sort((a, b) => b.n - a.n).filter((b) => b.n > 0)
  const bearingTotal = topBearings.reduce((s, b) => s + b.n, 0)

  return (
    <div className="inspector">
      <div className="inspector-head">
        <h2>Area inspector</h2>
        <button className="link" onClick={onClear}>Clear</button>
      </div>

      <div className={`verdict v-${result.verdict.id}`}>
        <strong>{result.verdict.label}</strong>
        <span>{result.verdict.detail}</span>
      </div>

      <dl className="metrics">
        <dt>Size</dt>
        <dd>{result.widthM} × {result.heightM} m</dd>

        <dt>Runs entering</dt>
        <dd>{result.entered.toLocaleString()}</dd>

        <dt>Came within {NEAR_METRES} m</dt>
        <dd>{(result.entered + result.passed).toLocaleString()}</dd>

        <dt className="emph">Entry rate</dt>
        <dd className="emph">{pct(result.entryRate)}</dd>

        <dt>Median time inside</dt>
        <dd>{result.entered ? formatClock(result.medianDwell) : '—'}</dd>

        <dt>Loot pickups</dt>
        <dd>{result.loot.toLocaleString()}</dd>

        <dt>Loot per entering run</dt>
        <dd>{result.entered ? result.lootPerRun.toFixed(1) : '—'}</dd>

        <dt>Kills / deaths</dt>
        <dd>{result.kill.toLocaleString()} / {result.death.toLocaleString()}</dd>

        <dt>Playable ground</dt>
        <dd>
          {result.playable} of {result.cells} cells
          {result.playable > 0 && (
            <em> · {Math.round((result.unvisited / result.playable) * 100)}% never entered</em>
          )}
        </dd>
      </dl>

      {bearingTotal > 0 && (
        <div className="bearings">
          <h3>Approached from</h3>
          <ul>
            {topBearings.slice(0, 4).map((b) => (
              <li key={b.label}>
                <span className="dir">{b.label}</span>
                <span className="bar" style={{ width: `${(b.n / topBearings[0].n) * 100}%` }} />
                <span className="val">{Math.round((b.n / bearingTotal) * 100)}%</span>
              </li>
            ))}
          </ul>
          <p className="hint">
            Direction of travel on the step that crossed in, relative to the minimap.
          </p>
        </div>
      )}
    </div>
  )
}
