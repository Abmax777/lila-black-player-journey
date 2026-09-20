# Three things the data says about Lila Black

All figures come from the five-day dataset (Feb 10–14 2026; 89,104 events, 796
matches, 245 human players) and are reproducible in the deployed tool.

---

## 1. The maps are built for a multiplayer game that isn't being played

**What caught my eye.** I opened the kill heatmap expecting contested zones and
found that human-versus-human combat effectively does not exist.

**The evidence.**

| | |
|---|---|
| Matches with exactly one human | **779 of 796 (97.9%)** |
| Matches with two or more humans | 1 |
| PvP kills in five days | **3** |
| Bot kills in five days | 2,415 |
| Bot-kill to PvP-kill ratio | **805 : 1** |
| Matches with no kill of any kind | 191 (24%) |
| Loot events per kill | 5.3 : 1 |

Select any match in the tool and the roster reads one human and zero to fifteen
bots. The dataset README describes "a match with 10 humans and 40 bots"; the
production data contains no such match.

**Is it actionable, and what moves.** Yes, and it is the most consequential
finding here. Either matchmaking is failing to fill lobbies, or the game is a
single-player PvE experience that is being designed as a PvP one. That is a
question for the studio, not for the data — but until it is answered, level
design work aimed at player-versus-player encounters is being spent on a
situation that arises in 1 match in 796. Metrics affected: lobby fill rate,
time-to-match, PvP encounter rate per session, session length.

**Why a level designer should care.** Most of the craft in an extraction-shooter
map is PvP craft — sightlines that create fair duels, cover spacing for
peek-and-trade, flank routes, third-party angles on a contested POI, loot value
tuned so good drops are worth fighting over. None of that is currently being
exercised. What *is* being exercised is PvE pacing: bot encounter spacing,
readability of approach, and the rhythm of a solo looting run. Those are
different skills applied to different parts of the map, and right now the second
one is carrying the entire player experience.

---

## 2. Every run starts in one of about twenty places, and the rest of the rim is dead

**What caught my eye.** Turning on journey start and end points, the starts did
not scatter — they landed in a handful of tight clusters around the map edge,
while the ends spread right across the interior.

**The evidence.** Taking the first and last movement sample of every human
journey, over a ~10 m grid:

| Map | Human journeys | Distinct start cells | Share of playable ground | Top 10 cells hold |
|---|---|---|---|---|
| Ambrose Valley | 554 | **22** | 0.5% | **81%** of all starts |
| Lockdown | 170 | 21 | 0.5% | 76% |
| Grand Rift | 57 | 16 | 0.4% | 83% |

The funnel is directional. Median distance from map centre is **0.43 for
starts against 0.22 for ends** on Ambrose Valley, and the same inward pattern
holds on all three maps. Players enter at the rim and their runs finish in the
middle.

That explains the other half of the picture. Ground never entered by a human
run is **30.8%** of Ambrose Valley, **58.8%** of Lockdown and **61.0%** of Grand
Rift, and it forms a near-continuous band around the perimeter. The rim is not
uniformly ignored — it has about twenty hot pinpricks on it and nothing in
between, because every run lands at a fixed point and immediately heads inward.
Nobody ever travels laterally around the edge, because there is no reason to.

Counting bot traffic as well, unused ground falls to 26.7%, 51.8% and 50.2%:
**bots consistently reach ground humans never touch**. Bot paths are nav-mesh
output rather than player choice, so the humans-only column is the one that
describes design intent, and it is the worse of the two.

One further detail. Ends are far more dispersed than starts — 286 distinct
cells against 22 on Ambrose Valley, with no clustering at all. If runs were
finishing at fixed extraction points we would expect the ends to cluster the
way the starts do. They do not, which points at most runs ending in death
rather than extraction. The event schema has no `Extract` event to confirm it
either way, which is itself worth raising.

**Is it actionable, and what moves.** Yes, and the lever is not where I first
assumed. Spawns are already on the rim, so adding more will not populate it —
what is missing is any reason to travel *along* it. Options: give the rim
lateral objectives or routes between spawn clusters; move extraction outward so
the run ends where it started rather than in the middle; or accept the observed
shape and shrink the playable bounds, reclaiming the art, collision, nav-mesh
and memory budget the dead band currently costs. Twenty-two start points across
a 900 m map also tightly constrains route variety — worth knowing before
attributing repetitive play to the map layout itself. Metrics affected: map
utilisation, POI visit distribution, route diversity per player, average
distance travelled, and streaming budget if the bounds change.

**Why a level designer should care.** The effective playable area is
substantially smaller than the designed one, so POI density is higher in
practice than on the design document and every encounter happens in a tighter
space than it was balanced for. More than that, the shape of play is fixed
before the player does anything: one of twenty-odd entry points, then inward.
Any design intent that depends on players approaching a POI from an
unpredictable direction is not being tested.

## 3. The storm cannot kill you before minute eleven, and most matches end at six

**What caught my eye.** 39 storm deaths in five days looked implausibly low for
a mechanic the brief calls out by name. Scrubbing a few matches on the timeline
showed why: they all die at roughly the same clock time.

**The evidence.**

| | |
|---|---|
| Storm deaths, all maps, five days | **39** |
| Matches containing one | 39 of 796 (**4.9%**) |
| Storm share of all deaths | 5.3% |
| **Earliest storm death in the dataset** | **655 s (10:55)** |
| Median storm death | 739 s (12:19) |
| **Median match duration** | **382 s (6:22)** |
| Matches ending before the earliest storm death | **656 of 796 (82%)** |
| Matches ending before the median storm death | 732 (92%) |

The storm has a hard floor at about eleven minutes. Four matches in five are
over before it can fire at all. Matches that do contain a storm death run 739 s
at the median against 362 s for those that don't — roughly double.

**Is it actionable, and what moves.** Yes, and it is the cheapest of the three
to act on: it is a timing value, not a geometry change. Pulling the storm
schedule forward so the first lethal ring closes inside the median match
duration would make it a live mechanic for the majority of sessions rather than
a long-tail one. Metrics affected: storm death share of total deaths, median
match duration, extraction success rate, and the distribution of match end
reasons.

**Why a level designer should care.** The storm is the map's tempo instrument.
It is what converts an open space into a sequence of decisions — when to commit
to a POI, which route out, where the pinch will be. If it never closes, the map
is played as an untimed sandbox, and every piece of design that assumes storm
pressure (escape routes, choke timing, extraction point placement relative to
the shrink) is untested in production. It also explains finding 2: with no
inward pressure, nothing ever pushes players off the routes they already prefer,
so the perimeter stays dead.

---

## Also worth flagging

**Players are not coming back.** Unique humans per day run 98 → 80 → 59 → 47
across Feb 10–13 (Feb 14 is a partial day), and only 40 of 245 players appear on
more than one day — a 16% return rate. Matches per day fall 287 → 197 → 162 →
112 over the same window.

**Grand Rift is close to unused.** 59 matches against Ambrose Valley's 566, and
falling faster (24 → 13 → 9 → 5 per day). Combined with 84% of its ground
unvisited, the map is a candidate for rework or removal from rotation.

**There is playable ground the minimap doesn't draw.** 39 events sit outside
Grand Rift's drawn landmass, clustered just off the southern shoreline below
Labour Quarters — and 17 of them are loot pickups. Players cannot loot where they
cannot stand, so either the art is missing a ledge or the collision volume
extends past the intended bounds. Worth a look in-editor; it is visible in the
tool as a white ring around the affected markers.
