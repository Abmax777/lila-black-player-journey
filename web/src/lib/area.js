/**
 * Area Inspector.
 *
 * A heatmap says where players went. It cannot say whether an empty building
 * is empty because it is remote or because everyone walked past the door. That
 * difference decides what a designer does about it, so it is what this
 * measures.
 *
 * The central number is the ratio between runs that ENTERED a region and runs
 * that came WITHIN REACH of it and did not. On Ambrose Valley, 99.2% of
 * never-entered ground has traffic within 50 m, so almost none of its dead
 * space is remote — the reason players skip it is not distance.
 *
 * What this deliberately does not claim: there is no extraction event in the
 * schema, no POI geometry and no loot spawn table, so extraction rates,
 * building entrances and "good loot that nobody collects" are not measurable
 * from this dataset. See ARCHITECTURE.md.
 */

import { WORLD } from './data.js'
import { cellAt } from './cells.js'

/** Sampling interval of the source telemetry, in seconds. */
const SAMPLE_SECONDS = 5
/** How close a run must come to count as having passed by. */
export const NEAR_METRES = 50

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

function inRect(x, y, r) {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1
}

/** Squared distance from a point to a rectangle; zero inside. */
function distSqToRect(x, y, r) {
  const dx = Math.max(r.x0 - x, 0, x - r.x1)
  const dy = Math.max(r.y0 - y, 0, y - r.y1)
  return dx * dx + dy * dy
}

/**
 * @param {Array} journeys  from buildJourneys
 * @param {object} cellIndex from buildCellIndex
 * @param {object} rect     {x0,y0,x1,y1} in world units
 * @param {object} mapMeta  manifest entry (scale, landmask, coverageGrid)
 */
export function analyseArea(journeys, cellIndex, rect, mapMeta) {
  const { grid, landmask, scale } = {
    grid: cellIndex.grid, landmask: mapMeta.landmask, scale: mapMeta.scale,
  }
  const metresPerWorld = scale / WORLD
  const nearWorld = NEAR_METRES / metresPerWorld

  const entered = new Set()
  const passed = new Set()
  const bearings = new Array(8).fill(0)
  const dwellSamples = []
  let humanEntered = 0

  for (const j of journeys) {
    let inside = 0
    let near = false
    let firstIn = -1
    for (let k = 0; k < j.pts.length; k++) {
      const [x, y] = j.pts[k]
      if (inRect(x, y, rect)) {
        inside++
        if (firstIn < 0) firstIn = k
      } else if (!near && distSqToRect(x, y, rect) <= nearWorld * nearWorld) {
        near = true
      }
    }
    if (inside > 0) {
      entered.add(j.matchIx)
      if (j.human) humanEntered++
      dwellSamples.push(inside * SAMPLE_SECONDS)
      // Bearing of the step that crossed in. Map-relative: up on the minimap
      // is +y, which is labelled North.
      if (firstIn > 0) {
        const [px, py] = j.pts[firstIn - 1]
        const [cx, cy] = j.pts[firstIn]
        const angle = Math.atan2(cx - px, cy - py)          // 0 = heading N
        let idx = Math.round((angle / (Math.PI * 2)) * 8)
        idx = ((idx % 8) + 8) % 8
        bearings[idx]++
      }
    } else if (near) {
      passed.add(j.matchIx)
    }
  }

  // Cells covered by the rectangle, and how much of that ground is playable.
  let cells = 0
  let playable = 0
  let unvisited = 0
  let kill = 0
  let death = 0
  let loot = 0
  let storm = 0
  const step = WORLD / grid
  for (let y = rect.y0; y <= rect.y1 + step / 2; y += step) {
    for (let x = rect.x0; x <= rect.x1 + step / 2; x += step) {
      const cell = cellAt(Math.min(x, WORLD - 1e-6), Math.min(y, WORLD - 1e-6), grid)
      cells++
      if (landmask[cell] !== '1') continue
      playable++
      if (cellIndex.visits[cell] === 0) unvisited++
      kill += cellIndex.kill[cell]
      death += cellIndex.death[cell]
      loot += cellIndex.loot[cell]
      storm += cellIndex.storm[cell]
    }
  }

  dwellSamples.sort((a, b) => a - b)
  const median = dwellSamples.length
    ? dwellSamples[Math.floor(dwellSamples.length / 2)]
    : 0

  const enteredN = entered.size
  const passedN = passed.size
  const reach = enteredN + passedN

  const widthM = Math.round((rect.x1 - rect.x0) * metresPerWorld)
  const heightM = Math.round((rect.y1 - rect.y0) * metresPerWorld)

  return {
    widthM,
    heightM,
    playable,
    cells,
    unvisited,
    entered: enteredN,
    passed: passedN,
    // Of every run that came within reach, the share that went in.
    entryRate: reach ? enteredN / reach : null,
    humanEntered,
    medianDwell: median,
    kill,
    death,
    loot,
    storm,
    lootPerRun: enteredN ? loot / enteredN : 0,
    bearings: COMPASS.map((label, i) => ({ label, n: bearings[i] })),
    verdict: verdictFor(enteredN, passedN, playable),
  }
}

/**
 * Bypassed vs remote vs used.
 *
 * "Remote" is a fundamentally different design problem from "bypassed": one is
 * about connectivity, the other about incentive. Saying only "unused" hides
 * which conversation to have.
 */
function verdictFor(entered, passed, playable) {
  if (!playable) return { id: 'offmap', label: 'Not playable ground', detail: 'This selection is outside the drawn map.' }
  if (entered === 0 && passed === 0) {
    return { id: 'remote', label: 'Remote', detail: `No run came within ${NEAR_METRES} m. This is a connectivity question, not an incentive one.` }
  }
  if (entered === 0) {
    return { id: 'bypassed', label: 'Bypassed', detail: `${passed} runs came within ${NEAR_METRES} m and none went in. Distance is not the reason.` }
  }
  const rate = entered / (entered + passed)
  if (rate < 0.25) {
    return { id: 'skipped', label: 'Mostly skipped', detail: `${Math.round(rate * 100)}% of runs that came close went in.` }
  }
  if (rate < 0.6) return { id: 'mixed', label: 'Partly used', detail: `${Math.round(rate * 100)}% of nearby runs went in.` }
  return { id: 'used', label: 'Well used', detail: `${Math.round(rate * 100)}% of nearby runs went in.` }
}
