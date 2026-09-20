# Player Journey Explorer — Lila Black

A browser tool for exploring how players actually move through Lila Black's
maps: where they go, where they fight, where they loot, where the storm catches
them, and which ground they never touch at all.

**Live:** https://lila-black-player-journey-two.vercel.app/

Built for the Lila Games Product Engineer written test. See
[ARCHITECTURE.md](ARCHITECTURE.md) for design decisions and
[INSIGHTS.md](INSIGHTS.md) for what the data says.

---

## What it does

- **Traffic, kill, death and loot heatmaps**, rebinned on every filter change
  rather than precomputed per view
- **Coverage view** — playable ground shaded by how many distinct matches
  passed through it, so unwalked ground is what reads rather than what you
  have to notice is missing. Gradient or unvisited-only, with an opacity control
- **Journey paths** for any match, with human players and bots visually separated
- **Event markers** for kills, deaths, loot and storm deaths, each carrying a
  distinct colour *and* glyph shape
- **Filters** by map, day, match, and human/bot
- **Timeline playback** to watch a single match unfold at 1×, 4× or 12×
- **Off-map flagging** for the 41 events that fall outside the drawn landmass

## A five-minute walkthrough

1. **It opens on Ambrose Valley with traffic density.** The hot buildings and the
   cold edges are visible before you touch anything.
2. **Tick "Highlight unused ground."** Coverage shades the map by how many
   runs came through — darkest is untouched. 26.7% of playable Ambrose Valley
   has never been entered across 566 matches, and it's almost all perimeter.
   Switch to "Unvisited only" for the hard edge, or drag the opacity down to
   read the terrain underneath.
3. **Untick Bots.** Unused ground rises from 26.7% to 30.8% — bots reach
   ground players never do, and bot paths are nav-mesh output rather than
   player choice, so this is the figure that describes design intent.
4. **Switch the heatmap to Kills.** Combat concentrates hard in the central
   corridor, not on the flank routes.
5. **Pick a match from the dropdown.** Paths, markers and the timeline appear;
   the view switches from aggregate to single-journey automatically.
6. **Press play.** Watch the run: drop, loot, bot encounters, and — if the match
   runs past eleven minutes — the storm.
7. **Switch to Grand Rift.** 59 matches against Ambrose's 566, and 61% of its
   ground never touched by a human.

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
