/**
 * Turn a folder the user picked into the same payloads the pipeline emits.
 *
 * The app already knows how to read a manifest, a match index and one columnar
 * payload per map. Rather than teach it a second shape, the import builds those
 * exact structures and hands them over, so every filter, overlay and readout
 * downstream is untouched and cannot drift from the shipped path.
 */
import { decodeMapPayload } from '../data.js'
import { buildLandmask, insideAt } from './landmask.js'
import { parseCalibration, mapIdFromArt } from './readme.js'

const QUANT = 10_000
const MINIMAP_MAX_PX = 2048
const ART_RE = /_Minimap\.(png|jpg|jpeg|webp)$/i

/** "AmbroseValley" -> "Ambrose Valley", for a map we have no label for. */
function labelFor(id) {
  return id.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
}

function relPath(file) {
  return file.webkitRelativePath || file.name
}

/**
 * Sort the picked folder into the three things an import needs.
 *
 * Anything that is not art or markdown is treated as a candidate parquet file:
 * the capture's own files carry no extension, so there is nothing to match on,
 * and a file that turns out not to be parquet is reported rather than assumed
 * away.
 */
export function triage(fileList) {
  const files = Array.from(fileList)
  const art = new Map()
  let readme = null
  const parquet = []
  for (const file of files) {
    const path = relPath(file)
    if (ART_RE.test(path)) {
      const id = mapIdFromArt(path)
      if (id) art.set(id, file)
      continue
    }
    if (/readme\.md$/i.test(path)) { readme = file; continue }
    if (/\.(md|txt|json|csv|zip|pdf|ya?ml)$/i.test(path)) continue
    if (/(^|\/)\./.test(path)) continue
    parquet.push(file)
  }
  return { parquet, art, readme }
}

/** Downscale art for use as a texture; the source runs to 9000px and 21 MB. */
async function toTexture(blob) {
  const bitmap = await createImageBitmap(blob)
  const source = { width: bitmap.width, height: bitmap.height }
  const ratio = Math.min(1, MINIMAP_MAX_PX / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * ratio))
  const h = Math.max(1, Math.round(bitmap.height * ratio))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  const out = await new Promise((res) => canvas.toBlob(res, 'image/webp', 0.88))
  return { url: URL.createObjectURL(out), width: w, height: h, source }
}

function runWorker(files, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = (ev) => {
      if (ev.data.type === 'progress') { onProgress?.(ev.data); return }
      worker.terminate()
      resolve(ev.data)
    }
    worker.onerror = (err) => { worker.terminate(); reject(new Error(err.message || 'worker failed')) }
    worker.postMessage({ files })
  })
}

/**
 * Read a picked folder into decoded map data.
 *
 * Resolves with the maps it could build and, separately, the ones it could
 * not -- a map with telemetry but no art or no calibration is reported by name
 * rather than quietly dropped, because silently showing fewer maps than the
 * capture contains is the worst thing this could do.
 */
