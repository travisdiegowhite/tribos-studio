# Comfort harness — brouter-tribos

Run 2026-11-02 17:31 UTC · BRouter https://brouter.de · 720 generations, 720 level checks · 1438 BRouter calls · 105 min

Each generation is one deterministic loop (no AI); every comfort level that maps to the same engine request is validated against that one route. "Pass" means it meets §3 at that level. A route that does not pass would go to the ladder (alternatives or refuse), which this engine does not have yet — so the fail rate is how often today's routing breaks the promise.

## Headline

- **Blocked-class leaks: 149 of 699 level checks (21%).** Target after the ladder: 0.
- Pass rate: 56%.
- No route: 21 of 720 generations.
- Median distance error vs target: 8.0%.

## By comfort level

| Level | Checks | Pass | Has blocked | Median within % | Median unknown % | Median flagged mi | Median blocked mi | No route |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Comfort 1 | 144 | 25% | 57% | 85.1 | 6.6 | 0.62 | 0.05 | 7 |
| Comfort 2 | 144 | 40% | 47% | 78.7 | 19.1 | 0.02 | 0.00 | 5 |
| Comfort 3 | 144 | 51% | 3% | 71.6 | 19.5 | 0.67 | 0.00 | 3 |
| Comfort 4 | 144 | 60% | 1% | 74.6 | 21.7 | 0.49 | 0.00 | 4 |
| Comfort 5 | 144 | 100% | 0% | 98.2 | 1.9 | 0.00 | 0.00 | 2 |

## Pass rate by area and level

| Area | C1 | C2 | C3 | C4 | C5 |
|---|---:|---:|---:|---:|---:|
| urban | 47% | 63% | 50% | 75% | 100% |
| suburban | 31% | 36% | 43% | 69% | 100% |
| rural-plains | 19% | 44% | 81% | 75% | 100% |
| foothills | 26% | 43% | 41% | 34% | 100% |
| gravel | 8% | 25% | 38% | 46% | 100% |

## Pass rate by distance and surface (all levels)

| Request | Checks | Pass | Has blocked | Median unknown % |
|---|---:|---:|---:|---:|
| 15 mi road | 95 | 69% | 17% | 4.0 |
| 15 mi gravel | 74 | 66% | 20% | 8.3 |
| 30 mi road | 100 | 55% | 23% | 6.5 |
| 30 mi gravel | 80 | 54% | 23% | 10.4 |
| 50 mi road | 99 | 51% | 23% | 9.3 |
| 50 mi gravel | 76 | 42% | 26% | 11.9 |
| 75 mi road | 97 | 56% | 19% | 14.9 |
| 75 mi gravel | 78 | 50% | 21% | 20.8 |

## Why checks fail

| Failure | Checks |
|---|---:|
| stretch_too_long | 221 |
| blocked | 149 |
| too_much_flagged | 81 |

## Worst blocked stretches (Comfort 2, the default)

| Route | At mi | Length mi | Class | Reasons |
|---|---:|---:|---:|---:|
| denver-sloans-lake 75 mi road | 30.4 | 2.14 | 5 | main highway, 55 mph, no bike lane or shoulder |
| louisville-downtown 50 mi gravel | 23.4 | 1.62 | 5 | main highway, 55 mph, no bike lane or shoulder |
| louisville-downtown 50 mi gravel | 30.2 | 1.53 | 5 | main highway, 55 mph, no bike lane or shoulder |
| westminster-sheridan 75 mi gravel | 67.7 | 1.47 | 5 | main highway, 55 mph, no bike lane or shoulder |
| kiowa 30 mi gravel | 58.9 | 1.47 | 5 | main highway, 55 mph, no bike lane or shoulder |
| lyons 75 mi road | 63.5 | 1.46 | 5 | main highway, 50 mph, no bike lane or shoulder |
| louisville-downtown 50 mi road | 38.1 | 1.43 | 5 | main highway, 55 mph, no bike lane or shoulder |
| bennett 15 mi road | 20.8 | 1.34 | 5 | main highway, 55 mph, no bike lane or shoulder |
| bennett 15 mi gravel | 22.1 | 1.34 | 5 | main highway, 55 mph, no bike lane or shoulder |
| masonville 75 mi road | 39.9 | 1.33 | 5 | main highway, no bike lane or shoulder |
| kiowa 50 mi road | 59.6 | 1.33 | 5 | main highway, 55 mph, no bike lane or shoulder |
| kiowa 50 mi gravel | 59.5 | 1.33 | 5 | main highway, 55 mph, no bike lane or shoulder |

## Tag coverage on ridden miles (Phase 0A, route-corridor view)

