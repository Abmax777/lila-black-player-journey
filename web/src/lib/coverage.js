/**
 * Map coverage / cold spots.
 *
 * The brief asks to show "which areas of the map get ignored". A traffic
 * heatmap answers that only by omission, and the eye goes to the bright parts,
 * not the dark ones. This inverts it: the unused ground is what lights up.
 *
 * Two details make the answer trustworthy rather than merely decorative:
 *
 *   - Unused is measured against the LANDMASS, not the image. The pipeline
 *     ships a coarse mask of what is actually part of the map, so ocean and
 *     off-map void are excluded instead of counting as "ignored".
 *   - A cell's score is the number of DISTINCT MATCHES that passed through it,
 *     not the number of samples. Samples reward standing still; a designer is
 *     asking how many runs came through here.
 */

import { WORLD } from './data.js'

/** Single hue, opacity carries magnitude: most dead = most opaque. */
export const COLD_HUE = [217, 89, 38]
export const COLD_STEPS = [170, 126, 88, 52]
export const COLD_HEX = ['#d95926', '#d959267e', '#d9592658', '#d9592634']

function alphaFor(visits, threshold) {
  if (visits === 0) return COLD_STEPS[0]
  if (visits === 1) return COLD_STEPS[1]
  if (visits === 2) return COLD_STEPS[2]
  return visits < threshold ? COLD_STEPS[3] : 0
}

/**
 * @param {object} data     decoded map payload
 * @param {Uint8Array} mask row mask for the current selection
 * @param {string} landmask flat row-major '0'/'1', row 0 at top of the image
 * @param {number} grid     cells per axis
 * @param {number} threshold a cell with fewer distinct matches than this is cold
 */
export function computeCoverage(data, mask, landmask, grid, threshold) {
  // Distinct matches per cell. A Set per visited cell is cheap at this scale
  // (tens of thousands of samples, thousands of cells).
  const seen = new Map()
  for (let i = 0; i < data.n; i++) {
    if (!mask[i]) continue
    if (!data.eventIsPosition[data.eventIx[i]]) continue
    const col = Math.min(grid - 1, Math.max(0, Math.floor((data.x[i] / WORLD) * grid)))
    const row = Math.min(grid - 1, Math.max(0, Math.floor(((WORLD - data.y[i]) / WORLD) * grid)))
    const cell = row * grid + col
    let set = seen.get(cell)
    if (!set) { set = new Set(); seen.set(cell, set) }
    set.add(data.matchIx[i])
  }

  const step = WORLD / grid
  const cells = []
  let playable = 0
  let cold = 0

  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const cell = row * grid + col
      if (landmask[cell] !== '1') continue
      playable++

      const visits = seen.get(cell)?.size ?? 0
      const alpha = alphaFor(visits, threshold)
      if (alpha === 0) continue
      cold++

      const x0 = col * step
      const y1 = WORLD - row * step
      cells.push({
        polygon: [[x0, y1 - step], [x0 + step, y1 - step], [x0 + step, y1], [x0, y1]],
        color: [...COLD_HUE, alpha],
        visits,
      })
    }
  }

  return { cells, playable, cold, pct: playable ? (cold / playable) * 100 : 0 }
}
