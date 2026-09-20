# Player Journey Explorer — Lila Black

A browser tool for exploring how players actually move through Lila Black's
maps: where they go, where they fight, where they loot, where the storm catches
them, and which ground they never touch at all.

**Live:** https://lila-black-player-journey-two.vercel.app/

Built for the Lila Games Product Engineer written test. See
[ARCHITECTURE.md](ARCHITECTURE.md) for design decisions,
[INSIGHTS.md](INSIGHTS.md) for what the data says, and
[ROADMAP.md](ROADMAP.md) for where this goes next and what the telemetry
would need to get there.

---

## What it does

- **Traffic, kill, death and loot heatmaps**, rebinned on every filter change
  rather than precomputed per view
- **Coverage view** — playable ground shaded by how many distinct matches passed
  through it, so unwalked ground is what reads rather than what you have to
  notice is missing. Gradient or unvisited-only, with an opacity control
- **Match-phase scrubber** — pick a time window and apply it to *every* match at
  once: where is everyone between minute 1 and 2, versus minute 10 and 11
- **Journey start and end points**, derived from the first and last sample of
  each run
- **Journey paths** for any match, with human players and bots visually separated
- **Event markers** for kills, deaths, loot and storm deaths, each carrying a
  distinct colour *and* glyph shape
- **Area inspector** — drag a rectangle for entry rate, dwell, loot, combat,
  approach bearings, and a verdict on whether unused ground inside it is
  *bypassed* (traffic passed within 50 m and didn't go in) or simply *remote*
- **Hover readout** — point anywhere and get that cell's numbers: runs through
  it, kills, deaths, loot
- **Magnifier** — a 6× inset that renders the real layers, not upscaled pixels
- **Filters** by map, day, match, and human/bot
- **Timeline playback** to watch a single match unfold at 1×, 4× or 12×
- **Off-map flagging** for the 41 events that fall outside the drawn landmass
- **Shareable links** — every filter lives in the URL — and **PNG export**

## Accessibility

- Zoom in, zoom out and fit are visible buttons, not just scroll-wheel gestures,
  and each has a keyboard shortcut (`+`, `−`, `0`; `M` toggles the magnifier)
- The magnifier exists for reading dense areas without losing the wider view
- Every control is reachable by keyboard with a visible focus ring
- The canvas has a live text equivalent for screen readers, restating what the
  current view contains
- Animation is suppressed under `prefers-reduced-motion`
- Event identity is carried by glyph shape as well as colour, so it survives
  colour-vision deficiency (see ARCHITECTURE.md for the validator results)

## A five-minute walkthrough

1. **It opens on Ambrose Valley with traffic density.** The hot buildings and the
   cold edges are visible before you touch anything.
2. **Tick "Highlight unused ground."** Coverage shades the map by how many runs
   came through — darkest is untouched. 26.7% of playable Ambrose Valley has
   never been entered across 566 matches, and it's almost all perimeter.
3. **Untick Bots.** Unused ground rises to 30.8% — bots reach ground players
   never do, and bot paths are nav-mesh output rather than player choice.
4. **Tick "Journey start & end."** Starts land in about twenty tight clusters on
   the rim; ends spread across the interior. Every run enters at a fixed point
   and heads inward.
5. **Pick a 1-minute phase window and drag it.** At 1:00 there are 561 matches
   spread across every POI. At 10:00 there are 130, converged on one hotspot.
6. **Switch the heatmap to Kills.** Combat concentrates in the central corridor,
   not on the flank routes.
7. **Pick a match, press play.** One run: drop, loot, bot encounters, and — if it
   lasts past eleven minutes — the storm.
8. **Press `I` and drag a box over a quiet building.** Entry rate against
   pass-within-50m tells you whether players skipped it or never got near it.
9. **Hit "Copy link".** The URL carries every filter, so that view is shareable.

## Running it locally

```bash
# 1. Frontend (the committed data is enough to run the app)
cd web
npm install
npm run dev          # http://localhost:5173

# 2. Regenerate the data artifacts (optional — output is committed)
pip install -r pipeline/requirements.txt
python3 pipeline/build.py --data /path/to/player_data
```

`--data` points at the unzipped `player_data` directory — the one containing
`February_10/ … February_14/` and `minimaps/`. The raw dataset is **not** in
this repo; the 3.17 MB of artifacts derived from it are.

No environment variables. No API keys. No backend.

## Deployment

Static build on Vercel.

| Setting | Value |
|---|---|
| Root directory | `web` |
| Framework preset | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |
| Environment variables | none |

## Repository layout

```
pipeline/
  build.py           parquet -> web artifacts (run once; output committed)
  maps.py            map config and the world->UV transform
  requirements.txt
web/
  public/data/       generated artifacts, 3.17 MB
  src/
    lib/data.js      loading and columnar decode
    lib/selectors.js filtering (data mask vs display mask)
    lib/coverage.js  coverage scoring and overlay rasterisation
    lib/palette.js   colour and mark specification
    components/      map canvas, sidebar, timeline, legend, stats, tooltip
ARCHITECTURE.md      design decisions, coordinate mapping, assumptions, tradeoffs
INSIGHTS.md          three findings, with evidence and actions
```

## Stack

Python 3 with pyarrow and Pillow for the pipeline; React 18, Vite 6 and
deck.gl 9 for the app; Vercel for hosting. The whole dataset — 89,104 events
across 796 matches — ships to the browser, so there is no server component.
