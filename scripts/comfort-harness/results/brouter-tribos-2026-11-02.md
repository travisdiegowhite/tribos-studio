# Comfort harness — brouter-tribos

Run 2026-11-02 03:49 UTC · BRouter https://brouter.de · 432 generations, 720 level checks · 829 BRouter calls · 41 min

Each generation is one deterministic loop (no AI); every comfort level that maps to the same engine request is validated against that one route. "Pass" means it meets §3 at that level. A route that does not pass would go to the ladder (alternatives or refuse), which this engine does not have yet — so the fail rate is how often today's routing breaks the promise.

## Headline

- **Blocked-class leaks: 320 of 710 level checks (45%).** Target after the ladder: 0.
- Pass rate: 30%.
- No route: 6 of 432 generations.
- Median distance error vs target: 6.7%.

## By comfort level

| Level | Checks | Pass | Has blocked | Median within % | Median unknown % | Median flagged mi | Median blocked mi | No route |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Comfort 1 | 144 | 1% | 92% | 46.3 | 25.0 | 4.75 | 2.26 | 2 |
| Comfort 2 | 144 | 9% | 85% | 59.0 | 25.0 | 1.70 | 0.57 | 2 |
| Comfort 3 | 144 | 22% | 15% | 58.5 | 28.0 | 2.88 | 0.00 | 2 |
| Comfort 4 | 144 | 36% | 16% | 66.1 | 22.9 | 2.06 | 0.00 | 2 |
| Comfort 5 | 144 | 84% | 16% | 96.6 | 1.7 | 0.00 | 0.00 | 2 |

## Pass rate by area and level

| Area | C1 | C2 | C3 | C4 | C5 |
|---|---:|---:|---:|---:|---:|
| urban | 6% | 13% | 25% | 50% | 94% |
| suburban | 3% | 5% | 20% | 45% | 93% |
| rural-plains | 0% | 16% | 34% | 38% | 91% |
| foothills | 0% | 3% | 7% | 20% | 50% |
| gravel | 0% | 13% | 25% | 29% | 96% |

## Pass rate by distance and surface (all levels)

| Request | Checks | Pass | Has blocked | Median unknown % |
|---|---:|---:|---:|---:|
| 15 mi road | 95 | 41% | 40% | 13.9 |
| 15 mi gravel | 75 | 40% | 47% | 17.2 |
| 30 mi road | 100 | 36% | 41% | 17.4 |
| 30 mi gravel | 80 | 28% | 43% | 18.1 |
| 50 mi road | 100 | 26% | 47% | 23.7 |
| 50 mi gravel | 80 | 25% | 51% | 21.4 |
| 75 mi road | 100 | 22% | 46% | 24.2 |
| 75 mi gravel | 80 | 26% | 48% | 28.7 |

## Why checks fail

| Failure | Checks |
|---|---:|
| stretch_too_long | 402 |
| blocked | 320 |
| too_much_flagged | 251 |

## Worst blocked stretches (Comfort 2, the default)

| Route | At mi | Length mi | Class | Reasons |
|---|---:|---:|---:|---:|
| nederland 75 mi gravel | 33.7 | 9.59 | X | closed to bikes |
| nederland 75 mi road | 26.6 | 8.09 | X | closed to bikes |
| lyons 50 mi gravel | 40.8 | 6.7 | X | closed to bikes |
| hygiene 75 mi road | 10.7 | 5.34 | 5 | main highway, 45 mph, no bike lane or shoulder |
| hygiene 75 mi road | 24.8 | 4.93 | 5 | main highway, 35 mph, no bike lane or shoulder |
| lyons 75 mi gravel | 6.5 | 4.9 | X | closed to bikes |
| nederland 50 mi road | 17.7 | 4.82 | X | closed to bikes |
| golden 50 mi gravel | 32.3 | 4.31 | X | closed to bikes |
| lyons 75 mi road | 6.6 | 3.93 | X | closed to bikes |
| lyons 50 mi road | 41 | 3.83 | X | closed to bikes |
| wellington 50 mi gravel | 22.7 | 3.51 | 5 | 50 mph, no shoulder |
| lyons 75 mi road | 40.2 | 3.4 | 5 | 45 mph, no shoulder |

## Tag coverage on ridden miles (Phase 0A, route-corridor view)

Share of ridden miles, by highway class, whose way carries each tag. Taken from the ways matched onto every generated route, so busy and quiet roads count as often as the router uses them.

| highway | Miles | Share | maxspeed | lanes | cycleway* | shoulder* | surface | BRouter traffic class |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| tertiary | 3926 | 24% | 31% | 59% | 29% | 1% | 88% | 97% |
| cycleway | 2984 | 18% | 3% | 1% | 2% | 0% | 96% | 0% |
| secondary | 2543 | 15% | 54% | 81% | 35% | 0% | 94% | 100% |
| residential | 2277 | 14% | 17% | 12% | 7% | 0% | 62% | 2% |
| unclassified | 1699 | 10% | 11% | 13% | 3% | 0% | 96% | 2% |
| path | 1080 | 7% | 0% | 0% | 0% | 0% | 81% | 0% |
| track | 493 | 3% | 0% | 10% | 0% | 0% | 64% | 0% |
| service | 476 | 3% | 2% | 5% | 2% | 0% | 40% | 0% |
| primary | 407 | 2% | 72% | 93% | 30% | 1% | 96% | 100% |
| footway | 351 | 2% | 0% | 0% | 1% | 0% | 86% | 0% |
| trunk | 288 | 2% | 90% | 100% | 45% | 1% | 95% | 0% |

## No route

| Request | Error |
|---|---:|
| lyons 15 mi road tribos-road-0 | brouter 400: target island detected for section 2 |
| lyons 15 mi road tribos-road-1 | brouter 400: target island detected for section 2 |
| lyons 15 mi road tribos-road-2 | brouter 400: target island detected for section 2 |
| lyons 15 mi gravel tribos-gravel-0 | brouter 400: target island detected for section 2 |
| lyons 15 mi gravel tribos-gravel-1 | brouter 400: target island detected for section 2 |
| lyons 15 mi gravel tribos-gravel-2 | brouter 400: target island detected for section 2 |
