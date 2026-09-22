# Architecture

A Python pipeline (pyarrow) runs once offline; the app is React 18 + Vite on
deck.gl 9 (`OrthographicView`), deployed static on Vercel. No server, no
database, nothing to keep alive.

One number decided that shape: **89,104 rows**. It fits in a browser several
times over, so 1,243 parquet files are a build-time problem rather than a
runtime one. `pipeline/build.py` normalises, projects to UV, traces the landmass
and emits 3.17 MB of columnar JSON — structure-of-arrays plus string tables,
decoded to typed arrays once at load, so filtering never allocates per-row
objects.

## Coordinate mapping

```
u = (x - origin_x) / scale      v = (z - origin_z) / scale
```

**Use `x` and `z`, never `y`.** `y` is elevation; plotting (x, y) gives a
plausible-looking and entirely wrong picture — the easiest way to get this tool
wrong. Scale and origin come from the dataset's README: world constants
telemetry cannot reveal, because players never reach a map's exact edges. The
transform normalises before it pixels, so the README's claim that minimaps are
1024² (they are 4320², 2160×2158 and 9000²) costs nothing, and neither does the
resize to 2048px WebP.

*Verified:* all 89,104 events land on roads, inside buildings and around POIs;
none in the ocean.

## What the data actually was

| Found | Handled |
|---|---|
| `ts` typed as milliseconds but holding Unix **seconds** — read as declared it yields Jan 1970 | Read as seconds. Reproduces the stated Feb 10–14 range, and the derived UTC date matches the containing folder for 99.51% of rows |
| README says bots emit only `Bot*` events; 636 `Position` and 115 `Loot` rows carry numeric ids | Human vs bot decided by `user_id` **shape**, never by event name |
| `event` is parquet binary, not string; `match_id` carries a `.nakama-0` suffix | Decoded as UTF-8; suffix stripped |
| Minimaps have no alpha, and POI outlines *inside* the map are as black as the void outside | Landmass mask flood-filled inward from the image border |
| 41 events (0.046%) fall outside the drawn landmass, 39 off Grand Rift's south shore | **Kept and flagged**, not clamped — loot pickups imply playable geometry the art doesn't draw |
| 16 matches contain no human at all | Kept and flagged; dropping them would quietly change match counts |

## Decisions that mattered

| Decision | Alternative | Why |
|---|---|---|
| Ramp scaled in **events per 100 m² per 100 matches** | The selection's own 99.5th percentile | A relative scale rescaled silently on every filter change, and inverted the finding: Ambrose has 566 matches to Grand Rift's 59, so totals mostly measure how much play was recorded. By total density Ambrose looks 3.3× hotter; per match Grand Rift is 3.1× hotter. The legend now carries a number, not "low → high" |
| A cell is drawn only within the smoothing distance of a real event, and nothing below 20 matches | A magnitude threshold (18% of the ceiling) | That test claimed to check provenance but checked magnitude, so once one cluster dominated, quieter ground failed whether or not real events sat in it — hiding 26% of the cells holding kills on Ambrose. Below 20 matches the per-match rate stops being stable (1.48 per 100 at twenty, 9.64 at three), so the overlay is withheld and says why |
| Density binned on the CPU per filter change | deck.gl `HeatmapLayer` | It fails to bind its weights texture on some drivers and paints the viewport one blob — correct under a software renderer, broken on real hardware. Binning takes single-digit ms and is deterministic on every GPU |
| Smoothing sized in **metres**, clipped to the landmass | A fixed radius in grid cells | One cell is 2.6 m on Grand Rift and 4.5 m on Lockdown, so a constant radius smeared a single kill 50–78 m depending on the map, and blurred past the coastline onto open water |
| A capture can be imported in the page | Re-running the pipeline offline | Otherwise next week's capture needs Python, a rebuild and a redeploy. The browser reads the parquet in a worker and builds the same payloads through the same decoder, so the paths cannot drift — checked against the pipeline, all counts identical on all three maps |
| Coverage scored by **distinct matches** | Raw sample counts | Sample counts reward standing still; a designer asks how many runs came through |
| View state in the query string | In-app state only | "Click these six things" is not a share link |

## Accessibility

No four-colour subset of the palette clears the all-pairs CVD gate, so event
identity is carried by **glyph shape as well as hue**, with a permanent legend.
Navigation never requires a wheel or a steady drag: zoom and fit are buttons,
panning works from the arrow keys, and `?` lists every shortcut in-app.

## Known limits

Density and coverage are binned at fixed resolutions (220² and 96²), so past
roughly 4× zoom you see the smoothing rather than finer structure. Elevation is
unused, so multi-storey interiors collapse to one footprint. There is no
side-by-side comparison of two date ranges — the question live-ops would ask
most often. With 59 matches, Grand Rift's figures are directional rather than
conclusive.
