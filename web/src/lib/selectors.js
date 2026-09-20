/**
 * Filtering.
 *
 * Two masks are derived from the same filter state:
 *
 *   dataMask     what the current selection contains (day / match / actor /
 *                playback time). Drives the stats bar and the heatmap, so the
 *                numbers stay true regardless of which layers are visible.
 *   displayMask  dataMask narrowed by the visibility toggles (journey paths,
 *                marker categories). Drives the path and marker layers.
 *
 * Splitting them is what stops "Samples: 0" appearing merely because paths
 * happen to be switched off.
 */

/**
 * @param {object} data     decoded map payload
 * @param {string[]} matchDay day string per match index
 * @param {object} f        { days:Set, matchId, showHumans, showBots, timeCutoff, timeWindow }
 * @param {object} [display] { showPaths, categories:Set } - omit for the data mask
 */
export function buildRowMask(data, matchDay, f, display) {
  const mask = new Uint8Array(data.n)
  const matchIndex = f.matchId == null
    ? -1
    : (data.matchIndexById.get(f.matchId) ?? -2)

  for (let i = 0; i < data.n; i++) {
    const m = data.matchIx[i]

    if (matchIndex >= 0) {
      if (m !== matchIndex) continue
    } else if (matchIndex === -2) {
      continue                                   // selected match is on another map
    } else if (f.days.size && !f.days.has(matchDay[m])) {
      continue
    }

    const human = data.isHuman[i] === 1
    if (human ? !f.showHumans : !f.showBots) continue

    if (f.timeCutoff != null && data.t[i] > f.timeCutoff) continue
    // Elapsed-time window, applied across every match at once.
    if (f.timeWindow && (data.t[i] < f.timeWindow[0] || data.t[i] > f.timeWindow[1])) continue

    if (display) {
      if (data.eventIsPosition[data.eventIx[i]]) {
        if (!display.showPaths) continue
      } else {
        const category = data.eventCategory[data.eventIx[i]]
        if (!category || !display.categories.has(category)) continue
      }
    }

    mask[i] = 1
  }
  return mask
}

/** Counts per category plus movement, for the stats bar. */
export function summarise(data, mask) {
  const counts = { kill: 0, death: 0, loot: 0, storm: 0, position: 0, oob: 0 }
  const players = new Set()
  const matches = new Set()
  for (let i = 0; i < data.n; i++) {
    if (!mask[i]) continue
    if (data.eventIsPosition[data.eventIx[i]]) counts.position++
    else {
      const c = data.eventCategory[data.eventIx[i]]
      if (c) counts[c]++
    }
    if (data.oob[i]) counts.oob++
    players.add(data.userIx[i])
    matches.add(data.matchIx[i])
  }
  return { counts, players: players.size, matches: matches.size }
}