export async function importDataset(fileList, onProgress) {
  const { parquet, art, readme } = triage(fileList)
  if (!parquet.length) throw new Error('No data files found in that folder.')

  onProgress?.({ phase: 'reading', done: 0, total: parquet.length })
  const raw = await runWorker(parquet, (p) => onProgress?.({ phase: 'reading', ...p }))
  if (!raw.n) {
    const why = raw.unreadable.length ? ` ${raw.unreadable.length} files could not be read.` : ''
    throw new Error(`No telemetry rows found in that folder.${why}`)
  }

  onProgress?.({ phase: 'calibrating' })
  const calibration = readme ? parseCalibration(await readme.text()) : {}

  const { cols, users, userIsHuman, matches, events, maps } = raw
  const mapRows = maps.map(() => [])
  for (let i = 0; i < raw.n; i++) mapRows[cols.mp[i]].push(i)

  const globalUserIx = new Map(users.map((id, i) => [id, i]))
  const built = {}
  const skipped = []
  const matchIndex = new Map()
  let oobTotal = 0

  for (let mi = 0; mi < maps.length; mi++) {
    const mapId = maps[mi]
    const rows = mapRows[mi]
    const cal = calibration[mapId]
    const artFile = art.get(mapId)
    if (!cal || !artFile) {
      skipped.push({
        mapId,
        events: rows.length,
        reason: !cal && !artFile ? 'no minimap image and no calibration in README.md'
          : !cal ? 'no scale/origin for it in README.md'
            : `no ${mapId}_Minimap image in the folder`,
      })
      continue
    }

    onProgress?.({ phase: 'mask', mapId })
    const [{ mask, landmask, coverageGrid }, texture] = await Promise.all([
      buildLandmask(artFile), toTexture(artFile),
    ])

    // Per-map string tables, matching the pipeline's sorted unique columns.
    const localUsers = [...new Set(rows.map((i) => users[cols.u[i]]))].sort()
    const localMatches = [...new Set(rows.map((i) => matches[cols.m[i]]))].sort()
    const localEvents = [...new Set(rows.map((i) => events[cols.e[i]]))].sort()
    const uIx = new Map(localUsers.map((v, i) => [v, i]))
    const mIx = new Map(localMatches.map((v, i) => [v, i]))
    const eIx = new Map(localEvents.map((v, i) => [v, i]))

    // t ships relative to each match's own start, so playback needs no epoch
    // arithmetic and the numbers stay small.
    const startByMatch = new Map()
    for (const i of rows) {
      const id = matches[cols.m[i]]
      const prev = startByMatch.get(id)
      if (prev === undefined || cols.t[i] < prev) startByMatch.set(id, cols.t[i])
    }

    const out = { m: [], u: [], e: [], x: [], y: [], t: [], o: [] }
    for (const i of rows) {
      const matchId = matches[cols.m[i]]
      // y is elevation, never a map axis: project from x and z only.
      const u = (cols.x[i] - cal.originX) / cal.scale
      const v = (cols.z[i] - cal.originZ) / cal.scale
      const oob = !insideAt(mask, u, v)
      if (oob) oobTotal++
      out.m.push(mIx.get(matchId))
      out.u.push(uIx.get(users[cols.u[i]]))
      out.e.push(eIx.get(events[cols.e[i]]))
      // Not clamped: events off the drawn map are real and are flagged, not hidden.
      out.x.push(Math.round(u * QUANT))
      out.y.push(Math.round(v * QUANT))
      out.t.push(cols.t[i] - startByMatch.get(matchId))
      out.o.push(oob ? 1 : 0)

      let entry = matchIndex.get(matchId)
      if (!entry) {
        entry = {
          id: matchId, map: mapId, start: cols.t[i], end: cols.t[i],
          humans: new Set(), bots: new Set(), counts: {}, oob: 0,
        }
        matchIndex.set(matchId, entry)
      }
      entry.start = Math.min(entry.start, cols.t[i])
      entry.end = Math.max(entry.end, cols.t[i])
      const userId = users[cols.u[i]]
      ;(userIsHuman[cols.u[i]] ? entry.humans : entry.bots).add(userId)
      const name = events[cols.e[i]]
      entry.counts[name] = (entry.counts[name] || 0) + 1
      if (oob) entry.oob++
    }

    built[mapId] = {
      data: decodeMapPayload({
        map: mapId, quant: QUANT, n: rows.length,
        users: localUsers,
        userIsHuman: localUsers.map((id) => userIsHuman[globalUserIx.get(id)]),
        matches: localMatches, events: localEvents, cols: out,
      }),
      meta: {
        id: mapId,
        label: labelFor(mapId),
        scale: cal.scale,
        originX: cal.originX,
        originZ: cal.originZ,
        matches: localMatches.length,
        coverageGrid,
        landmask,
        playableCells: (landmask.match(/1/g) || []).length,
        imageUrl: texture.url,
        width: texture.width,
        height: texture.height,
        sourceWidth: texture.source.width,
        sourceHeight: texture.source.height,
      },
    }
  }

  if (!Object.keys(built).length) {
    throw new Error(
      `Found ${raw.n.toLocaleString()} events but could not build any map: `
      + skipped.map((s) => `${s.mapId} (${s.reason})`).join('; '),
    )
  }

  const matchList = [...matchIndex.values()].map((m) => ({
    id: m.id,
    map: m.map,
    day: new Date(m.start * 1000).toISOString().slice(0, 10),
    start: m.start,
    duration: m.end - m.start,
    humans: [...m.humans].sort(),
    bots: [...m.bots].sort(),
    counts: m.counts,
    oob: m.oob,
  })).sort((a, b) => a.start - b.start)

  const mapsMeta = {}
  for (const [id, v] of Object.entries(built)) mapsMeta[id] = v.meta
  const manifest = {
    generated: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    imported: true,
    maps: mapsMeta,
    totals: {
      events: raw.n,
      matches: matchList.length,
      humans: userIsHuman.filter(Boolean).length,
      bots: userIsHuman.filter((h) => !h).length,
      outOfBounds: oobTotal,
    },
    days: [...new Set(matchList.map((m) => m.day))].sort(),
    eventTypes: [...events].sort(),
  }

  return {
    manifest,
    matches: matchList,
    events: new Map(Object.entries(built).map(([id, v]) => [id, v.data])),
    skipped,
    unreadable: raw.unreadable,
  }
}
