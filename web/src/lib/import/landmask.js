/**
 * The landmass mask, rebuilt in the browser.
 *
 * A direct port of `landmass_mask` / `coverage_grid` in pipeline/build.py, and
 * it has to stay one: the mask decides which ground counts as playable, so the
 * coverage view and every "never entered" figure rest on it agreeing with the
 * offline build.
 */

const MASK_PX = 1600
const COVERAGE_GRID = 96
const DARK = 18

/**
 * Average the source down to the resolution the mask is computed at.
 *
 * Not `drawImage` into a small canvas: its smoothing is the browser's own, so
 * the same capture could produce a different coastline in a different browser,
 * and a mask that moves between machines is worse than one that merely differs
 * from the offline build. A box average is deterministic everywhere.
 *
 * The source art runs to 9000px, which is 324 MB as RGBA, so it is read in
 * horizontal strips and reduced as it goes rather than decoded whole.
 */
async function toMaskField(blob) {
  const bitmap = await createImageBitmap(blob)
  const { width: sw, height: sh } = bitmap
  const ratio = Math.min(1, MASK_PX / Math.max(sw, sh))
  const width = Math.max(1, Math.round(sw * ratio))
  const height = Math.max(1, Math.round(sh * ratio))

  const mean = new Float32Array(width * height)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const ROWS = 24

  for (let row0 = 0; row0 < height; row0 += ROWS) {
    const row1 = Math.min(height, row0 + ROWS)
    const sy0 = Math.floor((row0 * sh) / height)
    const sy1 = Math.max(Math.floor((row1 * sh) / height), sy0 + 1)
    canvas.width = sw
    canvas.height = sy1 - sy0
    ctx.clearRect(0, 0, sw, sy1 - sy0)
    ctx.drawImage(bitmap, 0, sy0, sw, sy1 - sy0, 0, 0, sw, sy1 - sy0)
    const { data } = ctx.getImageData(0, 0, sw, sy1 - sy0)

    for (let row = row0; row < row1; row++) {
      const y0 = Math.floor((row * sh) / height) - sy0
      const y1 = Math.max(Math.floor(((row + 1) * sh) / height) - sy0, y0 + 1)
      for (let col = 0; col < width; col++) {
        const x0 = Math.floor((col * sw) / width)
        const x1 = Math.max(Math.floor(((col + 1) * sw) / width), x0 + 1)
        let sum = 0
        let count = 0
        for (let y = y0; y < y1; y++) {
          let p = (y * sw + x0) * 4
          for (let x = x0; x < x1; x++, p += 4) {
            sum += (data[p] + data[p + 1] + data[p + 2]) / 3
            count++
          }
        }
        mean[row * width + col] = sum / count
      }
    }
  }
  bitmap.close?.()
  return { mean, width, height }
}

/**
 * True where a pixel is inside the drawn map.
 *
 * The art has no alpha and the off-map void is opaque black, so darkness alone
 * does not identify it -- POI outlines and shadows inside the map are just as
 * dark. Flood from the border instead: dark connected to the edge is outside,
 * dark enclosed by map is not. The pipeline gets this from scipy's connected
 * components; here it is an explicit queue, which avoids recursion depth on a
 * 1600px image.
 */
function floodFromBorder({ mean, width, height }) {
  const dark = new Uint8Array(width * height)
  for (let i = 0; i < dark.length; i++) if (mean[i] < DARK) dark[i] = 1
  const outside = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0
  const push = (i) => {
    if (dark[i] && !outside[i]) { outside[i] = 1; queue[tail++] = i }
  }
  for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x) }
  for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1) }
  while (head < tail) {
    const i = queue[head++]
    const x = i % width
    const y = (i / width) | 0
    if (x > 0) push(i - 1)
    if (x < width - 1) push(i + 1)
    if (y > 0) push(i - width)
    if (y < height - 1) push(i + width)
  }
  const inside = new Uint8Array(width * height)
  for (let i = 0; i < inside.length; i++) inside[i] = outside[i] ? 0 : 1
  return { inside, width, height }
}

/**
 * Downsample to the coarse grid, row-major, row 0 at the TOP of the image.
 * A cell is inside when most of it is, which stops ragged coastlines throwing
 * a fringe of spurious "unused" cells.
 */
function toCoverageGrid({ inside, width, height }, grid = COVERAGE_GRID) {
  const out = new Array(grid * grid)
  for (let row = 0; row < grid; row++) {
    const y0 = Math.floor((row * height) / grid)
    const y1 = Math.max(Math.floor(((row + 1) * height) / grid), y0 + 1)
    for (let col = 0; col < grid; col++) {
      const x0 = Math.floor((col * width) / grid)
      const x1 = Math.max(Math.floor(((col + 1) * width) / grid), x0 + 1)
      let sum = 0
      let count = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) { sum += inside[y * width + x]; count++ }
      }
      out[row * grid + col] = count && sum / count >= 0.5 ? '1' : '0'
    }
  }
  return out.join('')
}

/** Mask plus the coarse grid string, from one minimap image. */
export async function buildLandmask(blob) {
  const mask = floodFromBorder(await toMaskField(blob))
  return { mask, landmask: toCoverageGrid(mask), coverageGrid: COVERAGE_GRID }
}

/** Is this UV inside the drawn map? Mirrors the pipeline's oob test. */
export function insideAt(mask, u, v) {
  const px = Math.min(mask.width - 1, Math.max(0, Math.floor(u * mask.width)))
  const py = Math.min(mask.height - 1, Math.max(0, Math.floor((1 - v) * mask.height)))
  return mask.inside[py * mask.width + px] === 1
}
