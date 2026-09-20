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

## 2. Nearly a third of Ambrose Valley has never had a player on it

**What caught my eye.** The traffic heatmap has a pronounced hole around the
edge of every map. I built a coverage view to measure it rather than squint at
it: playable ground scored by how many distinct matches passed through each
~10 m cell, measured against a landmass mask so ocean and off-map void are
excluded rather than counted as "ignored".

**The evidence.**

| Map | Human matches | Never had a human on it | Visited by fewer than 5 matches |
|---|---|---|---|
| Ambrose Valley | 553 | **30.8%** | 63.3% |
| Lockdown | 170 | **58.8%** | 85.9% |
| Grand Rift | 57 | **61.0%** | 96.8% |

Counting bot traffic as well, those figures fall to 26.7%, 51.8% and 50.2%.
**Bots consistently reach ground humans never touch** — on Grand Rift the gap is
eleven percentage points. Bot paths are nav-mesh output rather than player
choice, so the humans-only column is the one that describes design intent, and
it is the worse of the two.

The shape matters more than the number: the dead ground is a thick, nearly
continuous band around the perimeter of all three maps, with the interior alive.
Grand Rift's human traffic collapses almost entirely to the Mine Pit corridor.

**Is it actionable, and what moves.** Directly. Two options pointing in opposite
directions, so it is a design decision rather than a fix: shrink the playable
bounds to match observed play and reclaim the art, collision, nav-mesh and
memory budget spent on the rim; or move extraction points and high-value loot
outward to pull traffic into it. Metrics affected: map utilisation percentage,
POI visit distribution, average distance travelled per match, and — if bounds
shrink — streaming and memory budget.

**Why a level designer should care.** The effective playable area is
substantially smaller than the designed one, so POI density is higher in
practice than on the design document and every encounter is happening in a
tighter space than it was balanced for. The perimeter is being paid for in
full — art time, collision, nav mesh, memory — and returning nothing. On
Lockdown and Grand Rift more than half the map is in that category.

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
