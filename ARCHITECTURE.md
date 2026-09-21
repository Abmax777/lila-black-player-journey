# Architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| Pipeline | Python + pyarrow, run once offline | 1,243 parquet files are a build-time problem, not a runtime one |
| Rendering | deck.gl 9 (`OrthographicView`) | One coordinate system for minimap, paths, markers and raster overlays, pan/zoom for free |
| App | React 18 + Vite | Fast builds, no framework tax on a single-screen tool |
| Hosting | Vercel, static | No server, no database, no API, nothing to keep alive |

The dataset is 89,104 rows. That number decided the architecture: it fits in a
browser several times over, so the pipeline runs once and the deployed tool is a
static bundle. A query backend would add cold starts and an outage mode for no
benefit at this scale.

## Data flow

```
1,243 *.nakama-0 (parquet, 34 MB)   3 minimaps (24.4 MB, up to 9000²)
            └──────── pipeline/build.py ────────┘
         normalise → UV project → landmass mask → quantise
                          ↓
   web/public/data/ (3.17 MB, committed)
     manifest.json  transforms + 96² landmask   matches.json  796 summaries
     events-<map>.json  columnar events          maps/<map>.webp  2048px
                          ↓  fetch once → typed arrays
            row masks per filter change → deck.gl layers
```

Events are stored **columnar** (structure-of-arrays plus string tables), so
repeated match ids, user ids and event names appear once each — most of why
34 MB of parquet becomes 2.45 MB of JSON. The browser decodes to typed arrays at
load, so filtering never allocates per-row objects.

Filters resolve to **two** row masks: `dataMask` (what the selection contains)
drives stats, density and coverage; `displayMask` (that, narrowed by visibility
toggles) drives paths and markers. Splitting them stops the stats bar reporting
zero samples merely because a layer is switched off.

## Coordinate mapping

Each map has a `scale` and origin; world position projects to normalised UV:

```
u = (x - origin_x) / scale      v = (z - origin_z) / scale
```

**Use `x` and `z`, never `y`.** `y` is elevation. Plotting (x, y) gives a
plausible-looking but entirely wrong picture — the easiest way to get this tool
wrong.

**The v flip lives in one place.** Image rows run top-down, world z bottom-up.
Rather than flipping in the renderer, the app works in a square world space
where `position = [u·1000, v·1000]` and the bitmap is bounded `[0,0,1000,1000]`.
deck.gl draws an image's first row at the upper bound, so v=1 lands on image row
0 and the flip is implicit.

**UV is resolution-independent.** The dataset README says the minimaps are
1024², they are 4320², 2160×2158 and 9000². Because the transform normalises
before it pixels, resizing to 2048px WebP changes nothing about correctness.

*Verified:* all 89,104 events plotted over the source art fall on roads, inside
buildings and around POIs; none land in the ocean; 100% fall within UV [0,1].

## Assumptions and data issues

| Found | Handled |
|---|---|
| `ts` typed as milliseconds but holding Unix **seconds** — read as declared it yields Jan 1970, and the README calls it match-elapsed time | Read as seconds. Confirmed three ways: reproduces the stated Feb 10–14 range; derived UTC date matches the containing folder for 99.51% of rows; yields a realistic daily activity curve. UTC is canonical because the folder split is UTC |
| `event` is parquet binary, not string | Decoded UTF-8 at load |
| `match_id` carries a `.nakama-0` server-instance suffix | Stripped |
| README says bots emit only `Bot*` events, but 636 `Position` and 115 `Loot` rows carry numeric ids | Human vs bot decided by `user_id` **shape**, never by event name |
| Minimaps have no alpha; off-map void is opaque black — and so are POI outlines and shadows *inside* the map | Landmass mask flood-filled inward from the image border, so only void connected to the edge counts as outside |
| 41 events (0.046%) fall outside the drawn landmass — 39 clustered off Grand Rift's southern shore, 17 of them `Loot` | **Kept and flagged**, not clamped. Loot pickups imply playable geometry the art doesn't draw; clamping would hide a real finding |
| 16 matches contain no human at all, bots looting and fighting normally | Kept and flagged. Likely server warm-up or a disconnect before first sample; dropping them would quietly change match counts |
| 23 of 39 storm deaths are not the final event for that journey | Unresolved — `KilledByStorm` may be a down rather than a kill. Storm figures are reported as events, not distinct deaths |
| `y` (elevation) dropped | Gridding at ~10 m and regressing `y` on (x, z) gives R² of 0.990 / 0.972 / 0.987. Elevation is terrain, not verticality — two players at the same (x, z) sit within half a metre. With no terrain mesh, a 3D view would float paths over a flat plane |

