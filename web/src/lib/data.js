/**
 * Data loading and decoding.
 *
 * The pipeline emits columnar JSON (structure-of-arrays plus string tables).
 * This module turns it into typed arrays once, at load, so that filtering and
 * rendering never touch strings or allocate per-row objects.
 */

import { EVENT_CATEGORY, POSITION_EVENTS } from './palette.js'

const BASE = `${import.meta.env.BASE_URL}data`

/** Side length of the square world space every layer draws into. */
export const WORLD = 1000

export async function loadManifest() {
  const [manifest, matches] = await Promise.all([
    fetch(`${BASE}/manifest.json`).then((r) => r.json()),
    fetch(`${BASE}/matches.json`).then((r) => r.json()),
  ])
  return { manifest, matches }
}

/**
 * Fetch and decode one map's event payload.
 *
 * Returns typed arrays in world space, plus per-row lookups the UI needs.
 * Positions are split out from discrete events because they are drawn by
 * different layers and filtered on different axes.
 */
export async function loadMapEvents(mapId) {
  const raw = await fetch(`${BASE}/events-${mapId}.json`).then((r) => r.json())
  const { cols, quant, users, userIsHuman, matches, events } = raw
  const n = raw.n
  const k = WORLD / quant

  const x = new Float32Array(n)
  const y = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    x[i] = cols.x[i] * k
    y[i] = cols.y[i] * k
  }

  // Per-row indices into the string tables.
  const matchIx = Int32Array.from(cols.m)
  const userIx = Int32Array.from(cols.u)
  const eventIx = Int32Array.from(cols.e)
  const t = Int32Array.from(cols.t)
  const oob = Uint8Array.from(cols.o)

  // Resolve the event string table once into category ids and a movement flag.
  const eventCategory = events.map((name) => EVENT_CATEGORY[name] ?? null)
  const eventIsPosition = events.map((name) => POSITION_EVENTS.has(name))

  const isHuman = Uint8Array.from(userIx, (u) => (userIsHuman[u] ? 1 : 0))

  return {
    mapId,
    n,
    x,
    y,
    t,
    oob,
    isHuman,
    matchIx,
    userIx,
    eventIx,
    users,
    userIsHuman,
    matches,
    events,
    eventCategory,
    eventIsPosition,
    matchIndexById: new Map(matches.map((id, i) => [id, i])),
  }
}

/**
 * Movement samples grouped into per-journey polylines, time-ordered.
 *
 * One journey is one player in one match. Samples arrive in file order, which
 * is already per-player and roughly time-ordered, but matches interleave
 * across the map payload, so they are bucketed by (match, user) and sorted.
 *
 * Both the path layer and the area analysis read this, so a route drawn on
 * screen and a route counted in the inspector are the same route.
 */
export function buildJourneys(data, rowMask) {
  const buckets = new Map()
  for (let i = 0; i < data.n; i++) {
    if (!rowMask[i]) continue
    if (!data.eventIsPosition[data.eventIx[i]]) continue
    const key = data.matchIx[i] * 100000 + data.userIx[i]
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = {
        matchIx: data.matchIx[i],
        userIx: data.userIx[i],
        human: data.isHuman[i] === 1,
        pts: [],
      }
      buckets.set(key, bucket)
    }
    bucket.pts.push([data.x[i], data.y[i], data.t[i]])
  }

  const out = []
  for (const bucket of buckets.values()) {
    if (bucket.pts.length < 2) continue
    bucket.pts.sort((a, b) => a[2] - b[2])
    out.push(bucket)
  }
  return out
}

/** Journeys reduced to what PathLayer needs. */
export function buildPaths(data, rowMask) {
  return buildJourneys(data, rowMask).map((j) => ({
    human: j.human,
    path: j.pts.map((p) => [p[0], p[1]]),
  }))
}

/** Discrete (non-movement) events as plain objects, for marker layers. */
export function buildMarkers(data, rowMask) {
  const out = []
  for (let i = 0; i < data.n; i++) {
    if (!rowMask[i]) continue
    const category = data.eventCategory[data.eventIx[i]]
    if (!category) continue
    out.push({
      position: [data.x[i], data.y[i]],
      category,
      event: data.events[data.eventIx[i]],
      user: data.users[data.userIx[i]],
      human: data.isHuman[i] === 1,
      match: data.matches[data.matchIx[i]],
      t: data.t[i],
      oob: data.oob[i] === 1,
    })
  }
  return out
}

/**
 * First and last movement sample of every player-journey.
 *
 * Where a run begins shapes everything downstream -- which POI is reachable
 * first, which direction the map is entered from. Where it ends says whether
 * the player died, extracted, or stopped being sampled.
 *
 * Derived rather than stored: the payload already carries every sample, and a
 * journey's endpoints are just its extremes in `t`.
 */
export function buildTerminals(data, rowMask) {
  const ends = new Map()
  for (let i = 0; i < data.n; i++) {
    if (!rowMask[i]) continue
    if (!data.eventIsPosition[data.eventIx[i]]) continue
    const key = data.matchIx[i] * 100000 + data.userIx[i]
    const entry = ends.get(key)
    if (!entry) {
      ends.set(key, { first: i, last: i })
      continue
    }
    if (data.t[i] < data.t[entry.first]) entry.first = i
    if (data.t[i] > data.t[entry.last]) entry.last = i
  }

  const out = []
  for (const { first, last } of ends.values()) {
    if (first === last) continue                 // a single sample is not a journey
    for (const [i, kind] of [[first, 'entry'], [last, 'exit']]) {
      out.push({
        position: [data.x[i], data.y[i]],
        kind,
        user: data.users[data.userIx[i]],
        human: data.isHuman[i] === 1,
        match: data.matches[data.matchIx[i]],
        t: data.t[i],
      })
    }
  }
  return out
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function formatDay(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', timeZone: 'UTC',
  })
}
