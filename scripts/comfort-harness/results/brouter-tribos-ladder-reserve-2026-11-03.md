# Comfort ladder — brouter-tribos

Run 2026-11-03 02:20 UTC · BRouter https://brouter.de · 180 plans (0 errored, excluded) · budget 12 calls · nearby-start search on · 52 min

Each plan is `planComfortRoute` for one start × distance × surface × level: ok (the route passes), alternatives (up to 3, each passing at its own level) or refused. Acceptance (spec §5): every returned route passes at the level it is shown for.

## Headline

- **Returned routes breaking the rules: 0.** Target 0.
- ok 45% · alternatives 38% · refused 17%.
- Rider gets something to ride at their level (ok, or a same-level alternative): 72%.
- Median calls per plan: 5.5 (max 12); median latency 10 s.

## By comfort level

| Level | Plans | ok | Alternatives | Refused | Same-level ride | Median within % (ok) | Median calls |
|---|---:|---:|---:|---:|---:|---:|---:|
| Comfort 1 | 36 | 17% | 39% | 44% | 42% | 98.3 | 8 |
| Comfort 2 | 36 | 31% | 42% | 28% | 61% | 95.9 | 7.5 |
| Comfort 3 | 36 | 44% | 44% | 11% | 75% | 91.6 | 6 |
| Comfort 4 | 36 | 56% | 42% | 3% | 81% | 65.7 | 2 |
| Comfort 5 | 36 | 78% | 22% | 0% | 100% | 97.9 | 1.5 |

## By area (all levels)

| Area | Plans | ok | Alternatives | Refused |
|---|---:|---:|---:|---:|
| urban | 20 | 50% | 45% | 5% |
| suburban | 50 | 56% | 30% | 14% |
| rural-plains | 40 | 48% | 43% | 10% |
| foothills | 40 | 40% | 30% | 30% |
| gravel | 30 | 27% | 50% | 23% |

## Alternatives offered

| Kind | Offered | Median within % |
|---|---:|---:|
| distance | 35 | 85.1 |
| shape | 33 | 86 |
| comfort_up | 37 | 91.9 |

## Refusals

31 refused: 0 with a nearby start, 2 with a shorter loop, 29 with neither.

| Plan | Nearby start | Shorter loop | Calls |
|---|---:|---:|---:|
| fort-collins-oldtown 30 mi road C1 | – | – | 12 |
| westminster-sheridan 30 mi road C1 | – | – | 12 |
| westminster-sheridan 30 mi gravel C1 | – | – | 12 |
| aurora-southlands 30 mi road C1 | – | – | 12 |
| erie 30 mi road C1 | – | – | 12 |
| erie 30 mi road C2 | – | – | 12 |
| erie 30 mi gravel C1 | – | – | 12 |
| erie 30 mi gravel C2 | – | – | 12 |
| platteville 30 mi road C1 | – | – | 12 |
| platteville 30 mi gravel C1 | – | – | 12 |
| bennett 30 mi road C1 | – | 23.3 mi | 12 |
| bennett 30 mi road C2 | – | 21.1 mi | 12 |
| lyons 30 mi road C1 | – | – | 12 |
| lyons 30 mi road C2 | – | – | 12 |
| lyons 30 mi road C3 | – | – | 12 |
| lyons 30 mi gravel C1 | – | – | 12 |
| lyons 30 mi gravel C2 | – | – | 12 |
| lyons 30 mi gravel C3 | – | – | 12 |
| morrison 30 mi road C1 | – | – | 12 |
| morrison 30 mi road C2 | – | – | 12 |
| morrison 30 mi road C4 | – | – | 12 |
| morrison 30 mi gravel C1 | – | – | 12 |
| morrison 30 mi gravel C2 | – | – | 12 |
| nederland 30 mi gravel C1 | – | – | 12 |
| masonville 30 mi gravel C2 | – | – | 12 |
| kiowa 30 mi road C1 | – | – | 12 |
| kiowa 30 mi road C2 | – | – | 12 |
| kiowa 30 mi road C3 | – | – | 12 |
| kiowa 30 mi gravel C1 | – | – | 12 |
| kiowa 30 mi gravel C2 | – | – | 12 |
| kiowa 30 mi gravel C3 | – | – | 12 |

## Diff vs baseline (2026-11-03)

7 plans changed outcome.

| Plan | Change |
|---|---:|
| bennett · 30 · road · 1 | alternatives → refused |
| bennett · 30 · road · 2 | alternatives → refused |
| morrison · 30 · road · 4 | alternatives → refused |
| nederland · 30 · gravel · 1 | alternatives → refused |
| masonville · 30 · road · 1 | refused → alternatives |
| masonville · 30 · road · 2 | refused → alternatives |
| masonville · 30 · gravel · 1 | refused → alternatives |