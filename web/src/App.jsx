import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { WORLD, loadManifest, loadMapEvents, buildPaths, buildMarkers, buildPositions } from './lib/data.js'
import { buildRowMask, summarise } from './lib/selectors.js'
import { computeCoverage } from './lib/coverage.js'
import { CATEGORY_ORDER } from './lib/palette.js'
import MapCanvas from './components/MapCanvas.jsx'
import Sidebar from './components/Sidebar.jsx'
import StatsBar from './components/StatsBar.jsx'
import Timeline from './components/Timeline.jsx'
import Legend from './components/Legend.jsx'

const HEATMAP_LABEL = { traffic: 'Traffic', kill: 'Kill', death: 'Death', loot: 'Loot' }
const INITIAL_VIEW = { target: [WORLD / 2, WORLD / 2, 0], zoom: -0.55, minZoom: -2, maxZoom: 5 }

/** Zoom at which the WORLD square just fits the given viewport, with margin. */
function fitZoom(width, height) {
  if (!width || !height) return INITIAL_VIEW.zoom
  return Math.log2((Math.min(width, height) * 0.94) / WORLD)
}

export default function App() {
  const [boot, setBoot] = useState(null)
  const [mapId, setMapId] = useState('AmbroseValley')
  const [mapData, setMapData] = useState(null)
  const [loading, setLoading] = useState(true)

  const [activeDays, setActiveDays] = useState(new Set())
  const [matchId, setMatchId] = useState(null)
  const [showHumans, setShowHumans] = useState(true)
  const [showBots, setShowBots] = useState(true)
  // Aggregate view and single-match view want opposite defaults: 566 overlapping
  // journeys are unreadable, while a density surface answers 'where do players go'
  // immediately. Selecting a match flips both. Either can be overridden by hand.
  const [showPaths, setShowPaths] = useState(false)
  const [showMarkers, setShowMarkers] = useState(false)
  const [categories, setCategories] = useState(new Set(CATEGORY_ORDER))
  const [heatmapMode, setHeatmapMode] = useState('traffic')
  const [showCoverage, setShowCoverage] = useState(false)
  const [coverageMode, setCoverageMode] = useState('gradient')
  const [coverageOpacity, setCoverageOpacity] = useState(0.65)

  const [cutoff, setCutoff] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(4)
  const [viewState, setViewState] = useState(INITIAL_VIEW)

  useEffect(() => { loadManifest().then(setBoot) }, [])

  // Keep the map framed in the stage. Only the zoom is adjusted, so a user's
  // pan and zoom survive everything except an explicit map change.
  const stageRef = useRef(null)
  useEffect(() => {
    const el = stageRef.current
    if (!el) return undefined
    const fit = () => {
      const { width, height } = el.getBoundingClientRect()
      setViewState((v) => (v.userMoved ? v : { ...v, zoom: fitZoom(width, height - 52) }))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [boot])

  useEffect(() => {
    if (!boot) return
    let stale = false
    setLoading(true)
    loadMapEvents(mapId).then((d) => { if (!stale) { setMapData(d); setLoading(false) } })
    return () => { stale = true }
  }, [boot, mapId])

  // Matches available on the current map, newest first.
  const mapMatches = useMemo(
    () => (boot ? boot.matches.filter((m) => m.map === mapId) : []),
    [boot, mapId],
  )

  const selectedMatch = useMemo(
    () => mapMatches.find((m) => m.id === matchId) ?? null,
    [mapMatches, matchId],
  )

  // Day string per match index of the loaded payload.
  const matchDay = useMemo(() => {
    if (!mapData || !boot) return []
    const byId = new Map(boot.matches.map((m) => [m.id, m.day]))
    return mapData.matches.map((id) => byId.get(id) ?? '')
  }, [mapData, boot])

  const filters = useMemo(() => ({
    days: activeDays,
    matchId,
    showHumans,
    showBots,
    timeCutoff: selectedMatch && cutoff != null ? cutoff : null,
  }), [activeDays, matchId, showHumans, showBots, selectedMatch, cutoff])

  // Everything the current selection contains -- stats and heatmap read this.
  const dataMask = useMemo(
    () => (mapData ? buildRowMask(mapData, matchDay, filters) : null),
    [mapData, matchDay, filters],
  )
  // ...narrowed by the visibility toggles -- path and marker layers read this.
  const displayMask = useMemo(
    () => (mapData ? buildRowMask(mapData, matchDay, filters,
      { showPaths, categories: showMarkers ? categories : new Set() }) : null),
    [mapData, matchDay, filters, showPaths, categories, showMarkers],
  )

  const paths = useMemo(
    () => (mapData && displayMask && showPaths ? buildPaths(mapData, displayMask) : []),
    [mapData, displayMask, showPaths],
  )
  const markers = useMemo(
    () => (mapData && displayMask && showMarkers ? buildMarkers(mapData, displayMask) : []),
    [mapData, displayMask, showMarkers],
  )
  const summary = useMemo(
    () => (mapData && dataMask ? summarise(mapData, dataMask) : null),
    [mapData, dataMask],
  )
  // Heatmap sources come from dataMask, so its surface never changes just
  // because markers or paths were toggled off.
  const heatSource = useMemo(
    () => (mapData && dataMask ? buildMarkers(mapData, dataMask) : []),
    [mapData, dataMask],
  )

  const heatmap = useMemo(() => {
    if (!mapData || !dataMask || heatmapMode === 'none') return null
    const points = heatmapMode === 'traffic'
      ? buildPositions(mapData, dataMask)
      : heatSource.filter((m) => m.category === heatmapMode)
    if (!points.length) return null
    // Sparse event types need a wider kernel to read as a surface at all.
    return {
      key: heatmapMode,
      points,
      radius: heatmapMode === 'traffic' ? 30 : points.length > 600 ? 46 : 62,
      intensity: heatmapMode === 'traffic' ? 1.5 : 2.4,
    }
  }, [mapData, dataMask, heatmapMode, heatSource])

  // Coverage is a property of the whole selection, so it is computed from
  // dataMask and is meaningless for a single match -- one run cannot tell you
  // which ground the playerbase ignores.
  const coverage = useMemo(() => {
    if (!mapData || !dataMask || !showCoverage || matchId) return null
    const meta = boot.manifest.maps[mapId]
    return computeCoverage(mapData, dataMask, meta.landmask, meta.coverageGrid)
  }, [mapData, dataMask, showCoverage, matchId, boot, mapId])

  const selectMatch = useCallback((id) => {
    setMatchId(id)
    setPlaying(false)
    const m = mapMatches.find((x) => x.id === id)
    setCutoff(m ? m.duration : null)
    // One journey is worth drawing; hundreds are not.
    setShowPaths(Boolean(id))
    setHeatmapMode(id ? 'none' : 'traffic')
    setShowMarkers(Boolean(id))
  }, [mapMatches])

  const changeMap = useCallback((id) => {
    setMapId(id)
    setMatchId(null)
    setCutoff(null)
    setPlaying(false)
    setShowPaths(false)
    setHeatmapMode('traffic')
    setShowMarkers(false)
    setViewState((v) => ({ ...INITIAL_VIEW, zoom: v.zoom, userMoved: false }))
  }, [])

  const toggleDay = useCallback((d) => {
    setActiveDays((prev) => {
      const next = new Set(prev)
      if (next.has(d)) next.delete(d); else next.add(d)
      return next
    })
  }, [])

  const toggleCategory = useCallback((id) => {
    setCategories((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  // A density surface and ten thousand glyphs cannot both be the primary read,
  // so choosing a heatmap clears the markers. Either can be re-enabled by hand.
  const changeHeatmap = useCallback((mode) => {
    setHeatmapMode(mode)
    setShowMarkers(mode === 'none')
    // A density surface and a coverage surface are inverse readings of the same
    // movement data, and both are blue. Showing them together reads as noise.
    if (mode !== 'none') setShowCoverage(false)
  }, [])

  const toggleCoverage = useCallback(() => {
    setShowCoverage((v) => {
      if (!v) setHeatmapMode('none')
      return !v
    })
  }, [])

  const toggleActor = useCallback((who) => {
    if (who === 'human') setShowHumans((v) => !v)
    else setShowBots((v) => !v)
  }, [])

  if (!boot) return <div className="boot">Loading telemetry…</div>

  const mapMeta = boot.manifest.maps[mapId]

  return (
    <div className="app">
      <Sidebar
        manifest={boot.manifest}
        mapId={mapId}
        onMapChange={changeMap}
        days={boot.manifest.days}
        activeDays={activeDays}
        onToggleDay={toggleDay}
        onAllDays={() => setActiveDays(new Set())}
        matches={mapMatches}
        matchId={matchId}
        onMatchChange={selectMatch}
        showHumans={showHumans}
        showBots={showBots}
        onToggleActor={toggleActor}
        showPaths={showPaths}
        onTogglePaths={() => setShowPaths((v) => !v)}
        heatmapMode={heatmapMode}
        onHeatmapChange={changeHeatmap}
        showMarkers={showMarkers}
        onToggleMarkers={() => setShowMarkers((v) => !v)}
        showCoverage={showCoverage}
        onToggleCoverage={toggleCoverage}
        coverageMode={coverageMode}
        onCoverageMode={setCoverageMode}
        coverageOpacity={coverageOpacity}
        onCoverageOpacity={setCoverageOpacity}
      />

      <main className="stage" ref={stageRef}>
        <div className="stage-top">
          {summary && <StatsBar summary={summary} coverage={coverage} />}
          <Legend
            categories={categories}
            onToggle={toggleCategory}
            showPaths={showPaths}
            showHumans={showHumans}
            showBots={showBots}
            heatmapLabel={heatmapMode === 'none' ? null : HEATMAP_LABEL[heatmapMode]}
            coverage={coverage}
            coverageMode={coverageMode}
          />
        </div>

        {loading && <div className="stage-loading">Loading {mapMeta.label}…</div>}

        {mapData && (
          <MapCanvas
            mapMeta={mapMeta}
            paths={paths}
            markers={markers}
            heatmap={heatmap}
            coverage={coverage}
            coverageMode={coverageMode}
            coverageOpacity={coverageOpacity}
            showPaths={showPaths}
            viewState={viewState}
            onViewStateChange={({ viewState: vs, interactionState }) => setViewState({
              ...vs,
              userMoved: viewState.userMoved || Boolean(interactionState?.isDragging || interactionState?.isZooming),
            })}
          />
        )}

        {selectedMatch && (
          <Timeline
            duration={selectedMatch.duration}
            cutoff={cutoff ?? selectedMatch.duration}
            playing={playing}
            speed={speed}
            onScrub={setCutoff}
            onTogglePlay={setPlaying}
            onSpeed={setSpeed}
          />
        )}
      </main>
    </div>
  )
}
