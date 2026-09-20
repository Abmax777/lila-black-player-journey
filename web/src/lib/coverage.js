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

export const COVERAGE_TINT = [46, 74, 122]
export const COVERAGE_TINT_HEX = '#2e4a7a'
export const MAX_ALPHA = 236
/**
 * Tuned baseline, separate from the user's opacity control.
 *
 * The control is a uniform multiplier on top of this: it scales every cell
 * equally, so it changes how strongly the overlay reads without touching the
 * relative encoding. Which is what makes it safe to expose as a preference —
 * unlike the normalisation, which would change what the picture means.
 */
export const COVERAGE_BASE = 0.65

export const COVERAGE_MODES = {
  gradient: { id: 'gradient', label: 'Coverage', hint: 'Shaded by how many runs came through — darkest is untouched.' },
  unvisited: { id: 'unvisited', label: 'Unvisited only', hint: 'Only ground no run has ever entered.' },
}

/**
 * Apply the landmass mask to a cell index and normalise for display.
 *
 * @param {object} index     from buildCellIndex, at the same grid as landmask
 * @param {string} landmask  flat row-major '0'/'1', row 0 at top of the image
 */
export function computeCoverage(index, landmask) {
  const { grid, visits: raw } = index
  const visits = new Int32Array(grid * grid).fill(-1)   // -1 == not part of the map
  let playable = 0
  let never = 0
  const nonZero = []

  for (let cell = 0; cell < grid * grid; cell++) {
    if (landmask[cell] !== '1') continue
    playable++
    const n = raw[cell]
    visits[cell] = n
    if (n === 0) never++
    else nonZero.push(n)
  }

  nonZero.sort((a, b) => a - b)
  const ceiling = nonZero.length
    ? Math.max(1, nonZero[Math.floor(nonZero.length * 0.98)])
    : 1

  return { visits, grid, ceiling, playable, never, pct: playable ? (never / playable) * 100 : 0 }
}

/**
 * Rasterise the coverage grid to a canvas for use as a BitmapLayer texture.
 *
 * Uploading a small image rather than drawing one quad per cell lets GPU
 * texture filtering interpolate between cells. That matters for honesty as
 * much as for looks: the grid is an artefact of how coverage is measured, not
 * a feature of the map, and hard cell edges assert a precision the
 * measurement does not have.
 */
export function coverageTexture({ visits, grid, ceiling }, mode, opacity) {
  const canvas = document.createElement('canvas')
  canvas.width = grid
  canvas.height = grid
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(grid, grid)
  const [r, g, b] = COVERAGE_TINT
  const peak = MAX_ALPHA * COVERAGE_BASE * opacity

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
