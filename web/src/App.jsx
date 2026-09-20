import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  WORLD, loadManifest, loadMapEvents, buildPaths, buildJourneys, buildMarkers, buildTerminals,
} from './lib/data.js'
import { buildRowMask, summarise } from './lib/selectors.js'
import { buildCellIndex, cellAt } from './lib/cells.js'
import { computeCoverage } from './lib/coverage.js'
import { computeDensity } from './lib/density.js'
import { analyseArea } from './lib/area.js'
import { CATEGORY_ORDER } from './lib/palette.js'
import MapCanvas from './components/MapCanvas.jsx'
import Sidebar from './components/Sidebar.jsx'
import StatsBar from './components/StatsBar.jsx'
import Timeline from './components/Timeline.jsx'
import Legend from './components/Legend.jsx'
import MapSummary from './components/MapSummary.jsx'
import AreaInspector from './components/AreaInspector.jsx'
import PhaseScrubber from './components/PhaseScrubber.jsx'
import { readState, writeState, exportCanvas } from './lib/urlstate.js'

const HEATMAP_LABEL = { traffic: 'Traffic', kill: 'Kill', death: 'Death', loot: 'Loot' }
const BASE_VIEW = { target: [WORLD / 2, WORLD / 2, 0], zoom: -0.55, minZoom: -2, maxZoom: 5 }

