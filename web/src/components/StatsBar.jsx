import { CATEGORY, CATEGORY_ORDER } from '../lib/palette.js'

/**
 * Two tiers, because eight figures at equal weight is not a summary.
 *
 * Primary: the population and how much of the map it covered — the sample
 * behind everything else, kept next to the coverage figure so the two are
 * read together. Secondary: the event counts, grouped so they read as one
 * cluster. Zero values are dimmed rather than shouted.
 */
export default function StatsBar({ summary, coverage }) {
  const { counts, players, matches } = summary
  return (
    <div className="stats">
      <span className="stat primary">
        <b>{matches.toLocaleString()}</b><span>matches</span>
      </span>
      <span className="stat primary">
        <b>{players.toLocaleString()}</b><span>players</span>
      </span>

      {coverage && (
        <span className="stat primary coverage">
          <span className="swatch" style={{ background: '#2e4a7a' }} />
          <b>{(100 - coverage.pct).toFixed(0)}%</b>
          <span>coverage</span>
          <em>{coverage.pct.toFixed(0)}% never entered</em>
        </span>
      )}

      <span className="stats-rule" />

      <span className="stat-cluster">
        <Stat label="samples" value={counts.position} />
        {CATEGORY_ORDER.map((id) => (
          <Stat key={id} label={CATEGORY[id].label.toLowerCase()} value={counts[id]} hex={CATEGORY[id].hex} />
        ))}
        {counts.oob > 0 && <Stat label="off-map" value={counts.oob} hex="#ffffff" />}
      </span>
    </div>
  )
}

function Stat({ label, value, hex }) {
  return (
    <span className={`stat${value === 0 ? ' zero' : ''}`}>
      {hex && <span className="swatch" style={{ background: hex }} />}
      <b>{value.toLocaleString()}</b>
      <span>{label}</span>
    </span>
  )
}
