import { formatClock, formatDay } from '../lib/data.js'

const HEATMAPS = [
  { id: 'none', label: 'Off' },
  { id: 'traffic', label: 'Traffic' },
  { id: 'kill', label: 'Kills' },
  { id: 'death', label: 'Deaths' },
  { id: 'loot', label: 'Loot' },
]

export default function Sidebar({
  manifest, mapId, onMapChange,
  days, activeDays, onToggleDay, onAllDays,
  matches, matchId, onMatchChange,
  showHumans, showBots, onToggleActor,
  showPaths, onTogglePaths,
  heatmapMode, onHeatmapChange, showMarkers, onToggleMarkers,
  showCoverage, onToggleCoverage, coverageThreshold, onCoverageThreshold,
}) {
  const mapList = Object.values(manifest.maps)

  return (
    <aside className="sidebar">
      <header className="brand">
        <h1>Player Journey Explorer</h1>
        <p>Lila Black · {manifest.totals.matches.toLocaleString()} matches · {manifest.totals.events.toLocaleString()} events</p>
      </header>

      <section>
        <h2>Map</h2>
        <div className="map-picker">
          {mapList.map((m) => (
            <button
              key={m.id}
              className={`map-chip${m.id === mapId ? ' active' : ''}`}
              onClick={() => onMapChange(m.id)}
            >
              <img src={`${import.meta.env.BASE_URL}data/${m.image}`} alt="" loading="lazy" />
              <span>{m.label}</span>
              <em>{m.matches} matches</em>
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>Day</h2>
          <button className="link" onClick={onAllDays}>All</button>
        </div>
        <div className="chips">
          {days.map((d) => (
            <button
              key={d}
              className={`chip${activeDays.has(d) ? ' active' : ''}`}
              onClick={() => onToggleDay(d)}
              disabled={matchId != null}
            >
              {formatDay(d)}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>Match</h2>
          {matchId && <button className="link" onClick={() => onMatchChange(null)}>Clear</button>}
        </div>
        <select
          className="select"
          value={matchId ?? ''}
          onChange={(e) => onMatchChange(e.target.value || null)}
        >
          <option value="">All matches on this map</option>
          {matches.map((m) => (
            <option key={m.id} value={m.id}>
              {formatDay(m.day)} · {m.id.slice(0, 8)} · {formatClock(m.duration)}
              {m.bots.length ? ` · ${m.bots.length} bots` : ''}
            </option>
          ))}
        </select>
        <p className="hint">
          {matchId
            ? 'Timeline playback is available for a single match.'
            : 'Pick one match to scrub through it on the timeline.'}
        </p>
      </section>

      <section>
        <h2>Heatmap</h2>
        <div className="chips">
          {HEATMAPS.map((h) => (
            <button
              key={h.id}
              className={`chip${heatmapMode === h.id ? ' active' : ''}`}
              onClick={() => onHeatmapChange(h.id)}
            >
              {h.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Map coverage</h2>
        <label className="toggle">
          <input type="checkbox" checked={showCoverage} onChange={onToggleCoverage} />
          Highlight unused ground
        </label>
        {showCoverage && (
          <>
            <p className="hint">Paint playable ground visited by fewer than…</p>
            <div className="chips">
              {[1, 3, 5, 10].map((n) => (
                <button
                  key={n}
                  className={`chip${coverageThreshold === n ? ' active' : ''}`}
                  onClick={() => onCoverageThreshold(n)}
                >
                  {n} match{n === 1 ? '' : 'es'}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <section>
        <h2>Show</h2>
        <label className="toggle">
          <input type="checkbox" checked={showMarkers} onChange={onToggleMarkers} />
          Event markers
        </label>
        <label className="toggle">
          <input type="checkbox" checked={showPaths} onChange={onTogglePaths} />
          Journey paths
        </label>
        <label className="toggle">
          <input type="checkbox" checked={showHumans} onChange={() => onToggleActor('human')} />
          Human players
        </label>
        <label className="toggle">
          <input type="checkbox" checked={showBots} onChange={() => onToggleActor('bot')} />
          Bots
        </label>
      </section>
    </aside>
  )
}