function fitZoom(width, height) {
  if (!width || !height) return BASE_VIEW.zoom
  return Math.log2((Math.min(width, height) * 0.94) / WORLD)
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export default function App() {
  const initial = useMemo(() => readState(), [])

  const [boot, setBoot] = useState(null)
  const [error, setError] = useState(null)
  const [mapId, setMapId] = useState(initial.mapId)
  const [mapData, setMapData] = useState(null)
  const [loading, setLoading] = useState(true)

  const [activeDays, setActiveDays] = useState(initial.days)
  const [matchId, setMatchId] = useState(initial.matchId)
  const [showHumans, setShowHumans] = useState(initial.showHumans)
  const [showBots, setShowBots] = useState(initial.showBots)
  const [showPaths, setShowPaths] = useState(initial.showPaths)
  const [showMarkers, setShowMarkers] = useState(initial.showMarkers)
  const [showTerminals, setShowTerminals] = useState(initial.showTerminals)
  const [categories, setCategories] = useState(new Set(CATEGORY_ORDER))
  const [heatmapMode, setHeatmapMode] = useState(initial.heatmapMode)
  const [showCoverage, setShowCoverage] = useState(initial.showCoverage)
  const [coverageMode, setCoverageMode] = useState(initial.coverageMode)
  const [coverageOpacity, setCoverageOpacity] = useState(initial.coverageOpacity)

  const [cutoff, setCutoff] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(4)

  const [viewState, setViewState] = useState(BASE_VIEW)
  const [magnifier, setMagnifier] = useState(false)
  const [phaseStart, setPhaseStart] = useState(initial.phaseStart)
  const [phaseWindow, setPhaseWindow] = useState(initial.phaseWindow)
  const [phasePlaying, setPhasePlaying] = useState(false)
  const [copied, setCopied] = useState(false)
  const [cursorCell, setCursorCell] = useState(null)
  const [inspectMode, setInspectMode] = useState(false)
  const [rect, setRect] = useState(null)
  const [matchSort, setMatchSort] = useState('recent')

  useEffect(() => {
    loadManifest().then(setBoot).catch((e) => setError(e.message || String(e)))
  }, [])

  const stageRef = useRef(null)
  const fitRef = useRef(() => {})
  useEffect(() => {
    const el = stageRef.current
    if (!el) return undefined
    const fit = () => {
      const { width, height } = el.getBoundingClientRect()
      setViewState((v) => (v.userMoved ? v : { ...v, zoom: fitZoom(width, height - 52) }))
    }
    fitRef.current = () => {
      const { width, height } = el.getBoundingClientRect()
      setViewState({ ...BASE_VIEW, zoom: fitZoom(width, height - 52) })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [boot])

  useEffect(() => {
    if (!boot) return undefined
    let stale = false
    setLoading(true)
    loadMapEvents(mapId)
      .then((d) => { if (!stale) { setMapData(d); setLoading(false) } })
      .catch((e) => { if (!stale) { setError(e.message || String(e)); setLoading(false) } })
    return () => { stale = true }
  }, [boot, mapId])

  const mapMeta = boot?.manifest.maps[mapId] ?? null
  const grid = mapMeta?.coverageGrid ?? 96

  const mapMatches = useMemo(
    () => (boot ? boot.matches.filter((m) => m.map === mapId) : []),
    [boot, mapId],
  )
  const selectedMatch = useMemo(
    () => mapMatches.find((m) => m.id === matchId) ?? null,
    [mapMatches, matchId],
  )
  const maxElapsed = useMemo(
    () => mapMatches.reduce((m, x) => Math.max(m, x.duration), 0),
    [mapMatches],
  )

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
    timeWindow: !selectedMatch && phaseWindow
      ? [phaseStart, phaseStart + phaseWindow]
      : null,
  }), [activeDays, matchId, showHumans, showBots, selectedMatch, cutoff, phaseStart, phaseWindow])

  const dataMask = useMemo(
    () => (mapData ? buildRowMask(mapData, matchDay, filters) : null),
    [mapData, matchDay, filters],
  )
  const displayMask = useMemo(
    () => (mapData ? buildRowMask(mapData, matchDay, filters,
      { showPaths, categories: showMarkers ? categories : new Set() }) : null),
    [mapData, matchDay, filters, showPaths, categories, showMarkers],
  )

  // One pass over the selection feeds both the coverage overlay and the hover
  // readout, so the numbers under the cursor always match the shading.
  const cellIndex = useMemo(
    () => (mapData && dataMask ? buildCellIndex(mapData, dataMask, grid) : null),
    [mapData, dataMask, grid],
  )

  const paths = useMemo(
    () => (mapData && displayMask && showPaths ? buildPaths(mapData, displayMask) : []),
    [mapData, displayMask, showPaths],
  )
  const markers = useMemo(
    () => (mapData && displayMask && showMarkers ? buildMarkers(mapData, displayMask) : []),
    [mapData, displayMask, showMarkers],
  )
  const terminals = useMemo(
    () => (mapData && dataMask && showTerminals ? buildTerminals(mapData, dataMask) : null),
    [mapData, dataMask, showTerminals],
  )
  // Only built while the inspector is open: it is the one derivation that
  // walks every sample rather than every cell.
  const journeys = useMemo(
    () => (mapData && dataMask && inspectMode ? buildJourneys(mapData, dataMask) : null),
    [mapData, dataMask, inspectMode],
  )

  const areaResult = useMemo(() => {
    if (!journeys || !cellIndex || !rect || !mapMeta) return null
    if (rect.x1 - rect.x0 < 4 || rect.y1 - rect.y0 < 4) return null
    return analyseArea(journeys, cellIndex, rect, mapMeta)
  }, [journeys, cellIndex, rect, mapMeta])

  const summary = useMemo(
    () => (mapData && dataMask ? summarise(mapData, dataMask) : null),
    [mapData, dataMask],
  )

  const heatmap = useMemo(() => {
    if (!mapData || !dataMask || heatmapMode === 'none') return null
    const traffic = heatmapMode === 'traffic'
    const field = computeDensity(mapData, dataMask, traffic ? null : heatmapMode, traffic ? 4 : 7)
    return field
      ? { key: heatmapMode, field, lift: traffic ? 0.75 : 0.45, alpha: traffic ? 0.78 : 1 }
      : null
  }, [mapData, dataMask, heatmapMode])

  // Coverage describes a population of runs, so it is meaningless for one match.
  const coverage = useMemo(() => {
    if (!cellIndex || !showCoverage || matchId || !mapMeta) return null
    return computeCoverage(cellIndex, mapMeta.landmask)
  }, [cellIndex, showCoverage, matchId, mapMeta])

  const cellReadout = useMemo(() => {
    if (cursorCell == null || !cellIndex || !mapMeta) return null
    const inside = mapMeta.landmask[cursorCell] === '1'
    const metres = Math.round(mapMeta.scale / grid)
    return {
      inside,
      sizeLabel: `${metres} × ${metres} m`,
      matches: cellIndex.visits[cursorCell],
      kill: cellIndex.kill[cursorCell],
      death: cellIndex.death[cursorCell],
      loot: cellIndex.loot[cursorCell],
      share: summary && summary.matches
        ? ` · ${((cellIndex.visits[cursorCell] / summary.matches) * 100).toFixed(1)}% of runs`
        : '',
    }
  }, [cursorCell, cellIndex, mapMeta, grid, summary])

  const shareState = useMemo(() => ({
    mapId, days: activeDays, matchId, showHumans, showBots, showPaths, showMarkers,
    showTerminals, heatmapMode, showCoverage, coverageMode, coverageOpacity,
    phaseStart, phaseWindow,
  }), [mapId, activeDays, matchId, showHumans, showBots, showPaths, showMarkers,
      showTerminals, heatmapMode, showCoverage, coverageMode, coverageOpacity,
      phaseStart, phaseWindow])

  useEffect(() => { writeState(shareState) }, [shareState])

  const copyLink = useCallback(async () => {
    const url = writeState(shareState)
    try { await navigator.clipboard.writeText(url) } catch { /* clipboard may be blocked */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }, [shareState])

  const savePng = useCallback(() => {
    exportCanvas(`lila-${mapId}-${new Date().toISOString().slice(0, 10)}.png`)
  }, [mapId])

  const onCursorCell = useCallback((x, y) => {
    setCursorCell(x == null ? null : cellAt(x, y, grid))
  }, [grid])

  const selectMatch = useCallback((id) => {
    setMatchId(id)
    setPlaying(false)
    const m = mapMatches.find((x) => x.id === id)
    setCutoff(m ? m.duration : null)
    setShowPaths(Boolean(id))
    setHeatmapMode(id ? 'none' : 'traffic')
    setShowMarkers(Boolean(id))
    if (id) { setShowCoverage(false); setPhasePlaying(false) }
  }, [mapMatches])

  const changeMap = useCallback((id) => {
    setMapId(id)
    setMatchId(null)
    setCutoff(null)
    setPlaying(false)
    setShowPaths(false)
    setHeatmapMode('traffic')
    setShowMarkers(false)
    fitRef.current()
  }, [])

  // Overlays are mutually exclusive, so they are one value rather than two
  // independent flags that silently clear each other.
  const overlay = showCoverage ? 'coverage' : heatmapMode

  const changeOverlay = useCallback((next) => {
    if (next === 'coverage') {
      setShowCoverage(true)
      setHeatmapMode('none')
      setShowMarkers(false)
      return
    }
    setShowCoverage(false)
    setHeatmapMode(next)
    setShowMarkers(next === 'none')
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

  const toggleActor = useCallback((who) => {
    if (who === 'human') setShowHumans((v) => !v)
    else setShowBots((v) => !v)
  }, [])

  const zoomBy = useCallback((steps) => {
    setViewState((v) => ({
      ...v,
      zoom: clamp(v.zoom + steps * 0.5, v.minZoom ?? -2, v.maxZoom ?? 5),
      userMoved: true,
    }))
  }, [])

  const handleViewState = useCallback((vs, interaction) => {
    setViewState((prev) => ({
      ...vs,
      userMoved: prev.userMoved || Boolean(interaction?.isDragging || interaction?.isZooming),
    }))
  }, [])

  // Keyboard equivalents for every mouse-only map control.
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '+' || e.key === '=') { zoomBy(1); e.preventDefault() }
      else if (e.key === '-' || e.key === '_') { zoomBy(-1); e.preventDefault() }
      else if (e.key === '0') { fitRef.current(); e.preventDefault() }
      else if (e.key === 'm' || e.key === 'M') { setMagnifier((v) => !v); e.preventDefault() }
      else if (e.key === 'i' || e.key === 'I') {
        setInspectMode((v) => { if (v) setRect(null); return !v })
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomBy])

  if (error) {
    return (
      <div className="boot error" role="alert">
        <strong>Couldn’t load the telemetry.</strong>
        <span>{error}</span>
        <button className="chip" onClick={() => window.location.reload()}>Retry</button>
      </div>
    )
  }
  if (!boot) return <div className="boot" role="status">Loading telemetry…</div>

  const heatmapLabel = heatmapMode === 'none' ? null : HEATMAP_LABEL[heatmapMode]

  const toggleInspect = () => setInspectMode((v) => { if (v) setRect(null); return !v })

  return (
    <div className={`app${inspectMode ? ' inspecting' : ''}`}>
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
        showMarkers={showMarkers}
        onToggleMarkers={() => setShowMarkers((v) => !v)}
        showTerminals={showTerminals}
        onToggleTerminals={() => setShowTerminals((v) => !v)}
        overlay={overlay}
        onOverlayChange={changeOverlay}
        coverageMode={coverageMode}
        onCoverageMode={setCoverageMode}
        coverageOpacity={coverageOpacity}
        onCoverageOpacity={setCoverageOpacity}
        matchSort={matchSort}
        onMatchSort={setMatchSort}
        onCopyLink={copyLink}
        onSavePng={savePng}
        copied={copied}
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
            heatmapLabel={heatmapLabel}
            coverage={coverage}
            coverageMode={coverageMode}
            showTerminals={showTerminals}
          />
        </div>

        <MapSummary
          mapMeta={mapMeta}
          summary={summary}
          coverage={coverage}
          heatmapLabel={heatmapLabel}
          phase={phaseWindow ? `minutes ${(phaseStart / 60).toFixed(1)} to ${((phaseStart + phaseWindow) / 60).toFixed(1)} of each match` : null}
        />

        {loading && <div className="stage-loading" role="status">Loading {mapMeta.label}…</div>}

        {!loading && summary && summary.matches === 0 && (
          <div className="stage-empty" role="status">
            <div className="stage-empty-panel">
              <strong>Nothing matches these filters.</strong>
              <span>Try clearing the day selection, widening the phase window, or re-enabling human players.</span>
            </div>
          </div>
        )}

        {mapData && (
          <MapCanvas
            mapMeta={mapMeta}
            paths={paths}
            markers={markers}
            terminals={terminals}
            heatmap={heatmap}
            coverage={coverage}
            coverageMode={coverageMode}
            coverageOpacity={coverageOpacity}
            showPaths={showPaths}
            viewState={viewState}
            onViewStateChange={handleViewState}
            onZoom={zoomBy}
            onResetView={() => fitRef.current()}
            magnifier={magnifier}
            onToggleMagnifier={() => setMagnifier((v) => !v)}
            onCursorCell={onCursorCell}
            cellReadout={inspectMode ? null : cellReadout}
            inspectMode={inspectMode}
            rect={rect}
            onRect={setRect}
            onToggleInspect={toggleInspect}
          />
        )}

        {!selectedMatch && (
          <PhaseScrubber
            maxElapsed={maxElapsed}
            start={phaseStart}
            window={phaseWindow}
            playing={phasePlaying}
            onStart={setPhaseStart}
            onWindow={(w) => { setPhaseWindow(w); if (!w) setPhasePlaying(false) }}
            onTogglePlay={setPhasePlaying}
            onClear={() => { setPhaseWindow(null); setPhaseStart(0); setPhasePlaying(false) }}
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

      {inspectMode && (
        <AreaInspector result={areaResult} onClear={() => setRect(null)} />
      )}
    </div>
  )
}
