/**
 * Calibration from the dataset's own README.
 *
 * Scale and origin are game-world constants; they cannot be recovered from
 * telemetry, because players never visit the exact edges of a map. The dataset
 * ships them in a markdown table, which is where maps.py got them, so a new
 * capture that follows the same format calibrates itself.
 *
 *   | Map | Scale | Origin X | Origin Z |
 *   |-----|-------|----------|----------|
 *   | AmbroseValley | 900 | -370 | -473 |
 */
export function parseCalibration(text) {
  const out = {}
  const rows = text.split('\n')
  for (const line of rows) {
    if (!line.trim().startsWith('|')) continue
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean)
    if (cells.length < 4) continue
    const [id, scale, originX, originZ] = cells
    const nums = [scale, originX, originZ].map(Number)
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(id)) continue
    if (nums.some((n) => !Number.isFinite(n)) || nums[0] === 0) continue
    out[id] = { scale: nums[0], originX: nums[1], originZ: nums[2] }
  }
  return out
}

/** `AmbroseValley_Minimap.png` -> `AmbroseValley`. */
export function mapIdFromArt(filename) {
  const base = filename.split('/').pop()
  const m = base.match(/^(.+?)_Minimap\.[a-z]+$/i)
  return m ? m[1] : null
}
