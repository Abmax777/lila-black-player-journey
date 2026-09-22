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

## 3. The richest ground is also the safest

**What caught my eye.** Flipping between the loot overlay and the kill overlay,
the two pictures don't line up. In a game built around deciding whether a bag is
worth the risk of carrying it, I expected them to.

**The evidence.** Splitting each map's visited ground into quartiles by loot
picked up per run passing through, then asking what the richest quarter carries:

| | Ambrose Valley | Lockdown | Grand Rift |
|---|---|---|---|
| Share of all loot | **90%** | **83%** | **73%** |
| Share of all combat | 53% | 34% | **17%** |
| Danger vs the poorest quarter | 4.0× | 1.9× | **1.4×** |

If risk tracked reward those first two rows would be close together. They are
not, and the gap widens on exactly the maps that are played least. On Grand Rift
the richest quarter of the ground yields three quarters of everything picked up
while carrying one sixth of the fighting — it is, in effect, a free supermarket.

Across the bottom half of every map, loot per visit is exactly zero. That ground
is crossed, not looted: players walk it to get somewhere, and nothing happens to
them on the way.

Two honest limits on this. "Richest" means number of pickups, because the data
carries no rarity or value. And almost all combat is against bots, so "danger"
here means bot pressure rather than other players.

**Is it actionable, and what moves.** Yes, and the lever is encounter placement
rather than layout — which makes it cheap. Bot patrols and spawns are evidently
not positioned relative to loot value; they are spread across ground that has
nothing on it. Weighting bot presence toward the high-yield quarter, or thinning
the loot that sits in undefended cells, would restore the risk/reward decision
without moving a single wall. The richest quarter is already known per map and
visible in the tool by switching between the loot and kill overlays. Metrics
affected: loot picked up per encounter, share of runs that end with no contact
at all, time-to-first-contact, and extraction rate as a function of loot
carried.

**Why a level designer should care.** The decision an extraction shooter is
built on is "is this worth it" — and that decision only exists where reward and
danger sit in the same place. Here they don't, so the optimal play is simply to
walk to the rich quarter, fill a bag unopposed, and leave. Every other system in
the map — cover spacing, sightlines into a POI, escape routes — is tuned for a
tension that the current encounter placement never creates. It also compounds
finding 2: with no storm pressure closing in and no danger attached to reward,
there is nothing in the match asking a player to hurry or to choose.

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
