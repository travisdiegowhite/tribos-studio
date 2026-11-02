# Comfort harness — brouter-stock

Run 2026-11-02 04:01 UTC · BRouter https://brouter.de · 80 generations, 200 level checks · 362 BRouter calls · 11 min

Each generation is one deterministic loop (no AI); every comfort level that maps to the same engine request is validated against that one route. "Pass" means it meets §3 at that level. A route that does not pass would go to the ladder (alternatives or refuse), which this engine does not have yet — so the fail rate is how often today's routing breaks the promise.

## Headline

- **Blocked-class leaks: 94 of 200 level checks (47%).** Target after the ladder: 0.
- Pass rate: 28%.
- No route: 0 of 80 generations.
- Median distance error vs target: 6.7%.

## By comfort level

| Level | Checks | Pass | Has blocked | Median within % | Median unknown % | Median flagged mi | Median blocked mi | No route |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Comfort 1 | 40 | 0% | 98% | 47.0 | 23.3 | 4.63 | 3.81 | 0 |
| Comfort 2 | 40 | 5% | 93% | 59.0 | 23.3 | 2.58 | 1.10 | 0 |
| Comfort 3 | 40 | 18% | 15% | 54.5 | 28.3 | 4.27 | 0.00 | 0 |
| Comfort 4 | 40 | 35% | 15% | 63.8 | 23.4 | 2.29 | 0.00 | 0 |
| Comfort 5 | 40 | 85% | 15% | 95.5 | 3.6 | 0.00 | 0.00 | 0 |

## Pass rate by area and level

| Area | C1 | C2 | C3 | C4 | C5 |
|---|---:|---:|---:|---:|---:|
| urban | 0% | 0% | 25% | 50% | 88% |
| suburban | 0% | 0% | 20% | 50% | 90% |
| rural-plains | 0% | 13% | 13% | 25% | 100% |
| foothills | 0% | 13% | 13% | 25% | 50% |
| gravel | 0% | 0% | 17% | 17% | 100% |

## Pass rate by distance and surface (all levels)

| Request | Checks | Pass | Has blocked | Median unknown % |
|---|---:|---:|---:|---:|
| 30 mi road | 100 | 34% | 44% | 19.3 |
| 50 mi road | 100 | 23% | 50% | 22.5 |

## Why checks fail

| Failure | Checks |
|---|---:|
| stretch_too_long | 120 |
| blocked | 94 |
| too_much_flagged | 77 |

## Worst blocked stretches (Comfort 2, the default)

| Route | At mi | Length mi | Class | Reasons |
|---|---:|---:|---:|---:|
| golden 50 mi road | 18.1 | 5 | 5 | 50 mph, no shoulder |
| lyons 50 mi road | 31.9 | 4.73 | 5 | 60 mph, paved shoulder |
| lyons 50 mi road | 2.4 | 4.42 | 5 | 60 mph, paved shoulder |
| golden 50 mi road | 36.6 | 4.32 | X | closed to bikes |
| kiowa 50 mi road | 50.4 | 3.71 | 5 | main highway, 55 mph, no bike lane or shoulder |
| hygiene 50 mi road | 34.9 | 3.68 | 5 | 60 mph, paved shoulder |
| morrison 30 mi road | 17.1 | 3.58 | 5 | 50 mph, no shoulder |
| wellington 50 mi road | 21 | 3.51 | 5 | 50 mph, no shoulder |
| denver-sloans-lake 50 mi road | 25.7 | 3.19 | 5 | main highway, 50 mph, no bike lane or shoulder |
| denver-sloans-lake 50 mi road | 21.3 | 2.99 | 5 | main highway, 45 mph, no bike lane or shoulder |
| lyons 30 mi road | 23 | 2.78 | 5 | 60 mph, paved shoulder |
| nederland 50 mi road | 39.3 | 2.5 | 5 | main highway, 50 mph, no bike lane or shoulder |

## Tag coverage on ridden miles (Phase 0A, route-corridor view)

Share of ridden miles, by highway class, whose way carries each tag. Taken from the ways matched onto every generated route, so busy and quiet roads count as often as the router uses them.

| highway | Miles | Share | maxspeed | lanes | cycleway* | shoulder* | surface | BRouter traffic class |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| tertiary | 646 | 22% | 37% | 69% | 42% | 2% | 90% | 97% |
| cycleway | 559 | 19% | 2% | 0% | 3% | 0% | 96% | 0% |
| secondary | 513 | 18% | 60% | 76% | 39% | 0% | 95% | 100% |
| residential | 440 | 15% | 20% | 16% | 12% | 0% | 69% | 2% |
| unclassified | 205 | 7% | 14% | 15% | 5% | 0% | 94% | 0% |
| primary | 130 | 4% | 84% | 95% | 42% | 2% | 94% | 100% |
| path | 115 | 4% | 0% | 0% | 0% | 0% | 78% | 0% |
| trunk | 99 | 3% | 88% | 100% | 76% | 1% | 96% | 0% |
| service | 95 | 3% | 0% | 5% | 2% | 0% | 34% | 0% |
| track | 64 | 2% | 0% | 11% | 0% | 0% | 67% | 0% |
| footway | 55 | 2% | 0% | 0% | 0% | 0% | 86% | 0% |
