/**
 * Density surfaces (the heatmaps).
 *
 * These were originally deck.gl's HeatmapLayer, which aggregates on the GPU.
 * On deck.gl 9.4 that layer fails to bind its weights texture on some drivers
 * and renders the whole viewport as one saturated blob -- it worked under a
 * software renderer and broke on real hardware, which is a bad trade for a
 * tool whose entire job is to be looked at.
 *
 * So density is binned on the CPU instead and uploaded as a small image, the
 * same path the coverage overlay uses. At this scale that is not a compromise:
 * the largest map is 61k rows and a pass takes single-digit milliseconds, so
 * the surface still recomputes on every filter change. In exchange it is
 * deterministic, identical on every GPU, and drops a dependency.
 */

import { WORLD } from './data.js'
import { HEAT_RAMP } from './palette.js'

export const DENSITY_GRID = 220

/**
 * Smoothing radii, in world metres.
 *
 * Expressed as a distance rather than a count of grid cells because the grid
 * is fixed at 220x220 over the *normalised* map, so one cell is 2.6 m on Grand
 * Rift and 4.5 m on Lockdown. A constant cell radius therefore meant the same
 * kernel covered wildly different amounts of ground per map, and on every map
 * it was far too wide for sparse events: a single kill painted roughly 50 m of
 * haze in each direction, so an area with two kills in it looked like an area
 * with fighting spilling well past its edges.
 *
 * These numbers are the claim the surface makes. Events pool within about 25 m
 * -- close enough to be the same fight. Movement pools wider because a route is
 * a corridor, not a point.
 */
export const SMOOTH_METRES = { traffic: 45, event: 25 }

/**
 * Where the ramp saturates, in events per 100 m^2 per 100 matches.
 *
 * The surface used to normalise against the selection's own 99.5th percentile,
 * which made every reading relative: the same brightness meant 6.2 kills per
 * 100 m^2 on Ambrose Valley and 1.6 on Lockdown, and the picture silently
 * rescaled whenever a filter changed. Worse, it inverted the finding. Ambrose
 * has 566 matches to Grand Rift's 59, so raw totals mostly measure how much
 * play was recorded: by total density Ambrose looks 3.3x the hotter map, while
 * per match Grand Rift is 3.1x hotter. A level designer asking "is this a
 * hotspot in a typical match" wants the rate, so the rate is what the ramp
 * measures, and the legend can finally carry numbers.
 *
 * Each ceiling sits above the quiet maps' peaks and below the busiest, so every
 * map uses most of the ramp and the hottest ground clips and reads as "2+".
 * Observed peaks per 100 matches, at the 99.5th percentile:
 *   kill    Ambrose 1.41  Grand Rift 4.43  Lockdown 1.30
 *   death   Ambrose 0.90  Grand Rift 3.41  Lockdown 1.10
 *   loot    Ambrose 7.50  Grand Rift 11.04 Lockdown 4.95
 *   traffic Ambrose 9.37  Grand Rift 29.22 Lockdown 13.80
 */
export const RATE_CEILING = { traffic: 15, kill: 2, death: 2, loot: 8 }

/**
 * A smoothed density needs a population of matches behind it.
 *
 * The per-match rate is steady down to about twenty matches (1.41 -> 1.48 per
 * 100 matches on Ambrose kills) and then runs away: at ten matches it reads
 * 7.07 and at three, 9.64. The cause is that one event's own kernel peak does
 * not shrink as matches drop, so dividing by matches inflates it. Below this
 * many matches the tool draws no surface and says so, the same call `coverage`
 * already makes for a single match. The event markers remain exact.
 */
export const MIN_MATCHES_FOR_DENSITY = 20

/**
 * Convert a smoothing distance to a box-blur radius in grid cells.
 * Three passes of radius r reach 3r cells, so r is sized to the target reach.
 */
export function blurRadius(metres, scale) {
  const cell = (scale || 1000) / DENSITY_GRID
  return Math.max(1, Math.round(metres / cell / 3))
}

