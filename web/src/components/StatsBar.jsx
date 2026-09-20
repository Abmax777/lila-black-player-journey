import { CATEGORY, CATEGORY_ORDER } from '../lib/palette.js'

export default function StatsBar({ summary, coverage }) {
  const { counts, players, matches } = summary
  return (
    <div className="stats">
      <Stat label="Matches" value={matches} />
      <Stat label="Players" value={players} />
      <Stat label="Samples" value={counts.position} />
      <span className="stats-rule" />
      {CATEGORY_ORDER.map((id) => (
        <Stat key={id} label={CATEGORY[id].label} value={counts[id]} hex={CATEGORY[id].hex} />
      ))}
      {counts.oob > 0 && <Stat label="Off-map" value={counts.oob} hex="#ffffff" />}
      {coverage && (
        <>
          <span className="stats-rule" />
          <span className="stat">
            <span className="swatch" style={{ background: '#d95926' }} />
            <b>{coverage.pct.toFixed(0)}%</b>
            <span>of playable ground unused</span>
          </span>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, hex }) {
  return (
    <span className="stat">
      {hex && <span className="swatch" style={{ background: hex }} />}
      <b>{value.toLocaleString()}</b>
      <span>{label}</span>
    </span>
  )
}
