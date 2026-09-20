import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { OrthographicView, COORDINATE_SYSTEM } from '@deck.gl/core'
import { BitmapLayer, PathLayer, ScatterplotLayer, IconLayer } from '@deck.gl/layers'

import { WORLD } from '../lib/data.js'
import { CATEGORY, PATH, OOB } from '../lib/palette.js'
import { coverageTexture } from '../lib/coverage.js'
import { densityTexture } from '../lib/density.js'
import Tooltip from './Tooltip.jsx'
import ZoomControls from './ZoomControls.jsx'

/** The magnifier renders the same layers again, this much closer in. */
const LOUPE_ZOOM = 2.6
const LOUPE_SIZE = 230

const MAIN_VIEW = new OrthographicView({
  id: 'main',
  flipY: false,
  controller: { dragRotate: false, scrollZoom: { speed: 0.02, smooth: true } },
})

const ICON_SIZE = 64
function makeIconAtlas() {
  const shapes = ['triangle', 'cross', 'diamond', 'circle', 'square']
  const canvas = document.createElement('canvas')
  canvas.width = ICON_SIZE * shapes.length
  canvas.height = ICON_SIZE
  const ctx = canvas.getContext('2d')
  const c = ICON_SIZE / 2
  const r = ICON_SIZE * 0.34

  shapes.forEach((shape, i) => {
    ctx.save()
    ctx.translate(i * ICON_SIZE + c, c)
    ctx.beginPath()
    if (shape === 'circle') {
      ctx.arc(0, 0, r, 0, Math.PI * 2)
    } else if (shape === 'triangle') {
      ctx.moveTo(0, -r); ctx.lineTo(r * 0.92, r * 0.72); ctx.lineTo(-r * 0.92, r * 0.72)
      ctx.closePath()
    } else if (shape === 'diamond') {
      ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0)
      ctx.closePath()
    } else if (shape === 'square') {
      ctx.rect(-r * 0.78, -r * 0.78, r * 1.56, r * 1.56)
    } else {
      const a = r * 0.42
      const b = r
      ctx.moveTo(-b, -a); ctx.lineTo(-a, -b); ctx.lineTo(0, -a * 0.6)
      ctx.lineTo(a, -b); ctx.lineTo(b, -a); ctx.lineTo(a * 0.6, 0)
      ctx.lineTo(b, a); ctx.lineTo(a, b); ctx.lineTo(0, a * 0.6)
      ctx.lineTo(-a, b); ctx.lineTo(-b, a); ctx.lineTo(-a * 0.6, 0)
      ctx.closePath()
    }
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.lineWidth = 5
    ctx.strokeStyle = 'rgba(13,13,13,0.85)'
    ctx.stroke()
    ctx.restore()
  })

  const mapping = {}
  shapes.forEach((shape, i) => {
    mapping[shape] = { x: i * ICON_SIZE, y: 0, width: ICON_SIZE, height: ICON_SIZE, mask: true }
  })
  return { atlas: canvas, mapping }
}

