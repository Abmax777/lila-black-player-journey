# Where this goes next

The tool currently answers **what happened**. The version after it should answer
**why**. This is the progression I'd follow, and — as important — what this
dataset can and cannot support at each stage.

## The progression

**V1 — Observe** *(built)* Where did players go? Density surfaces, coverage,
journeys, events, playback, phase windows.

**V2 — Understand** *(Area Inspector built; flow corridors next)* What happened
there? Select a region and get entry rate, dwell, loot, combat, approach
bearings. Next: aggregate journeys into **flow corridors** — a directed grid
graph with thickness as volume — because hundreds of individual paths become
spaghetti, and a designer needs dominant routes, bottlenecks and abandoned
routes rather than every trace.

**V3 — Diagnose** *(partly built)* What is being bypassed or overused? The
bypassed-versus-remote verdict is in. Next: **decision points** — cells where
outgoing direction diverges sharply — to show where a route actually forks.

**V4 — Compare** Did a level change alter behaviour? Two selections side by
side, same metrics, differences highlighted.

**V5 — Investigate** Surface the unusual automatically, each finding linking to
the place on the map it describes.

Throughout, the map stays the primary interface. The workflow is *see something
odd → click it → understand it → decide*, which a wall of charts does not serve.

## What the dataset would need first

Several natural features are blocked not by effort but by what the telemetry
contains. Worth stating plainly, because building them on this data would
produce confident nonsense.

| Feature | Blocker |
|---|---|
| Extraction rate, "funnel to extraction", extraction-point analysis | **There is no extraction event.** The schema has 8 event types; none is `Extract`. In an extraction shooter, not one extraction is observable. Journey ends are dispersed across 286 cells on Ambrose Valley with no clustering, which is itself evidence most runs end in death rather than extraction — but it stays inference. |
| Click a POI; "the main entrance faces north" | No POI polygons and no building footprints. Rectangle selection is the available substitute. |
| "Good loot here but nobody collects it" | We have loot *pickups*, not loot *spawns*. An unvisited area has zero pickups by construction, so the question is circular on this data. A spawn table would resolve it. |
| Flag water, cliffs and hazards as intentionally low-traffic | No terrain semantics. Only colour heuristics over the minimap art, which is too fragile to base a verdict on. |
| Before/after level comparison | One build, five days, and declining volume. A comparison would measure engagement decay, not design change. Needs a build identifier per match. |
| Hesitation timing at decision points | Positions sample every 5 s. A player can enter a building, loot and leave between two samples. Corridor-scale divergence is measurable; sub-5s behaviour is not. |
| Vertical play — upper floors, overpasses | Elevation is present but is 97–99% explained by (x, z): it is terrain, not verticality. Needs either denser sampling near structures or a terrain mesh. |

## Two cheap additions to the telemetry that would unlock the most

1. **An `Extract` event** with position and time. It would turn every "run ended
   here" into "succeeded here" or "died here", which is the difference between
   measuring frustration and measuring flow.
2. **A build or map-version id per match.** Without it, no before/after question
   can be asked at all — which is the question a level designer asks most often
   after shipping a change.