/** Side of one density cell, in world metres. */
function cellMetres(scale) {
  return (scale || 1000) / DENSITY_GRID
}

/**
 * How far from a real event the surface is allowed to make a claim, in cells.
 *
 * This is the smoothing distance itself: a cell may be painted only when an
 * event actually lies within the distance the blur is documented to pool over.
 */
function supportRadius(metres, scale) {
  return Math.max(1, Math.round(metres / cellMetres(scale)))
}

/**
 * Cells within `radius` of a cell holding at least one real event.
 *
 * The floor this replaces tested magnitude but claimed to test provenance --
 * "below this a cell holds nothing but the far tail of some other cell's
 * kernel". Those only agree when events are spread evenly. Once one cluster
 * dominates, every quieter location is measured against it and fails whether
 * or not real events sit in it, which hid a fifth of the kills on Ambrose
 * Valley and a quarter of the deaths. Asking where the events are answers the
 * question the comment was actually asking.
 */
function supportMask(occupied, grid, radius) {
  const support = new Uint8Array(grid * grid)
  const disc = []
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= radius * radius) disc.push([dy, dx])
    }
  }
  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      if (!occupied[r * grid + c]) continue
      for (let k = 0; k < disc.length; k++) {
        const rr = r + disc[k][0]
        const cc = c + disc[k][1]
        if (rr < 0 || rr >= grid || cc < 0 || cc >= grid) continue
        support[rr * grid + cc] = 1
      }
    }
  }
  return support
}

/**
 * Bin the selected rows into a density grid and smooth it.
 *
 * @param {object} data      decoded map payload
 * @param {Uint8Array} mask  row mask for the current selection
 * @param {string|null} category  null bins movement samples; otherwise that event category
 * @param {number} blur      smoothing radius in cells
 */
export function computeDensity(
  data, mask, category, smoothMetres, scale, landmask = null, landGrid = 0,
) {
  const grid = DENSITY_GRID
  const blur = blurRadius(smoothMetres, scale)
  let field = new Float32Array(grid * grid)
  const occupied = new Uint8Array(grid * grid)
  let count = 0

  for (let i = 0; i < data.n; i++) {
    if (!mask[i]) continue
    const isPosition = data.eventIsPosition[data.eventIx[i]]
    if (category === null) {
      if (!isPosition) continue
    } else if (isPosition || data.eventCategory[data.eventIx[i]] !== category) {
      continue
    }
    const col = Math.min(grid - 1, Math.max(0, Math.floor((data.x[i] / WORLD) * grid)))
    const row = Math.min(grid - 1, Math.max(0, Math.floor(((WORLD - data.y[i]) / WORLD) * grid)))
    field[row * grid + col] += 1
    occupied[row * grid + col] = 1
    count++
  }
  if (!count) return null

  // Recorded before the blur, so support describes where events actually are
  // rather than where the kernel carried them.
  const support = supportMask(occupied, grid, supportRadius(smoothMetres, scale))

  // Three box-blur passes approximate a Gaussian closely enough and stay O(n).
  let scratch = new Float32Array(grid * grid)
  for (let pass = 0; pass < 3; pass++) {
    blurAxis(field, scratch, grid, blur, true)
    blurAxis(scratch, field, grid, blur, false)
  }

  const cell = cellMetres(scale)
  return { field, grid, count, support, cellM2: cell * cell, land: landField(landmask, landGrid, grid) }
}

/**
 * The landmass as a soft 0..1 field at the density grid's resolution.
 *
 * Without this the blur smears density off the coastline into the void, which
 * reads as players having walked on open water. The mask ships at a coarser
 * grid than the density field, so it is upsampled and then feathered by a
 * couple of cells — a hard edge at the mask's own resolution would step along
 * the coast instead of following it.
 */