## Tradeoffs

| Decision | Alternative | Why |
|---|---|---|
| Precompute offline, ship static | DuckDB/FastAPI backend | 89k rows fit in the browser; a backend adds cold starts and an outage mode for nothing |
| Density binned on CPU per filter change | deck.gl `HeatmapLayer` | `HeatmapLayer` on deck.gl 9.4 fails to bind its weights texture on some drivers and paints the viewport one blob. It rendered correctly under a software renderer and broke on real hardware. Binning 61k rows takes single-digit ms — deterministic on every GPU, one fewer dependency |
| Columnar JSON | Parquet via DuckDB-WASM | ~3 MB either way; JSON needs no WASM runtime and is debuggable by opening the file |
| A capture is imported in the page | Re-running the pipeline; a server-side ingest | The precompute is right for the shipped data but it is not a tool a designer can use: next week's capture needed Python, a rebuild and a redeploy. The browser reads the parquet with hyparquet in a worker, applies the same four corrections, and builds the same payload shapes the pipeline emits, so filters, overlays and readouts cannot drift between the two paths. Scale and origin come from the capture's own README table -- they are world constants that telemetry cannot reveal, since players never reach a map's exact edges -- and minimap art is matched by its `<MapId>_Minimap` filename, which is what makes a map the tool has never seen work. Checked against the pipeline over the same 45 files: event, match, player, human/bot and out-of-bounds counts identical on all three maps. The landmass mask differs by 2-5 cells in 9,216 (under 0.06%, all coastline) because a browser and PIL disagree about edge pixels when resampling; the downscale is a box average rather than the canvas's own smoothing, so at least the answer is the same in every browser |
| Commit generated artifacts | Build on deploy | The brief asks for one repo containing everything; also keeps the deploy reproducible without the raw dataset |
| Coverage scored by **distinct matches** | Raw sample counts | Sample counts reward standing still; a designer asks how many runs came through |
| Density clipped to the landmass | Unclipped blur | The smoothing kernel spreads density past the coastline, which renders as players having walked on open water. The same mask that powers the coverage view is upsampled and feathered to clip it, so a kernel artefact is not mistaken for a finding |
| Smoothing kernel sized in **metres** | A fixed radius in grid cells | The 220x220 grid spans the normalised map, so one cell is 2.6 m on Grand Rift and 4.5 m on Lockdown -- a constant cell radius smeared a single kill 50-78 m depending on the map, so an area holding two kills looked like fighting spilling well past its edges. Radius is derived from a real distance: 25 m for events, 45 m for movement |
| The surface may only claim what it can support: a cell is drawn only within the smoothing distance of a real event, and nothing is drawn below 20 matches | Cutting cells below 18% of the ceiling; drawing whatever the filter leaves | The old threshold tested *magnitude* while claiming to test *provenance*, which agree only when events are spread evenly — once one cluster dominates, quieter ground fails whether or not real events sit in it, hiding 26% of the cells holding kills on Ambrose Valley and erasing exactly the secondary clusters worth finding. The 20-match ceiling is where the rate stops being stable: 1.48 per 100 matches at twenty, 7.07 at ten, 9.64 at three, since one event's kernel peak does not shrink as matches drop. Below it the overlay is withheld and says why, as `coverage` already does for one match |
| Ramp scaled in **events per 100 m² per 100 matches** | Normalising to the selection's own 99.5th percentile | A relative scale made every reading local — the same colour meant 6.2 kills/100 m² on Ambrose Valley and 1.6 on Lockdown — and rescaled silently whenever a filter changed. It also inverted the finding: Ambrose has 566 matches to Grand Rift's 59, so totals mostly measure how much play was recorded. By total density Ambrose looks 3.3x hotter; per match Grand Rift is 3.1x hotter, which is what "is this a hotspot in a typical match" asks. Ceilings let quiet maps use most of the ramp while only true peaks clip (0-7% of drawn cells), so the legend carries a number rather than "low → high" |
| Coverage as an interpolated raster, log-scaled | One quad per cell, linear | The grid is an artefact of measurement, not a feature of the map. Traffic is heavily skewed — busiest Ambrose cell is entered in 16% of matches, median visited cell in 1.2% — so linear draws used routes as untouched |
| One cell index feeds coverage *and* the hover readout | Separate passes | "31 runs here" is guaranteed to agree with the shading under the cursor — same numbers, not two calculations that can drift |
| Deck remounted on `webglcontextlost` | Letting deck sit on the dead context | A lost context freezes the canvas on its last frame while React keeps updating around it, so the rulers move and the map does not — which reads as "zoom is broken" rather than "the GPU dropped us". A fresh canvas recovers it |
| Magnifier as a second deck.gl view, flipping between the two **top** corners | Upscaling the main canvas; a fixed corner; all four corners | A second view re-renders real layers at higher zoom; upscaling just enlarges the blur. Pinned to one corner it made that corner unreachable: its own hover events report coordinates in its zoomed space, so the shared cursor never saw the real position. Only the top corners are candidates — the zoom toolbox holds bottom-left permanently and the hover readout holds bottom-right for as long as the cursor is on the map, and both paint above the canvas, so a loupe sent there is drawn over |
| Comparison is a second window; its link alone carries the camera (which is the entire point -- a copied share link opens at the default fit, and two windows framed differently are not a comparison) | A split canvas; putting the camera in every link | Every view already rebuilds from its URL, so a second window costs nothing and the designer arranges them to suit their screen. The camera rides only on a comparison link: writing zoom and target on every pan would churn the address bar and lengthen links people paste into chat, but two windows framed on different ground are not a comparison |
| View state in the query string | In-app state only | A designer who finds something must be able to send it; "click these six things" is not a share link |
| Aggregate and single-match views take opposite defaults | One uniform default | 566 overlapping journeys are unreadable and hide the map; one journey is worth drawing in full |

