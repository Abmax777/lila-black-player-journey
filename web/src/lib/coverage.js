/**
 * Map coverage.
 *
 * The brief asks to show "which areas of the map get ignored". A traffic
 * heatmap answers that only by omission, and the eye goes to the bright parts,
 * not the dark ones. This inverts it: unwalked ground is what reads.
 *
 * Three details make the answer trustworthy rather than decorative:
 *
 *   - Unused is measured against the LANDMASS, not the image. The pipeline
 *     ships a coarse mask of what is actually part of the map, so ocean and
 *     off-map void are excluded instead of counting as "ignored".
 *   - A cell scores by the number of DISTINCT MATCHES that passed through it,
 *     not by sample count. Samples reward standing still; a designer is asking
 *     how many runs came through here.
 *   - The gradient is normalised to the SELECTION's own 98th percentile, not to
 *     total matches. Traffic here is extremely skewed -- the busiest cell on
 *     Ambrose Valley is entered in only 16% of matches and the median visited
 *     cell in 1.2% -- so a share-of-all-matches scale would flatten every map
 *     into one shade.
 *
 * The overlay is a cool tint rather than a warm one: unwalked ground reads as
 * cold and unexplored, not as an error state, and it stays distinct from the
 * warm event markers drawn above it.
 */

import { WORLD } from './data.js'

export const COVERAGE_TINT = [46, 74, 122]
export const COVERAGE_TINT_HEX = '#2e4a7a'
export const MAX_ALPHA = 236

export const COVERAGE_MODES = {
  gradient: { id: 'gradient', label: 'Coverage', hint: 'Shaded by how many runs came through — darkest is untouched.' },
  unvisited: { id: 'unvisited', label: 'Unvisited only', hint: 'Only ground no run has ever entered.' },
}

/**
 * @param {object} data     decoded map payload
 * @param {Uint8Array} mask row mask for the current selection
 * @param {string} landmask flat row-major '0'/'1', row 0 at top of the image
 * @param {number} grid     cells per axis
 */
export function computeCoverage(data, mask, landmask, grid) {
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

  const visits = new Int32Array(grid * grid).fill(-1)   // -1 == not part of the map
  let playable = 0
  let never = 0
  const nonZero = []

  for (let cell = 0; cell < grid * grid; cell++) {
    if (landmask[cell] !== '1') continue
    playable++
    const n = seen.get(cell)?.size ?? 0
    visits[cell] = n
    if (n === 0) never++
    else nonZero.push(n)
  }

  // Normalise against the 98th percentile so a couple of hot cells do not
  // compress the rest of the scale into one flat shade.
  nonZero.sort((a, b) => a - b)
  const ceiling = nonZero.length
    ? Math.max(1, nonZero[Math.floor(nonZero.length * 0.98)])
    : 1

  return {
    visits,
    grid,
    ceiling,
    playable,
    never,
    pct: playable ? (never / playable) * 100 : 0,
  }
}

/**
 * Rasterise the coverage grid to a canvas for use as a BitmapLayer texture.
 *
 * Uploading a small image rather than drawing one quad per cell lets GPU
 * texture filtering interpolate between cells. That matters for honesty as
 * much as for looks: the 10 m grid is an artefact of how coverage is measured,
 * not a feature of the map, and hard cell edges assert a precision the
 * measurement does not have.
 */
export function coverageTexture({ visits, grid, ceiling }, mode, opacity) {
  const canvas = document.createElement('canvas')
  canvas.width = grid
  canvas.height = grid
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(grid, grid)
  const [r, g, b] = COVERAGE_TINT
  const peak = MAX_ALPHA * opacity

  let any = false
  for (let i = 0; i < grid * grid; i++) {
    const n = visits[i]
    const o = i * 4
    img.data[o] = r
    img.data[o + 1] = g
    img.data[o + 2] = b

    let alpha = 0
    if (n === 0) {
      alpha = peak
    } else if (n > 0 && mode === 'gradient') {
      // Log rather than linear. Traffic is heavily skewed: the median visited
      // cell on Ambrose Valley sees 7 matches against a busiest cell of ~92,
      // so a linear scale would render almost every visited cell as though it
      // were untouched. Log lifts the low end and compresses the peak, which
      // is what makes a genuinely used route look used.
      const covered = Math.min(1, Math.log1p(n) / Math.log1p(ceiling))
      alpha = peak * (1 - covered) ** 1.2
    }

    img.data[o + 3] = Math.round(alpha)
    if (alpha > 2) any = true
  }

  if (!any) return null
  ctx.putImageData(img, 0, 0)
  return canvas
}
