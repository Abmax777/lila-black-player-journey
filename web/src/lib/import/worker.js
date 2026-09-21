/**
 * Parquet ingestion, off the main thread.
 *
 * The shipped payloads are built by pipeline/build.py. This worker is the same
 * job done in the browser so a designer can drop in a new capture without
 * running Python: read every parquet file, apply the four documented format
 * corrections, and hand back dictionary-encoded columns.
 *
 * It deliberately stops at raw world coordinates. Projection needs a per-map
 * scale and origin, and out-of-bounds needs a landmass mask built from the
 * minimap art -- both live on the main thread, so both happen there.
 */
import { parquetReadObjects } from 'hyparquet'

const MATCH_SUFFIX = '.nakama-0'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Intern a string into a table, returning its index. */
function intern(table, index, value) {
  let i = index.get(value)
  if (i === undefined) {
    i = table.length
    table.push(value)
    index.set(value, i)
  }
  return i
}

/**
 * `event` is parquet BYTE_ARRAY with no UTF8 annotation, so a reader may hand
 * back either a string or raw bytes depending on how it treats the column.
 */
function asText(value) {
  if (typeof value === 'string') return value
  if (value instanceof Uint8Array) return new TextDecoder().decode(value)
  if (value == null) return ''
  return String(value)
}

/**
 * `ts` is declared TIMESTAMP_MILLIS but stores Unix SECONDS, which is why a
 * naive reader shows January 1970. Reading it as declared gives a Date whose
 * epoch-millis value is exactly the integer that was stored -- the seconds we
 * want. Same correction the pipeline makes with `.astype("int64")`.
 */
function asSeconds(value) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'bigint') return Number(value)
  return Number(value)
}

/** Python's str.removesuffix: only at the end, never mid-string. */
function stripSuffix(value) {
  return value.endsWith(MATCH_SUFFIX) ? value.slice(0, -MATCH_SUFFIX.length) : value
}

self.onmessage = async (ev) => {
  const { files } = ev.data
  const users = []; const userIx = new Map()
  const matches = []; const matchIx = new Map()
  const events = []; const eventIx = new Map()
  const maps = []; const mapIxTable = new Map()

  const u = []; const m = []; const e = []; const mp = []
  const xs = []; const zs = []; const ts = []
  const unreadable = []

  for (let f = 0; f < files.length; f++) {
    const file = files[f]
    try {
      const buf = await file.arrayBuffer()
      const rows = await parquetReadObjects({ file: buf })
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        const userId = asText(r.user_id)
        // The README says bots emit only Bot* events, but rows disagree; the
        // id's shape is the reliable signal, so identity is decided here and
        // never from the event name.
        u.push(intern(users, userIx, userId))
        m.push(intern(matches, matchIx, stripSuffix(asText(r.match_id))))
        e.push(intern(events, eventIx, asText(r.event)))
        mp.push(intern(maps, mapIxTable, asText(r.map_id)))
        xs.push(Number(r.x))
        zs.push(Number(r.z))
        ts.push(asSeconds(r.ts))
      }
    } catch (err) {
      unreadable.push({ name: file.name, error: String(err && err.message ? err.message : err) })
    }
    if (f % 25 === 0 || f === files.length - 1) {
      self.postMessage({ type: 'progress', done: f + 1, total: files.length, rows: u.length })
    }
  }

  const payload = {
    type: 'done',
    users,
    userIsHuman: users.map((id) => UUID_RE.test(id)),
    matches,
    events,
    maps,
    unreadable,
    n: u.length,
    cols: {
      u: Int32Array.from(u),
      m: Int32Array.from(m),
      e: Int32Array.from(e),
      mp: Int32Array.from(mp),
      x: Float64Array.from(xs),
      z: Float64Array.from(zs),
      t: Float64Array.from(ts),
    },
  }
  self.postMessage(payload, Object.values(payload.cols).map((a) => a.buffer))
}