## Accessibility

No four-colour subset of the validated palette clears the all-pairs CVD gate —
death against loot stays in the warning band whichever four are chosen — so
event identity is carried by **glyph shape as well as hue**, the legend is
permanent, and hovering any mark names it.

Map navigation requires neither a scroll wheel nor a steady drag: zoom and fit
are visible buttons, panning works from the arrow keys in every mode, and the
magnifier (`M`) reads dense areas without losing the wider view. `?` lists every
shortcut in-app rather than leaving them in a README nobody opens. Controls are
keyboard reachable with visible focus rings, animation is suppressed under
`prefers-reduced-motion`, and the canvas — opaque to assistive technology by
nature — carries a live text equivalent restating what the current view holds.

One subtlety worth recording: the shortcut handler originally skipped every
`INPUT` to protect text entry, which silenced the shortcuts the moment focus
landed on a radio, checkbox or slider. It now skips only genuine text entry, and
leaves Space and the arrow keys to a focused control that has its own use for
them.

## Known limits

Density and coverage are binned at fixed resolutions (220² and 96²), so past
roughly 4× zoom you see the smoothing rather than finer structure. Elevation is
unused, so multi-storey interiors collapse to one footprint. There is no
region-level readout beyond a single cell, and no side-by-side comparison of two
date ranges — the question live-ops would ask most often. With 59 matches, Grand
Rift's figures are directional rather than conclusive.
