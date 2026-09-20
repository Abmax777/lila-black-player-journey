/**
 * Text equivalent of the map, for screen readers.
 *
 * A canvas is opaque to assistive technology. This states, in words, what the
 * current view contains -- which is also a decent sanity check for anyone
 * wondering whether the filters did what they expected.
 */
export default function MapSummary({ mapMeta, summary, coverage, heatmapLabel, phase }) {
  if (!summary) return null
  const { counts, players, matches } = summary
  return (
    <p className="visually-hidden" role="status" aria-live="polite">
      {mapMeta.label}. {matches.toLocaleString()} matches, {players.toLocaleString()} players,
      {' '}{counts.position.toLocaleString()} movement samples.
      {' '}{counts.kill.toLocaleString()} kills, {counts.death.toLocaleString()} deaths,
      {' '}{counts.loot.toLocaleString()} loot pickups, {counts.storm.toLocaleString()} storm deaths.
      {coverage && ` ${coverage.pct.toFixed(0)} percent of playable ground unused.`}
      {heatmapLabel && ` Showing ${heatmapLabel.toLowerCase()} density.`}
      {phase && ` Restricted to ${phase}.`}
    </p>
  )
}
