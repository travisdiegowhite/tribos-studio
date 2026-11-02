# Comfort harness — brouter-tribos

Run 2026-11-02 04:04 UTC · BRouter https://brouter.de · 20 generations, 20 level checks · 80 BRouter calls · 2 min

Each generation is one deterministic loop (no AI); every comfort level that maps to the same engine request is validated against that one route. "Pass" means it meets §3 at that level. A route that does not pass would go to the ladder (alternatives or refuse), which this engine does not have yet — so the fail rate is how often today's routing breaks the promise.

## Headline

- **Blocked-class leaks: 17 of 20 level checks (85%).** Target after the ladder: 0.
- Pass rate: 10%.
- No route: 0 of 20 generations.
- Median distance error vs target: 6.7%.

## By comfort level

| Level | Checks | Pass | Has blocked | Median within % | Median unknown % | Median flagged mi | Median blocked mi | No route |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Comfort 2 | 20 | 10% | 85% | 55.5 | 24.9 | 1.15 | 0.34 | 0 |

## Pass rate by area and level

| Area | C2 |
|---|---:|
| urban | 25% |
| suburban | 0% |
| rural-plains | 0% |
| foothills | 0% |
| gravel | 33% |

## Pass rate by distance and surface (all levels)

| Request | Checks | Pass | Has blocked | Median unknown % |
|---|---:|---:|---:|---:|
| 30 mi road | 20 | 10% | 85% | 24.9 |

## Why checks fail

| Failure | Checks |
|---|---:|
| blocked | 17 |
| stretch_too_long | 10 |
| too_much_flagged | 6 |

## Worst blocked stretches (Comfort 2, the default)

| Route | At mi | Length mi | Class | Reasons |
|---|---:|---:|---:|---:|
| lyons 30 mi road | 21.9 | 2.75 | 5 | 60 mph, paved shoulder |
| kiowa 30 mi road | 1.6 | 2.44 | 5 | main highway, 55 mph, no bike lane or shoulder |
| morrison 30 mi road | 7.2 | 2.02 | X | closed to bikes |
| boulder-downtown 30 mi road | 10.1 | 1.96 | 5 | 60 mph, paved shoulder |
| morrison 30 mi road | 20.9 | 1.93 | 5 | 50 mph, no shoulder |
| lyons 30 mi road | 20.6 | 1.14 | 5 | 60 mph, paved shoulder |
| boulder-downtown 30 mi road | 5.7 | 1.13 | X | closed to bikes |
| aurora-southlands 30 mi road | 14.8 | 0.9 | 5 | main highway, no bike lane or shoulder |
| aurora-southlands 30 mi road | 11.3 | 0.78 | 5 | main highway, no bike lane or shoulder |
| kiowa 30 mi road | 9.7 | 0.69 | 5 | main highway, 55 mph, no bike lane or shoulder |
| masonville 30 mi road | 25.2 | 0.59 | 5 | 45 mph, no shoulder |
| masonville 30 mi road | 10 | 0.56 | 5 | 45 mph, no shoulder |

## Tag coverage on ridden miles (Phase 0A, route-corridor view)

Share of ridden miles, by highway class, whose way carries each tag. Taken from the ways matched onto every generated route, so busy and quiet roads count as often as the router uses them.

| highway | Miles | Share | maxspeed | lanes | cycleway* | shoulder* | surface | BRouter traffic class |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| tertiary | 117 | 22% | 31% | 70% | 41% | 1% | 90% | 98% |
| cycleway | 97 | 19% | 5% | 2% | 3% | 2% | 96% | 0% |
| residential | 94 | 18% | 23% | 21% | 12% | 0% | 77% | 4% |
| secondary | 79 | 15% | 53% | 85% | 41% | 0% | 96% | 100% |
| unclassified | 35 | 7% | 12% | 20% | 4% | 0% | 98% | 0% |
| path | 32 | 6% | 0% | 0% | 0% | 0% | 87% | 0% |
| service | 23 | 4% | 3% | 5% | 3% | 0% | 31% | 0% |
| footway | 16 | 3% | 0% | 0% | 1% | 0% | 87% | 0% |
| track | 11 | 2% | 0% | 39% | 0% | 0% | 49% | 0% |
| trunk | 10 | 2% | 89% | 100% | 84% | 2% | 92% | 0% |
| primary | 8 | 2% | 81% | 98% | 28% | 0% | 99% | 100% |
| pedestrian | 1 | 0% | 0% | 100% | 0% | 0% | 100% | 0% |

## Trace fidelity

20 routes that carry the engine's own tags were classified a second time from a BRouter re-ride (the method used for Stadia routes). Median agreement on comfort class: 100.0% of matched miles; median share the re-ride could not confirm (→ unknown): 5.2%.
