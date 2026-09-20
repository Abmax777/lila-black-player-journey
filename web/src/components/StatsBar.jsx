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
          {/* Lead with coverage rather than with the alarming inverse, and keep
              the population visible beside it: the matches and players counts
              at the head of this bar are the sample behind the percentage. */}
          <span className="stat coverage">
            <span className="swatch" style={{ background: '#2e4a7a' }} />
            <b>{(100 - coverage.pct).toFixed(0)}%</b>
            <span>player coverage</span>
            <em>{coverage.pct.toFixed(0)}% never entered</em>
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
