import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { OrthographicView, COORDINATE_SYSTEM } from '@deck.gl/core'
import { BitmapLayer, PathLayer, ScatterplotLayer, IconLayer, PolygonLayer } from '@deck.gl/layers'

import { WORLD } from '../lib/data.js'
import { CATEGORY, PATH, OOB } from '../lib/palette.js'
import { coverageTexture } from '../lib/coverage.js'
import { densityTexture } from '../lib/density.js'
import Tooltip from './Tooltip.jsx'
import ZoomControls from './ZoomControls.jsx'
import ScaleRulers from './ScaleRulers.jsx'

/** The magnifier renders the same layers again, this much closer in. */
const LOUPE_ZOOM = 2.6
const LOUPE_SIZE = 230
const LOUPE_MARGIN = 16

function mainView(inspectMode) {
  return new OrthographicView({
    id: 'main',
    flipY: false,
    // While drawing a selection, dragging must draw rather than pan. Zoom and
    // keyboard navigation stay live so the view is still adjustable.
    controller: {
      dragRotate: false,
      dragPan: !inspectMode,
      scrollZoom: { speed: 0.02, smooth: true },
    },
  })
}

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
  inspectMode, rect, onRect, onToggleInspect, onShowShortcuts, spacePan,
}) {
  const [hover, setHover] = useState(null)
  const [cursor, setCursor] = useState(null)
  const [pointerPx, setPointerPx] = useState(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const wrapRef = useRef(null)
  const deckRef = useRef(null)

  const icons = useMemo(() => makeIconAtlas(), [])
  const drag = useRef(null)
  const coverageImage = useMemo(
    () => (coverage ? coverageTexture(coverage, coverageMode, coverageOpacity) : null),
    [coverage, coverageMode, coverageOpacity],
  )
  const heatImage = useMemo(
    () => (heatmap ? densityTexture(heatmap.field, heatmap.lift, heatmap.alpha, heatmap.floor) : null),
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
    if (info.x != null && info.y != null) setPointerPx({ x: info.x, y: info.y })
    // The loupe is a second, more-zoomed view of wherever `cursor` already is.
    // Its own hover events report coordinates in that zoomed-in space, not a
    // new map position -- feeding them back in is what made the screen area
    // under the loupe unreachable, since it could never see past itself.
    if (info.viewport?.id === 'loupe') return
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

  // Fixed to one corner, whatever was drawn there became unreachable: the
  // loupe itself covered it. Instead it follows the pointer to whichever
  // corner is farthest away, so every part of the map stays inspectable.
  const loupeCorner = useMemo(() => {
    const fallback = { x: size.width - LOUPE_SIZE - LOUPE_MARGIN, y: LOUPE_MARGIN }
    if (!size.width || !size.height || !pointerPx) return fallback
    const corners = [
      { x: LOUPE_MARGIN, y: LOUPE_MARGIN },
      { x: size.width - LOUPE_SIZE - LOUPE_MARGIN, y: LOUPE_MARGIN },
      { x: LOUPE_MARGIN, y: size.height - LOUPE_SIZE - LOUPE_MARGIN },
      { x: size.width - LOUPE_SIZE - LOUPE_MARGIN, y: size.height - LOUPE_SIZE - LOUPE_MARGIN },
    ]
    let best = corners[0]
    let bestDist = -Infinity
    for (const c of corners) {
      const dx = c.x + LOUPE_SIZE / 2 - pointerPx.x
      const dy = c.y + LOUPE_SIZE / 2 - pointerPx.y
      const dist = dx * dx + dy * dy
      if (dist > bestDist) { bestDist = dist; best = c }
    }
    return best
  }, [size.width, size.height, pointerPx])

  // Holding space suspends drawing so the map can be panned without
  // leaving the area tool.
  const drawing = inspectMode && !spacePan
  const base = useMemo(() => mainView(drawing), [drawing])

  const views = useMemo(() => {
    if (!showLoupe) return [base]
    return [
      base,
      new OrthographicView({
        id: 'loupe',
        x: Math.round(loupeCorner.x),
        y: Math.round(loupeCorner.y),
        width: LOUPE_SIZE,
        height: LOUPE_SIZE,
        flipY: false,
        clear: true,
      }),
    ]
  }, [showLoupe, loupeCorner, base])

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

  /**
   * Which part of an existing selection the cursor is over: a corner, an
   * edge, the body, or nothing. Tolerance is in screen pixels converted to
   * world units, so handles stay the same physical size at any zoom.
   */
  const hitTest = useCallback((x, y) => {
    if (!rect) return null
    const tol = 9 / (2 ** viewState.zoom)
    const nearL = Math.abs(x - rect.x0) < tol
    const nearR = Math.abs(x - rect.x1) < tol
    const nearB = Math.abs(y - rect.y0) < tol
    const nearT = Math.abs(y - rect.y1) < tol
    const insideX = x > rect.x0 - tol && x < rect.x1 + tol
    const insideY = y > rect.y0 - tol && y < rect.y1 + tol
    if (!insideX || !insideY) return null
    if (nearL && nearB) return 'bl'
    if (nearL && nearT) return 'tl'
    if (nearR && nearB) return 'br'
    if (nearR && nearT) return 'tr'
    if (nearL) return 'l'
    if (nearR) return 'r'
    if (nearB) return 'b'
    if (nearT) return 't'
    return 'move'
  }, [rect, viewState.zoom])

  const beginDrag = useCallback((info) => {
    if (!drawing || !info.coordinate) return
    const [x, y] = info.coordinate
    const grip = hitTest(x, y)
    // Grabbing an existing selection adjusts it; anywhere else starts a new one.
    drag.current = grip
      ? { mode: grip, startX: x, startY: y, origin: { ...rect } }
      : { mode: 'new', x0: x, y0: y }
  }, [drawing, hitTest, rect])

  const moveDrag = useCallback((info) => {
    const d = drag.current
    if (!drawing || !d || !info.coordinate) return
    const [x, y] = info.coordinate

    if (d.mode === 'new') {
      onRect({
        x0: Math.min(d.x0, x), x1: Math.max(d.x0, x),
        y0: Math.min(d.y0, y), y1: Math.max(d.y0, y),
      })
      return
    }

    const o = d.origin
    const dx = x - d.startX
    const dy = y - d.startY
    let { x0, x1, y0, y1 } = o
    if (d.mode === 'move') { x0 += dx; x1 += dx; y0 += dy; y1 += dy }
    else {
      if (d.mode.includes('l')) x0 = o.x0 + dx
      if (d.mode.includes('r')) x1 = o.x1 + dx
      if (d.mode.includes('b')) y0 = o.y0 + dy
      if (d.mode.includes('t')) y1 = o.y1 + dy
    }
    onRect({
      x0: Math.min(x0, x1), x1: Math.max(x0, x1),
      y0: Math.min(y0, y1), y1: Math.max(y0, y1),
    })
  }, [drawing, onRect])

  const endDrag = useCallback(() => { drag.current = null }, [])

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

    rect && new PolygonLayer({
      id: 'selection',
      data: [rect],
      getPolygon: (r) => [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]],
      filled: true,
      stroked: true,
      getFillColor: [57, 135, 229, 26],
      getLineColor: [158, 197, 244, 235],
      lineWidthUnits: 'pixels',
      getLineWidth: 1.5,
      pickable: false,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      updateTriggers: { getPolygon: [rect.x0, rect.y0, rect.x1, rect.y1] },
    }),

    rect && new ScatterplotLayer({
      id: 'selection-handles',
      data: [
        [rect.x0, rect.y0], [rect.x1, rect.y0], [rect.x0, rect.y1], [rect.x1, rect.y1],
        [(rect.x0 + rect.x1) / 2, rect.y0], [(rect.x0 + rect.x1) / 2, rect.y1],
        [rect.x0, (rect.y0 + rect.y1) / 2], [rect.x1, (rect.y0 + rect.y1) / 2],
      ],
      getPosition: (d) => d,
      getRadius: 4,
      radiusUnits: 'pixels',
      filled: true,
      stroked: true,
      getFillColor: [13, 13, 13, 235],
      getLineColor: [158, 197, 244, 255],
      lineWidthUnits: 'pixels',
      getLineWidth: 1.5,
      pickable: false,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      updateTriggers: { getPosition: [rect.x0, rect.y0, rect.x1, rect.y1] },
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

  const measured = size.width > 0 && size.height > 0

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      {!measured && <div className="stage-loading" role="status">Preparing the map…</div>}
      {/*
        deck.gl is mounted only once this container has been measured.

        In the wild the canvas was found stuck at the 300x150 HTML default
        while its CSS box measured 724x601 -- the whole map rendering into a
        thumbnail and stretched over the element -- and it recovered from
        neither a window resize nor a layout change. luma.gl sizes the drawing
        buffer from a ResizeObserver on the canvas, so a canvas created while
        its container has no size (a hidden panel, a collapsed pane) can come
        up at the default and stay there.

        Passing width and height explicitly fixes that but disables
        autoResize, and with it the device-pixel scaling, which leaves the map
        soft on a Retina display. Waiting for a non-zero measurement keeps
        deck's own sizing -- and its dpr handling -- while removing the
        starting condition that broke it.
      */}
      {measured && (
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
        onDragStart={beginDrag}
        onDrag={moveDrag}
        onDragEnd={endDrag}
        getCursor={({ isDragging }) => {
          if (spacePan) return isDragging ? 'grabbing' : 'grab'
          if (inspectMode) {
            const grip = cursor && hitTest(cursor.x, cursor.y)
            if (grip === 'move') return 'move'
            if (grip === 'l' || grip === 'r') return 'ew-resize'
            if (grip === 't' || grip === 'b') return 'ns-resize'
            if (grip === 'tl' || grip === 'br') return 'nwse-resize'
            if (grip === 'tr' || grip === 'bl') return 'nesw-resize'
            return 'crosshair'
          }
          return isDragging ? 'grabbing' : 'grab'
        }}
        glOptions={{ preserveDrawingBuffer: true }}
      />
      )}

      <ScaleRulers mapMeta={mapMeta} viewState={viewState} size={size} cursor={cursor} />

      {showLoupe && (
        <div
          className="loupe-frame"
          style={{ width: LOUPE_SIZE, height: LOUPE_SIZE, left: loupeCorner.x, top: loupeCorner.y }}
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
        inspectMode={inspectMode}
        onToggleInspect={onToggleInspect}
        onShowShortcuts={onShowShortcuts}
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
