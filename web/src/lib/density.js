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
 * Bin the selected rows into a density grid and smooth it.
 *
 * @param {object} data      decoded map payload
 * @param {Uint8Array} mask  row mask for the current selection
 * @param {string|null} category  null bins movement samples; otherwise that event category
 * @param {number} blur      smoothing radius in cells
 */
export function computeDensity(data, mask, category, blur = 4, landmask = null, landGrid = 0) {
  const grid = DENSITY_GRID
  let field = new Float32Array(grid * grid)
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
    count++
  }
  if (!count) return null

  // Three box-blur passes approximate a Gaussian closely enough and stay O(n).
  let scratch = new Float32Array(grid * grid)
  for (let pass = 0; pass < 3; pass++) {
    blurAxis(field, scratch, grid, blur, true)
    blurAxis(scratch, field, grid, blur, false)
  }

  return { field, grid, count, land: landField(landmask, landGrid, grid) }
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
 * Normalised against a high percentile rather than the maximum, so a single
 * doorway that everyone walks through cannot flatten the rest of the map.
 */
/**
 * @param {object} density  field + grid from computeDensity
 * @param {number} lift     exponent on normalised density; lower lifts the
 *                          long tail harder. Movement samples cover most of
 *                          the map, so they need less lift than sparse
 *                          combat events or the surface swallows the art.
 * @param {number} alphaScale  overall opacity of the surface
 */
export function densityTexture({ field, grid, land }, lift = 0.5, alphaScale = 1) {
  const nonZero = []
  for (let i = 0; i < field.length; i++) if (field[i] > 1e-6) nonZero.push(field[i])
  if (!nonZero.length) return null
  nonZero.sort((a, b) => a - b)
  const ceiling = Math.max(1e-6, nonZero[Math.floor(nonZero.length * 0.995)])

  const canvas = document.createElement('canvas')
  canvas.width = grid
  canvas.height = grid
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(grid, grid)

  for (let i = 0; i < grid * grid; i++) {
    const t = Math.min(1, (field[i] / ceiling) ** lift)
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
