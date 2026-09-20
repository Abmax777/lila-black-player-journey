# Architecture

## Stack, and why

| Layer | Choice | Why |
|---|---|---|
| Pipeline | Python + pyarrow, run once offline | 1,243 parquet files are a build-time problem, not a runtime one |
| Rendering | deck.gl 9 (`OrthographicView`) | GPU aggregation means heatmaps recompute per frame, so they answer to filters instead of being baked per view |
| App | React 18 + Vite | Fast builds, no framework tax on a single-screen tool |
| Hosting | Vercel, static | No server, no database, no API, nothing to keep alive |

The dataset is 89,104 rows. That number decided the architecture: it fits in a
browser several times over, so the pipeline runs once and the deployed tool is
a static bundle. A query backend would add cold starts and a failure mode for
no benefit at this scale.

## Data flow

```
1,243 *.nakama-0 (parquet, 34 MB)   3 minimaps (24.4 MB, up to 9000x9000)
            |                                      |
            +---------- pipeline/build.py ---------+
                                |
         normalise -> UV project -> landmass mask -> quantise
                                |
        web/public/data/  (3.17 MB committed to the repo)
          manifest.json    maps, transforms, 96x96 landmask
          matches.json     796 match summaries
          events-<map>.json columnar events, one per map
          maps/<map>.webp  2048px minimaps
                                |
                  fetch on load -> typed arrays
                                |
      one row mask per filter change -> deck.gl layers
```

Events are stored **columnar** (structure-of-arrays plus string tables) rather
than as an array of objects. Repeated match ids, user ids and event names then
appear once each, which is most of why 34 MB of parquet becomes 2.45 MB of JSON.
The browser decodes into typed arrays once at load, so filtering never allocates
per-row objects.

Filters resolve to **two** `Uint8Array` row masks: `dataMask` (what the selection
contains) drives the stats and heatmaps, `displayMask` (that, narrowed by
visibility toggles) drives the path and marker layers. Splitting them is what
stops the stats bar reporting zero samples merely because paths are switched off.

## Coordinate mapping

Each map has a `scale` and an origin. World position projects to normalised UV:

```
u = (x - origin_x) / scale
v = (z - origin_z) / scale
```

Three things matter here.

**Use `x` and `z`, never `y`.** `y` is elevation. Plotting (x, y) produces a
plausible-looking but entirely wrong picture, and it is the single easiest way
to get this whole tool wrong.

**The v flip lives in exactly one place.** Image rows run top-down, world z runs
bottom-up. Rather than flipping in the renderer, the app works in a square world
space where `position = [u * 1000, v * 1000]` and the minimap bitmap is bounded
`[0, 0, 1000, 1000]`. deck.gl draws an image's first row at the upper bound, so
v = 1 lands on image row 0 and the flip is implicit. Nothing downstream needs to
know about it.

**UV is resolution-independent.** The dataset README says the minimaps are
1024x1024; they are 4320x4320, 2160x2158 and 9000x9000. Because the transform
normalises before it pixels, resizing them to 2048px WebP for the web changes
nothing about correctness.

*Verification:* all 89,104 events were plotted over the source art. Points fall
on roads, inside buildings and around POIs, and none land in the ocean. 100% of
events fall within UV [0,1] on all three maps.

## Assumptions and data issues

| What we found | How it was handled |
|---|---|
| `ts` is typed as milliseconds but holds Unix **seconds** — read as declared it yields Jan 1970, and the README calls it match-elapsed time | Read as seconds. Confirmed three ways: it reproduces the stated Feb 10–14 range, the derived UTC date matches the containing folder for 99.51% of rows, and it produces a realistic daily activity curve. UTC is treated as canonical because the folder split is UTC. |
| `event` is parquet binary, not string | Decoded UTF-8 at load |
| `match_id` carries a `.nakama-0` server-instance suffix | Stripped; kept as the display id |
| README says bots emit only `BotPosition`/`BotKill`/`BotKilled`, but 636 `Position` and 115 `Loot` rows carry numeric ids | Human vs bot is decided by `user_id` **shape** (UUID vs numeric), never by event name |
| Minimaps have no alpha; off-map void is opaque black, and so are POI outlines and shadows inside the map | Landmass mask built by flood-filling black inward from the image border, so only void connected to the edge counts as outside |
| 41 events (0.046%) fall outside the drawn landmass — 39 of them clustered off Grand Rift's southern shoreline, 17 of those `Loot` | **Kept and flagged**, not clamped. Loot pickups imply legitimate playable geometry the minimap art does not draw. Clamping would hide a real art-coverage finding. |
| 16 matches contain no human at all, with bots looting and fighting normally | Kept. Most likely server warm-up or a disconnect before the first sample; flagged rather than filtered, since dropping them would quietly change match counts. |
| 23 of 39 storm deaths are not the final event for that player-journey | Unresolved. `KilledByStorm` may be a down rather than a kill. Storm figures are reported as events, not as distinct player deaths. |
| `y` (elevation) is dropped | Gridding each map at ~10 m and regressing `y` on (x, z) gives R² of 0.990 / 0.972 / 0.987. Elevation is terrain, not verticality — two players at the same (x, z) sit within half a metre. With no terrain mesh available, a 3D view would float paths over a flat plane and show the same information less legibly. |

## Tradeoffs

| Decision | Alternative | Why this way |
|---|---|---|
| Precompute offline, ship static | DuckDB/FastAPI query backend | 89k rows fit in the browser; a backend adds cold starts and an outage mode for nothing |
| Heatmaps aggregated live on GPU | Precomputed density rasters | Live aggregation means every heatmap responds to every filter; precomputed ones would only answer the views anticipated at build time |
| Columnar JSON | Parquet via DuckDB-WASM | ~3 MB either way at this scale; JSON needs no WASM runtime and is debuggable by opening the file |
| Commit generated artifacts | Build them on deploy | The brief asks for one repo containing everything; it also keeps the deploy reproducible without the raw dataset |
| Cold spots scored by **distinct matches** | Raw sample counts | Sample counts reward standing still; a designer is asking how many runs came through |
| Aggregate and single-match views take opposite defaults | One uniform default | 566 overlapping journeys are unreadable and hide the map; one journey is worth drawing in full |
| Event identity carried by hue **and** glyph shape | Colour alone | No four-colour set in the validated palette clears the all-pairs CVD gate; death-vs-loot stays in the warning band, so shape, a permanent legend and hover labels carry identity too |

## Known limits

Elevation is unused, so multi-storey interiors collapse to one footprint. There
is no region-level readout, so a hot POI cannot be quantified against its
neighbours. There is no side-by-side comparison between two date ranges, which
is the question live-ops would ask most often. And with 59 matches, Grand Rift's
figures are directional rather than conclusive.
