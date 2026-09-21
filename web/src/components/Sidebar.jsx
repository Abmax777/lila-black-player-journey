import { formatClock, formatDay } from '../lib/data.js'
import { COVERAGE_MODES } from '../lib/coverage.js'

/**
 * Controls, grouped by the question a designer is asking.
 *
 * The earlier grouping was by mechanism — "Heatmap", "Map coverage", "Show" —
 * which requires you to already know what a coverage gradient is before you
 * can find it. These groups are named for what you are trying to do, and the
 * overlay options are labelled with their question rather than their method.
 *
 * Two structural points:
 *  - The overlays are one radiogroup because they are mutually exclusive. They
 *    used to be two independent-looking sections that silently cleared each
 *    other, which read as a bug.
 *  - Filters (who, when, which run) are separated from layers, and use a
 *    different control shape, because filters change every number in the stats
 *    bar while layers only change what is drawn.
 */

const OVERLAYS = [
  { id: 'none', question: 'Nothing', detail: 'Just the map' },
  { id: 'traffic', question: 'Where players go', detail: 'Movement density' },
  { id: 'kill', question: 'Where fights happen', detail: 'Kill density' },
  { id: 'death', question: 'Where players die', detail: 'Death density' },
  { id: 'loot', question: 'Where they loot', detail: 'Loot density' },
  { id: 'coverage', question: 'What they never touch', detail: 'Ground coverage' },
]

const MATCH_SORTS = [
  { id: 'recent', label: 'Recent', cmp: (a, b) => b.start - a.start },
  { id: 'longest', label: 'Longest', cmp: (a, b) => b.duration - a.duration },
  { id: 'kills', label: 'Most kills', cmp: (a, b) => killsOf(b) - killsOf(a) },
  { id: 'bots', label: 'Most bots', cmp: (a, b) => b.bots.length - a.bots.length },
]

function killsOf(m) {
  return (m.counts.Kill ?? 0) + (m.counts.BotKill ?? 0)
}

