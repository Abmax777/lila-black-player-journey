/**
 * View state in the query string.
 *
 * A designer who finds something wants to send it to someone, and "open the
 * tool, pick Lockdown, untick bots, turn on coverage" is not a way to share a
 * finding. Every filter lives in the URL, so the address bar is the share
 * link and the back button is undo.
 *
 * Kept deliberately terse: short keys, omitted defaults, so a shared link is
 * short enough to paste into Slack without wrapping.
 */

const DEFAULTS = {
  map: 'AmbroseValley',
  days: '',
  match: '',
  hum: 1,
  bot: 1,
  paths: 0,
  marks: 0,
  ends: 0,
  heat: 'traffic',
  cov: 0,
  covMode: 'gradient',
  op: 100,
  ph: '',
}

export function readState() {
  const q = new URLSearchParams(window.location.search)
  const get = (k) => (q.has(k) ? q.get(k) : null)
  const num = (k) => { const v = get(k); return v == null ? null : Number(v) }

  const phase = get('ph')
  const [phStart, phWindow] = phase ? phase.split('-').map(Number) : [0, null]

  return {
    mapId: get('map') ?? DEFAULTS.map,
    days: get('days') ? new Set(get('days').split(',')) : new Set(),
    matchId: get('match') || null,
    showHumans: num('hum') !== 0,
    showBots: num('bot') !== 0,
    showPaths: num('paths') === 1,
    showMarkers: num('marks') === 1,
    showTerminals: num('ends') === 1,
    heatmapMode: get('heat') ?? DEFAULTS.heat,
    showCoverage: num('cov') === 1,
    coverageMode: get('covMode') ?? DEFAULTS.covMode,
    overlayOpacity: (num('op') ?? DEFAULTS.op) / 100,
    phaseStart: Number.isFinite(phStart) ? phStart : 0,
    phaseWindow: Number.isFinite(phWindow) ? phWindow : null,
  }
}

export function writeState(s) {
  const q = new URLSearchParams()
  const put = (k, v) => { if (String(v) !== String(DEFAULTS[k])) q.set(k, v) }

  put('map', s.mapId)
  put('days', [...s.days].sort().join(','))
  put('match', s.matchId ?? '')
  put('hum', s.showHumans ? 1 : 0)
  put('bot', s.showBots ? 1 : 0)
  put('paths', s.showPaths ? 1 : 0)
  put('marks', s.showMarkers ? 1 : 0)
  put('ends', s.showTerminals ? 1 : 0)
  put('heat', s.heatmapMode)
  put('cov', s.showCoverage ? 1 : 0)
  put('covMode', s.coverageMode)
  put('op', Math.round(s.overlayOpacity * 100))
  put('ph', s.phaseWindow ? `${Math.round(s.phaseStart)}-${s.phaseWindow}` : '')

  const qs = q.toString()
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
  window.history.replaceState(null, '', url)
  return window.location.origin + url
}

/**
 * Save the WebGL canvas as a PNG.
 *
 * Requires preserveDrawingBuffer on the deck context, otherwise the buffer is
 * already cleared by the time toDataURL runs and the download is blank.
 */
export function exportCanvas(filename) {
  const canvas = document.querySelector('.canvas-wrap canvas')
  if (!canvas) return false
  const link = document.createElement('a')
  link.download = filename
  link.href = canvas.toDataURL('image/png')
  link.click()
  return true
}