Share of ridden miles, by highway class, whose way carries each tag. Taken from the ways matched onto every generated route, so busy and quiet roads count as often as the router uses them.

| highway | Miles | Share | maxspeed | lanes | cycleway* | shoulder* | surface | BRouter traffic class |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| cycleway | 6682 | 22% | 5% | 1% | 2% | 0% | 97% | 0% |
| tertiary | 5637 | 18% | 24% | 54% | 23% | 2% | 88% | 98% |
| residential | 5196 | 17% | 13% | 11% | 4% | 0% | 65% | 1% |
| secondary | 3256 | 11% | 45% | 80% | 33% | 0% | 94% | 100% |
| unclassified | 2980 | 10% | 10% | 11% | 1% | 0% | 97% | 2% |
| path | 2630 | 9% | 0% | 0% | 0% | 0% | 84% | 0% |
| track | 1307 | 4% | 1% | 7% | 0% | 0% | 67% | 0% |
| service | 1162 | 4% | 3% | 3% | 1% | 0% | 35% | 0% |
| footway | 927 | 3% | 0% | 0% | 1% | 0% | 79% | 0% |
| primary | 614 | 2% | 73% | 92% | 38% | 1% | 95% | 100% |
| trunk | 315 | 1% | 87% | 100% | 43% | 2% | 92% | 0% |

## No route

| Request | Error |
|---|---:|
| denver-wash-park 75 mi road tribos-road-c1 | brouter 400: operation killed by thread-priority-watchdog after 1 seconds |
| aurora-southlands 75 mi road tribos-road-c2 | brouter 400: operation killed by thread-priority-watchdog after 3 seconds |
| highlands-ranch 75 mi road tribos-road-c1 | brouter 400: operation killed by thread-priority-watchdog after 1 seconds |
| highlands-ranch 15 mi gravel tribos-gravel-c4 | brouter 504: <html>
<head><title>504 Gateway Time-out</title></head>
<body>
<center><h1>504 Gatew |
| lyons 15 mi road tribos-road-c1 | brouter 400: target island detected for section 2 |
| lyons 15 mi road tribos-road-c2 | brouter 400: target island detected for section 2 |
| lyons 15 mi road tribos-road-c3 | brouter 400: target island detected for section 2 |
| lyons 15 mi road tribos-road-c4 | brouter 400: target island detected for section 2 |
| lyons 15 mi road tribos-road-c5 | brouter 400: target island detected for section 2 |
| lyons 15 mi gravel tribos-gravel-c1 | brouter 400: target island detected for section 2 |
| lyons 15 mi gravel tribos-gravel-c2 | brouter 400: target island detected for section 2 |
| lyons 15 mi gravel tribos-gravel-c3 | brouter 400: target island detected for section 2 |
| lyons 15 mi gravel tribos-gravel-c4 | brouter 400: target island detected for section 2 |
| lyons 15 mi gravel tribos-gravel-c5 | brouter 400: target island detected for section 2 |
| lyons 75 mi gravel tribos-gravel-c1 | brouter 400: target island detected for section 1 |
| golden 50 mi road tribos-road-c1 | brouter 400: operation killed by thread-priority-watchdog after 0 seconds |
| golden 50 mi gravel tribos-gravel-c1 | brouter 400: operation killed by thread-priority-watchdog after 1 seconds |
| golden 50 mi gravel tribos-gravel-c2 | brouter 400: operation killed by thread-priority-watchdog after 0 seconds |
| golden 50 mi gravel tribos-gravel-c3 | brouter 400: operation killed by thread-priority-watchdog after 0 seconds |
| golden 50 mi gravel tribos-gravel-c4 | brouter 504: <html>
<head><title>504 Gateway Time-out</title></head>
<body>
<center><h1>504 Gatew |
| golden 75 mi gravel tribos-gravel-c2 | brouter 400: operation killed by thread-priority-watchdog after 2 seconds |

## Diff vs baseline (brouter-tribos, 2026-11-02)

- Blocked-class leaks: 320 → 149
- Now passing: 179 · Now failing: 7
- Mean change in within-comfort %: +12.9 points over 699 matched checks

| Check | Change | Why |
|---|---|---|
| denver-wash-park · 30 · road · 3 | pass → fail | blocked |
| denver-wash-park · 30 · road · 4 | pass → fail | blocked |
| aurora-southlands · 50 · gravel · 3 | pass → fail | stretch_too_long |
| highlands-ranch · 15 · gravel · 4 | pass → no_route |  |
| hygiene · 30 · road · 3 | pass → fail | stretch_too_long |
| golden · 30 · road · 4 | pass → fail | stretch_too_long |
| golden · 75 · gravel · 2 | pass → no_route |  |