export default function Sidebar({
  importSlot,
  manifest, mapId, onMapChange,
  days, activeDays, onToggleDay, onAllDays,
  matches, matchId, onMatchChange,
  showHumans, showBots, onToggleActor,
  showPaths, onTogglePaths,
  showMarkers, onToggleMarkers,
  showTerminals, onToggleTerminals,
  overlay, onOverlayChange,
  coverageMode, onCoverageMode,
  overlayOpacity, onOverlayOpacity,
  onCopyLink, onSavePng, copied,
  onCompare, otherMaps,
  matchSort, onMatchSort, autoChanged = [], onShowIntro, onStartTour,
}) {
  const mapList = Object.values(manifest.maps)
  const sort = MATCH_SORTS.find((s) => s.id === matchSort) ?? MATCH_SORTS[0]
  const sorted = [...matches].sort(sort.cmp)

  return (
    <aside className="sidebar">
      <header className="brand">
        <h1>Player Journey Explorer</h1>
        <p>
          {manifest.imported ? 'Imported capture' : 'Lila Black'} ·{' '}
          {manifest.totals.matches.toLocaleString()} matches ·{' '}
          {manifest.totals.events.toLocaleString()} events
        </p>
        <div className="brand-links">
          <button className="link" onClick={onShowIntro}>What can this tell me?</button>
          <button className="link" onClick={onStartTour}>Show me around</button>
        </div>
      </header>

      {importSlot}

      <section>
        <h2>Map</h2>
        <div className="map-picker">
          {mapList.map((m) => (
            <button
              key={m.id}
              className={`map-chip${m.id === mapId ? ' active' : ''}`}
              onClick={() => onMapChange(m.id)}
              aria-pressed={m.id === mapId}
            >
              <img src={m.imageUrl ?? `${import.meta.env.BASE_URL}data/${m.image}`} alt="" loading="lazy" />
              <span>{m.label}</span>
              <em>{m.matches} matches</em>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Show me</h2>
        <div className="overlay-list" role="radiogroup" aria-label="Map overlay">
          {OVERLAYS.map((o) => {
            const disabled = o.id === 'coverage' && Boolean(matchId)
            return (
              <label key={o.id} className={`overlay-option${overlay === o.id ? ' active' : ''}${disabled ? ' disabled' : ''}`}>
                <input
                  type="radio"
                  name="overlay"
                  checked={overlay === o.id}
                  disabled={disabled}
                  onChange={() => onOverlayChange(o.id)}
                />
                <span className="q">{o.question}</span>
                <span className="d">{disabled ? 'Needs more than one run' : o.detail}</span>
              </label>
            )
          })}
        </div>

        {overlay !== 'none' && (
          <div className="overlay-sub">
            {overlay === 'coverage' && (
              <div className="chips">
                {Object.values(COVERAGE_MODES).map((m) => (
                  <button
                    key={m.id}
                    className={`chip${coverageMode === m.id ? ' active' : ''}`}
                    onClick={() => onCoverageMode(m.id)}
                    aria-pressed={coverageMode === m.id}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
            <label className="slider-row">
              <span>Strength</span>
              <input
                type="range" min={25} max={150} step={5}
                value={Math.round(overlayOpacity * 100)}
                onChange={(e) => onOverlayOpacity(Number(e.target.value) / 100)}
                aria-label="Overlay strength"
              />
              <span className="slider-value">{Math.round(overlayOpacity * 100)}%</span>
            </label>
            <p className="hint tight">
              Scales every cell equally, so the relative reading is unchanged.
            </p>
          </div>
        )}
      </section>

      <section>
        <h2>
          Add detail
          {autoChanged.length > 0 && <span className="auto-note">adjusted for you</span>}
        </h2>
        <label className={`toggle${autoChanged.includes('markers') ? ' auto' : ''}`}>
          <input type="checkbox" checked={showMarkers} onChange={onToggleMarkers} />
          <span>Event markers<em>Kills, deaths, loot, storm</em></span>
        </label>
        <label className={`toggle${autoChanged.includes('paths') ? ' auto' : ''}`}>
          <input type="checkbox" checked={showPaths} onChange={onTogglePaths} />
          <span>Journey paths<em>One line per run</em></span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={showTerminals} onChange={onToggleTerminals} />
          <span>Journey start &amp; end<em>Where runs begin and finish</em></span>
        </label>
      </section>

      <section>
        <h2>Narrow it down</h2>
        <p className="hint tight">These change every figure in the tool, not just the picture.</p>

        <h3 className="sub">Players</h3>
        <div className="chips">
          <button
            className={`chip${showHumans ? ' active' : ''}`}
            onClick={() => onToggleActor('human')}
            aria-pressed={showHumans}
          >
            Humans
          </button>
          <button
            className={`chip${showBots ? ' active' : ''}`}
            onClick={() => onToggleActor('bot')}
            aria-pressed={showBots}
          >
            Bots
          </button>
        </div>

        <div className="sub-head">
          <h3 className="sub">Day</h3>
          <button className="link" onClick={onAllDays}>All</button>
        </div>
        <div className="chips">
          {days.map((d) => (
            <button
              key={d}
              className={`chip${activeDays.has(d) ? ' active' : ''}`}
              onClick={() => onToggleDay(d)}
              disabled={matchId != null}
              aria-pressed={activeDays.has(d)}
            >
              {formatDay(d)}
            </button>
          ))}
        </div>

        <div className="sub-head">
          <h3 className="sub">One run</h3>
          {matchId && <button className="link" onClick={() => onMatchChange(null)}>Clear</button>}
        </div>
        <div className="chips sort-chips" role="group" aria-label="Sort runs by">
          {MATCH_SORTS.map((s) => (
            <button
              key={s.id}
              className={`chip tiny${matchSort === s.id ? ' active' : ''}`}
              onClick={() => onMatchSort(s.id)}
              aria-pressed={matchSort === s.id}
            >
              {s.label}
            </button>
          ))}
        </div>
        <select
          className="select"
          value={matchId ?? ''}
          onChange={(e) => onMatchChange(e.target.value || null)}
          aria-label="Select a single run"
        >
          <option value="">All runs on this map</option>
          {sorted.map((m) => (
            <option key={m.id} value={m.id}>
              {formatDay(m.day)} · {formatClock(m.duration)}
              {killsOf(m) ? ` · ${killsOf(m)} kills` : ''}
              {m.bots.length ? ` · ${m.bots.length} bots` : ''}
            </option>
          ))}
        </select>
        <p className="hint">
          {matchId
            ? 'Playback is available for a single run.'
            : 'Pick one run to scrub through it on the timeline.'}
        </p>
      </section>

      {/*
        Comparison is two windows, not a split canvas: every view already
        rebuilds itself from its own URL, so a second window costs nothing and
        the designer arranges them however their screen suits.
      */}
      <section className="compare">
        <h2>Compare side by side</h2>
        <div className="chips">
          {showHumans && showBots && (
            <button
              className="chip"
              title="Keep humans here, open bots in a new window"
              onClick={() => onCompare(
                { showHumans: false, showBots: true },
                { showBots: false },
                ['bots'],
              )}
            >
              Humans vs bots
            </button>
          )}
          {(overlay === 'kill' || overlay === 'death') && (
            <button
              className="chip"
              title="Open the opposite combat overlay in a new window"
              onClick={() => onCompare({ heatmapMode: overlay === 'kill' ? 'death' : 'kill' })}
            >
              {overlay === 'kill' ? 'Kills vs deaths' : 'Deaths vs kills'}
            </button>
          )}
          {otherMaps.map((m) => (
            <button
              key={m.id}
              className="chip"
              title={`Open this same view on ${m.label} in a new window`}
              onClick={() => onCompare({ mapId: m.id })}
            >
              vs {m.label}
            </button>
          ))}
        </div>
        <p className="hint">Opens a second window on the same ground, framed the same way.</p>
      </section>

      <section className="share">
        <h2>Share this view</h2>
        <div className="chips">
          <button className="chip" onClick={onCopyLink}>
            {copied ? 'Link copied' : 'Copy link'}
          </button>
          <button className="chip" onClick={onSavePng}>Save PNG</button>
        </div>
        <p className="hint">Every filter is in the URL, so the address bar is the share link.</p>
      </section>
    </aside>
  )
}