function landField(landmask, landGrid, grid) {
  if (!landmask || !landGrid) return null
  const f = new Float32Array(grid * grid)
  for (let r = 0; r < grid; r++) {
    const lr = Math.min(landGrid - 1, Math.floor((r / grid) * landGrid))
    for (let c = 0; c < grid; c++) {
      const lc = Math.min(landGrid - 1, Math.floor((c / grid) * landGrid))
      f[r * grid + c] = landmask[lr * landGrid + lc] === '1' ? 1 : 0
    }
  }
  const tmp = new Float32Array(grid * grid)
  blurAxis(f, tmp, grid, 2, true)
  blurAxis(tmp, f, grid, 2, false)
  return f
}

function blurAxis(src, dst, grid, radius, horizontal) {
  const span = radius * 2 + 1
  for (let a = 0; a < grid; a++) {
    let sum = 0
    const at = (b) => (horizontal ? a * grid + b : b * grid + a)
    // Prime the running sum with the clamped left edge.
    for (let b = -radius; b <= radius; b++) sum += src[at(Math.min(grid - 1, Math.max(0, b)))]
    for (let b = 0; b < grid; b++) {
      dst[at(b)] = sum / span
      const out = Math.min(grid - 1, Math.max(0, b - radius))
      const inc = Math.min(grid - 1, Math.max(0, b + radius + 1))
      sum += src[at(inc)] - src[at(out)]
    }
  }
}

/**
 * Colourise a density field through the sequential ramp.
 *
 * The scale is absolute (see RATE_CEILING), so the same colour means the same
 * event rate on every map and under every filter, and readings above the
 * ceiling clip rather than rescaling everything else.
 */
/**
 * @param {object} density  field, support and cell area from computeDensity
 * @param {number} lift     exponent on the normalised rate; lower lifts the
 *                          long tail harder. Movement samples cover most of
 *                          the map, so they need less lift than sparse
 *                          combat events or the surface swallows the art.
 * @param {number} alphaScale  overall opacity of the surface
 * @param {number} ceiling  rate at which the ramp saturates, per RATE_CEILING
 * @param {number} matches  matches in the current selection, the rate's divisor
 */
export function densityTexture(density, { lift = 0.5, alphaScale = 1, ceiling = 1, matches = 1 }) {
  const { field, grid, land, support, cellM2 } = density
  const canvas = document.createElement('canvas')
  canvas.width = grid
  canvas.height = grid
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(grid, grid)

  // events per cell -> events per 100 m^2 per 100 matches
  const toRate = (100 / cellM2) * (100 / Math.max(1, matches))

  for (let i = 0; i < grid * grid; i++) {
    // No real event within the smoothing distance: whatever is here is the
    // kernel's tail, and painting it would claim events happened where none
    // did. Inside the support the ramp starts at zero alpha, so a genuinely
    // faint reading fades out on its own rather than being cut at a threshold.
    if (support && !support[i]) {
      img.data[i * 4 + 3] = 0
      continue
    }
    const t = Math.min(1, (field[i] * toRate) / ceiling) ** lift
    const [r, g, b, a] = sampleRamp(t)
    const o = i * 4
    img.data[o] = r
    img.data[o + 1] = g
    img.data[o + 2] = b
    // Clipped to the landmass: density that blurred past the coast is not a
    // finding, it is an artefact of the kernel.
    const inside = land ? Math.min(1, land[i] * 1.12) : 1
    img.data[o + 3] = Math.round(a * alphaScale * inside)
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

function sampleRamp(t) {
  const last = HEAT_RAMP.length - 1
  const pos = Math.min(last, Math.max(0, t * last))
  const i = Math.min(last - 1, Math.floor(pos))
  const f = pos - i
  const lo = HEAT_RAMP[i]
  const hi = HEAT_RAMP[i + 1]
  return [
    Math.round(lo[0] + (hi[0] - lo[0]) * f),
    Math.round(lo[1] + (hi[1] - lo[1]) * f),
    Math.round(lo[2] + (hi[2] - lo[2]) * f),
    Math.round(lo[3] + (hi[3] - lo[3]) * f),
  ]
}
