import { WORLD } from '../lib/data.js'

/**
 * Distance rulers along the map edges.
 *
 * A level designer thinks in metres, not in "82% zoom" — a percentage of an
 * unstated reference tells them nothing. These read straight off each map's
 * own scale, so a glance answers "how far apart are those two hotspots".
 *
 * Direction labels are anchored to the edges rather than scrolling: this view
 * is fixed north-up and never rotates, so a moving compass strip would sit
 * still and say nothing.
 */

const NICE_STEPS = [5, 10, 25, 50, 100, 250, 500, 1000]
/** Aim for roughly this much space between ticks, in screen pixels. */
const TARGET_PX = 90

function chooseStep(metresPerPixel) {
  const target = metresPerPixel * TARGET_PX
  return NICE_STEPS.find((s) => s >= target) ?? NICE_STEPS[NICE_STEPS.length - 1]
}

export default function ScaleRulers({ mapMeta, viewState, size, cursor }) {
  if (!size.width || !size.height) return null

  const scalePx = 2 ** viewState.zoom                 // screen px per world unit
  const metresPerWorld = mapMeta.scale / WORLD
  const metresPerPixel = metresPerWorld / scalePx
  const step = chooseStep(metresPerPixel)
  const stepWorld = step / metresPerWorld

  const [tx, ty] = viewState.target
  // World coordinate at each edge of the viewport.
  const halfW = size.width / 2 / scalePx
  const halfH = size.height / 2 / scalePx
  const left = tx - halfW
  const right = tx + halfW
  const bottom = ty - halfH
  const top = ty + halfH

  const xTicks = ticksBetween(left, right, stepWorld)
  const yTicks = ticksBetween(bottom, top, stepWorld)

  const toScreenX = (wx) => (wx - left) * scalePx
  const toScreenY = (wy) => size.height - (wy - bottom) * scalePx

  // Labels are real world coordinates, not metres from the corner of the
  // image: a designer reading a number here will go looking for it in the
  // editor, so it has to be the same number the source data uses.
  //   worldX = originX + u * scale,  worldZ = originZ + v * scale
  const labelX = (world) => Math.round(mapMeta.originX + (world / WORLD) * mapMeta.scale)
  const labelZ = (world) => Math.round(mapMeta.originZ + (world / WORLD) * mapMeta.scale)

  return (
    <div className="rulers" aria-hidden="true">
      <div className="ruler ruler-x">
        {xTicks.map((wx) => (
          <span key={wx} className="tick" style={{ left: toScreenX(wx) }}>
            <i />{labelX(wx)}
          </span>
        ))}
        {cursor && (
          <span className="ruler-cursor" style={{ left: toScreenX(cursor.x) }} />
        )}
      </div>

      <div className="ruler ruler-y">
        {yTicks.map((wy) => (
          <span key={wy} className="tick" style={{ top: toScreenY(wy) }}>
            <i />{labelZ(wy)}
          </span>
        ))}
        {cursor && (
          <span className="ruler-cursor" style={{ top: toScreenY(cursor.y) }} />
        )}
      </div>

      <span className="compass compass-n">N</span>
      <span className="compass compass-s">S</span>
      <span className="compass compass-w">W</span>
      <span className="compass compass-e">E</span>

      <span className="scale-note">{step} m</span>
    </div>
  )
}

function ticksBetween(lo, hi, step) {
  const out = []
  const first = Math.ceil(lo / step) * step
  for (let v = first; v <= hi; v += step) out.push(Math.round(v * 1000) / 1000)
  return out
}
