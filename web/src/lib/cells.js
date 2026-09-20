/**
 * Per-cell index over the current selection.
 *
 * One pass produces everything the coverage overlay and the hover readout
 * both need, so pointing at a building and reading "31 runs, 4 kills" is
 * guaranteed to agree with the shading under the cursor -- they are the same
 * numbers, not two independent calculations that might drift apart.
 */

import { WORLD } from './data.js'

export function cellAt(x, y, grid) {
  const col = Math.min(grid - 1, Math.max(0, Math.floor((x / WORLD) * grid)))
  const row = Math.min(grid - 1, Math.max(0, Math.floor(((WORLD - y) / WORLD) * grid)))
  return row * grid + col
}

/**
 * @param {object} data     decoded map payload
 * @param {Uint8Array} mask row mask for the current selection
 * @param {number} grid     cells per axis
 */
export function buildCellIndex(data, mask, grid) {
  const n = grid * grid
  const kill = new Int32Array(n)
  const death = new Int32Array(n)
  const loot = new Int32Array(n)
  const storm = new Int32Array(n)
  const samples = new Int32Array(n)
  const seen = new Map()                 // cell -> Set of match indices

  for (let i = 0; i < data.n; i++) {
    if (!mask[i]) continue
    const cell = cellAt(data.x[i], data.y[i], grid)

    if (data.eventIsPosition[data.eventIx[i]]) {
      samples[cell]++
      let set = seen.get(cell)
      if (!set) { set = new Set(); seen.set(cell, set) }
      set.add(data.matchIx[i])
      continue
    }
    const category = data.eventCategory[data.eventIx[i]]
    if (category === 'kill') kill[cell]++
    else if (category === 'death') death[cell]++
    else if (category === 'loot') loot[cell]++
    else if (category === 'storm') storm[cell]++
  }

  const visits = new Int32Array(n)
  for (const [cell, set] of seen) visits[cell] = set.size

  return { grid, visits, samples, kill, death, loot, storm }
}