export default function MapCanvas({
  mapMeta, paths, markers, terminals, heatmap, coverage, coverageMode, coverageOpacity,
  showPaths, viewState, onViewStateChange, onZoom, onResetView,
  magnifier, onToggleMagnifier, onCursorCell, cellReadout,
}) {
  const [hover, setHover] = useState(null)
  const [cursor, setCursor] = useState(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const wrapRef = useRef(null)
  const deckRef = useRef(null)

  const icons = useMemo(() => makeIconAtlas(), [])
  const coverageImage = useMemo(
    () => (coverage ? coverageTexture(coverage, coverageMode, coverageOpacity) : null),
    [coverage, coverageMode, coverageOpacity],
  )
  const heatImage = useMemo(
    () => (heatmap ? densityTexture(heatmap.field, heatmap.lift, heatmap.alpha) : null),
    [heatmap],
  )

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined
    const measure = () => {
      const r = el.getBoundingClientRect()
      setSize({ width: r.width, height: r.height })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const handleHover = useCallback((info) => {
    if (info.coordinate) {
      setCursor({ x: info.coordinate[0], y: info.coordinate[1] })
      onCursorCell?.(info.coordinate[0], info.coordinate[1])
    } else {
      setCursor(null)
      onCursorCell?.(null, null)
    }
  }, [onCursorCell])

  const bounds = [0, 0, WORLD, WORLD]
  const showLoupe = magnifier && cursor && size.width > LOUPE_SIZE * 1.6

  const views = useMemo(() => {
    if (!showLoupe) return [MAIN_VIEW]
    return [
      MAIN_VIEW,
      new OrthographicView({
        id: 'loupe',
        x: Math.round(size.width - LOUPE_SIZE - 16),
        y: 16,
        width: LOUPE_SIZE,
        height: LOUPE_SIZE,
        flipY: false,
        clear: true,
      }),
    ]
  }, [showLoupe, size.width])

  const viewStates = useMemo(() => {
    const main = viewState
    if (!showLoupe) return { main }
    return {
      main,
      loupe: {
        ...main,
        target: [cursor.x, cursor.y, 0],
        zoom: Math.min(main.maxZoom ?? 5, main.zoom + LOUPE_ZOOM),
      },
    }
  }, [viewState, showLoupe, cursor])

  const layers = [
    new BitmapLayer({
      id: 'minimap',
      image: `${import.meta.env.BASE_URL}data/${mapMeta.image}`,
      bounds,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
    }),

    // Unused ground sits directly on the minimap, beneath every other layer,
    // so it reads as a property of the map rather than as data laid on top.
    coverageImage && new BitmapLayer({
      id: `coverage-${coverageMode}`,
      image: coverageImage,
      bounds,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      textureParameters: {
        minFilter: 'linear', magFilter: 'linear',
        addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge',
      },
    }),

    heatImage && new BitmapLayer({
      id: `heat-${heatmap.key}`,
      image: heatImage,
      bounds,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      textureParameters: {
        minFilter: 'linear', magFilter: 'linear',
        addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge',
      },
    }),

    showPaths && new PathLayer({
      id: 'paths',
      data: paths,
      getPath: (d) => d.path,
      getColor: (d) => (d.human
        ? [...PATH.human.rgb, Math.min(PATH.human.opacity, pathAlpha(paths.length))]
        : [...PATH.bot.rgb, Math.min(PATH.bot.opacity, pathAlpha(paths.length))]),
      getWidth: (d) => (d.human ? PATH.human.width : PATH.bot.width),
      widthUnits: 'pixels',
      widthMinPixels: 1,
      capRounded: true,
      jointRounded: true,
      pickable: false,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      updateTriggers: { getColor: paths.length },
    }),

    // Where journeys begin and end. Drawn as rings rather than filled glyphs so
    // they read as annotations on a route rather than as more events.
    terminals && new ScatterplotLayer({
      id: 'terminals',
      data: terminals,
      getPosition: (d) => d.position,
      getRadius: 4.2,
      radiusUnits: 'pixels',
      radiusMinPixels: 3,
      filled: true,
      stroked: true,
      getFillColor: (d) => (d.kind === 'entry' ? [...TERMINAL.entry, 170] : [...TERMINAL.exit, 170]),
      getLineColor: (d) => (d.kind === 'entry' ? TERMINAL.entry : TERMINAL.exit),
      lineWidthUnits: 'pixels',
      getLineWidth: 1.4,
      pickable: true,
      onHover: (info) => setHover(info.object ? info : null),
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
    }),

    new ScatterplotLayer({
      id: 'oob-halo',
      data: markers.filter((m) => m.oob),
      getPosition: (d) => d.position,
      getRadius: 9,
      radiusUnits: 'pixels',
      filled: false,
      stroked: true,
      getLineColor: [...OOB.rgb, 200],
      lineWidthUnits: 'pixels',
      getLineWidth: 1.5,
      pickable: false,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
    }),

    new IconLayer({
      id: 'markers',
      data: markers,
      iconAtlas: icons.atlas,
      iconMapping: icons.mapping,
      getIcon: (d) => CATEGORY[d.category].shape,
      getPosition: (d) => d.position,
      getColor: (d) => CATEGORY[d.category].rgb,
      getSize: (d) => CATEGORY[d.category].radius * 3.2 * markScale(markers.length),
      sizeUnits: 'pixels',
      sizeMinPixels: 5,
      pickable: true,
      onHover: (info) => setHover(info.object ? info : null),
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      updateTriggers: { getSize: markers.length },
    }),
  ].filter(Boolean)

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <DeckGL
        ref={deckRef}
        views={views}
        viewState={viewStates}
        onViewStateChange={({ viewId, viewState: vs, interactionState }) => {
          if (viewId && viewId !== 'main') return
          onViewStateChange(vs, interactionState)
        }}
        layers={layers}
        onHover={handleHover}
        getCursor={({ isDragging }) => (isDragging ? 'grabbing' : 'crosshair')}
        glOptions={{ preserveDrawingBuffer: true }}
      />

      {showLoupe && (
        <div
          className="loupe-frame"
          style={{ width: LOUPE_SIZE, height: LOUPE_SIZE, right: 16, top: 16 }}
          aria-hidden="true"
        >
          <span className="loupe-label">{Math.round(2 ** LOUPE_ZOOM)}×</span>
        </div>
      )}

      <ZoomControls
        zoom={viewState.zoom}
        minZoom={viewState.minZoom ?? -2}
        maxZoom={viewState.maxZoom ?? 5}
        onZoom={onZoom}
        onReset={onResetView}
        magnifier={magnifier}
        onToggleMagnifier={onToggleMagnifier}
      />

      {cellReadout && !hover && <CellReadout readout={cellReadout} />}
      {hover && <Tooltip info={hover} />}
    </div>
  )
}

export const TERMINAL = {
  entry: [158, 197, 244],
  exit: [217, 89, 38],
}

function pathAlpha(count) {
  return Math.max(14, Math.min(170, Math.round(2600 / Math.max(1, count))))
}

function markScale(count) {
  return count > 4000 ? 0.6 : count > 1200 ? 0.78 : 1
}

function CellReadout({ readout }) {
  return (
    <div className="cell-readout" role="status" aria-live="polite">
      <div className="cell-readout-head">
        {readout.inside ? 'Playable ground' : 'Outside the map'}
        <span>{readout.sizeLabel}</span>
      </div>
      {readout.inside && (
        <dl>
          <dt>Runs through here</dt>
          <dd>{readout.matches.toLocaleString()}<em>{readout.share}</em></dd>
          <dt>Kills</dt><dd>{readout.kill.toLocaleString()}</dd>
          <dt>Deaths</dt><dd>{readout.death.toLocaleString()}</dd>
          <dt>Loot</dt><dd>{readout.loot.toLocaleString()}</dd>
        </dl>
      )}
    </div>
  )
}
