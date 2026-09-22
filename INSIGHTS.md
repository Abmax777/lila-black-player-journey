# Three things the data says about Lila Black

All figures come from the five-day dataset (Feb 10–14 2026; 89,104 events, 796
matches, 245 human players) and are reproducible in the deployed tool.

---

## 1. Every run starts in one of about twenty places, and the rest of the rim is dead

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

And the dead ground is not remote ground. Measuring how much traffic came
within 50 m of each never-entered cell:

| Map | Never entered | Remote (no traffic within 50 m) | **Bypassed** |
|---|---|---|---|
| Ambrose Valley | 30.8% | **0.8%** | **99.2%** |
| Lockdown | 58.8% | 32.1% | 67.9% |
| Grand Rift | 61.0% | 0% | 100% |

On Ambrose Valley players walk within 50 m of **99.2%** of the ground they never
enter, and 34.5% of unvisited cells have 5% or more of all matches passing that
close. Distance is not why they skip it. Lockdown is the counter-case — a third
of its dead ground genuinely is remote — and the two need opposite fixes:
connectivity for one, incentive for the other.

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

## 2. The storm cannot kill you before minute eleven, and most runs are over at six

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
| **Median run length** | **382 s (6:22)** |
| Runs ending before the earliest storm death | **656 of 796 (82%)** |
| Runs ending before the median storm death | 732 (92%) |

The storm has a hard floor at about eleven minutes. Four runs in five are over
before it can fire at all. Runs that do contain a storm death last 739 s at the
median against 362 s for those that don't — roughly double.

A note on what is being measured. The capture holds one participant's telemetry
for 744 of 796 matches, so these spans are how long a *run* lasted, not how long
the match ran — matches where more than one participant was captured span 8.6
min at the median against 6.2 min for the rest. The finding is unaffected, since
a storm that fires at 11 minutes cannot reach a player who left at 6, but the
figures describe runs and are written that way.

**Is it actionable, and what moves.** Yes, and it is the cheapest of the three
to act on: it is a timing value, not a geometry change. Pulling the storm
schedule forward so the first lethal ring closes inside the median run
length would make it a live mechanic for the majority of sessions rather than
a long-tail one. Metrics affected: storm death share of total deaths, median run
length, extraction success rate, and the distribution of match end
reasons.

**Why a level designer should care.** The storm is the map's tempo instrument.
It is what converts an open space into a sequence of decisions — when to commit
to a POI, which route out, where the pinch will be. If it never closes, the map
is played as an untimed sandbox, and every piece of design that assumes storm
pressure (escape routes, choke timing, extraction point placement relative to
the shrink) is untested in production. It also explains finding 1: with no
inward pressure, nothing ever pushes players off the routes they already prefer,
so the perimeter stays dead.

---

## 3. The map that plays tightest is the one nobody is on

**What caught my eye.** Grand Rift looked like the throwaway map — 59 matches
against Ambrose Valley's 566, 7.4% of everything played. Then I put the kill
overlay on an absolute scale and switched between maps, and Grand Rift was
visibly the hottest of the three. The old relative scale had been hiding it by
normalising every map to its own maximum.

**The evidence.**

| | Ambrose Valley | Grand Rift | Lockdown |
|---|---|---|---|
| Matches | 566 | **59** | 171 |
| Playable ground | 392,800 m² | **139,400 m²** | 486,700 m² |
| Kills per match | 3.18 | 3.27 | 2.49 |
| **Kills per match per 100 m²** | 0.00081 | **0.00235** | 0.00051 |
| Loot per match | 17.6 | 14.9 | 12.0 |
| Ground humans never enter | 30.8% | 61.0% | 58.8% |

Fighting per match is near-flat across all three maps — roughly three kills a
match wherever you play. What differs is the ground it happens on. Grand Rift is
36% of Ambrose Valley's playable area, so the same three kills land in a third
of the space: **2.9× the encounter density of Ambrose Valley and 4.6×
Lockdown's**. It is not a more violent map, it is a smaller one, and that is the
whole difference.

It is also the map falling out of rotation fastest, at 24 → 13 → 9 → 5 matches
per day across the window.

**Is it actionable, and what moves.** Yes, and the lever is area rather than
content. The studio already owns a map that produces encounters at three times
the rate of its flagship, and the mechanism is not a clever layout — it is
simply less ground per player. Before reworking Grand Rift, it is worth asking
the opposite question: whether Ambrose Valley and Lockdown are too large for the
number of players actually in them, and whether a shrunk playable area would buy
the encounter density that a storm schedule change (finding 2) is also trying to
buy. Metrics affected: encounters per session, time-to-first-contact, share of
match spent without contact, map selection rate.

**Why a level designer should care.** Density of incident is the thing a player
actually feels, and it is a function of area per player rather than of what is
placed in the area. Grand Rift is the natural experiment: same mode, same bots,
same loot rhythm, a third of the ground, three times the contact. That makes it
the most useful map in the set for calibration and the least useful one to
delete — which is the decision its play rate would otherwise invite.

---

## Also worth flagging

**Players are not coming back.** Unique humans per day run 98 → 80 → 59 → 47
across Feb 10–13 (Feb 14 is a partial day), and only 40 of 245 players appear on
more than one day — a 16% return rate. Matches per day fall 287 → 197 → 162 →
112 over the same window.

**There is playable ground the minimap doesn't draw.** 39 events sit outside
Grand Rift's drawn landmass, clustered just off the southern shoreline below
Labour Quarters — and 17 of them are loot pickups. Players cannot loot where they
cannot stand, so either the art is missing a ledge or the collision volume
extends past the intended bounds. Worth a look in-editor; it is visible in the
tool as a white ring around the affected markers.
