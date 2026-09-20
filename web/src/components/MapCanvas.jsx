import { useMemo, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { OrthographicView, COORDINATE_SYSTEM } from '@deck.gl/core'
import { BitmapLayer, PathLayer, ScatterplotLayer, IconLayer, PolygonLayer } from '@deck.gl/layers'
import { HeatmapLayer } from '@deck.gl/aggregation-layers'

import { WORLD } from '../lib/data.js'
import { CATEGORY, PATH, HEAT_RAMP, OOB } from '../lib/palette.js'
import Tooltip from './Tooltip.jsx'

const VIEW = new OrthographicView({ id: 'ortho', flipY: false })

/**
 * Glyph atlas drawn at runtime, so each event category gets a distinct shape
 * without shipping image assets. Shape is the accessibility channel that backs
 * up hue -- see lib/palette.js.
 */
const ICON_SIZE = 64
function makeIconAtlas() {
  const shapes = ['triangle', 'cross', 'diamond', 'circle']
  const canvas = document.createElement('canvas')
  canvas.width = ICON_SIZE * shapes.length
  canvas.height = ICON_SIZE
  const ctx = canvas.getContext('2d')
  const c = ICON_SIZE / 2
  const r = ICON_SIZE * 0.34

  shapes.forEach((shape, i) => {
    const ox = i * ICON_SIZE
    ctx.save()
    ctx.translate(ox + c, c)
    ctx.beginPath()
    if (shape === 'circle') {
      ctx.arc(0, 0, r, 0, Math.PI * 2)
    } else if (shape === 'triangle') {
      ctx.moveTo(0, -r)
      ctx.lineTo(r * 0.92, r * 0.72)
      ctx.lineTo(-r * 0.92, r * 0.72)
      ctx.closePath()
    } else if (shape === 'diamond') {
      ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0)
      ctx.closePath()
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
    // 2px surface ring so overlapping marks stay separable
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
  mapMeta, paths, markers, heatmap, coverage, showPaths, viewState, onViewStateChange,
}) {
  const [hover, setHover] = useState(null)
  const icons = useMemo(() => makeIconAtlas(), [])

  // Marks thin out as the selection grows, so an aggregate view reads as a
  // distribution rather than a solid block of colour.
  const markScale = markers.length > 4000 ? 0.6 : markers.length > 1200 ? 0.78 : 1
  const pathAlpha = Math.max(14, Math.min(170, Math.round(2600 / Math.max(1, paths.length))))

  // Minimaps are square in UV space; source art aspect is preserved by fitting
  // the longest edge, so the bitmap always covers exactly [0..WORLD]^2.
  const bounds = [0, 0, WORLD, WORLD]

  const layers = [
    new BitmapLayer({
      id: 'minimap',
      image: `${import.meta.env.BASE_URL}data/${mapMeta.image}`,
      bounds,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
    }),

    // Unused ground sits directly on the minimap, beneath every other layer,
    // so it reads as a property of the map rather than as data on top of it.
    coverage && new PolygonLayer({
      id: 'coldspots',
      data: coverage.cells,
      getPolygon: (d) => d.polygon,
      getFillColor: (d) => d.color,
      stroked: false,
      filled: true,
      pickable: false,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
    }),

    heatmap && new HeatmapLayer({
      id: `heat-${heatmap.key}`,
      data: heatmap.points,
      getPosition: (d) => d.position,
      getWeight: 1,
      radiusPixels: heatmap.radius,
      intensity: heatmap.intensity ?? 1,
      threshold: 0.03,
      colorRange: HEAT_RAMP,
      aggregation: 'SUM',
      opacity: 0.9,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
    }),

    showPaths && new PathLayer({
      id: 'paths',
      data: paths,
      getPath: (d) => d.path,
      getColor: (d) => (d.human
        ? [...PATH.human.rgb, Math.min(PATH.human.opacity, pathAlpha)]
        : [...PATH.bot.rgb, Math.min(PATH.bot.opacity, pathAlpha)]),
      getWidth: (d) => (d.human ? PATH.human.width : PATH.bot.width),
      widthUnits: 'pixels',
      widthMinPixels: 1,
      capRounded: true,
      jointRounded: true,
      pickable: false,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
    }),

    // Out-of-bounds halo, drawn under the glyph so the anomaly is visible
    // without changing the event's own colour.
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
      getSize: (d) => CATEGORY[d.category].radius * 3.2 * markScale,
      sizeUnits: 'pixels',
      sizeMinPixels: 5,
      updateTriggers: { getSize: markScale },
      pickable: true,
      onHover: (info) => setHover(info.object ? info : null),
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
    }),
  ].filter(Boolean)

  return (
    <div className="canvas-wrap">
      <DeckGL
        views={VIEW}
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        controller={{ dragRotate: false, scrollZoom: { speed: 0.02, smooth: true } }}
        layers={layers}
        getCursor={({ isDragging }) => (isDragging ? 'grabbing' : 'grab')}
      />
      {hover && <Tooltip info={hover} />}
    </div>
  )
}
