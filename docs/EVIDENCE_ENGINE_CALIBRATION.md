# Performance Evidence Engine — Phase 1 Calibration Report

**Date:** 2026-08-02
**Status:** Phase 1 complete — **paused for discussion before Phase 2.**
**Inputs:** cleaned production data only (post 2026-08-02 cleanup: `duplicate_of IS NULL`, non-hidden, read-side sanitizer active). Read-only throughout; no production code, tables, or metric math touched.
**Reproduce:** `scripts/evidence-engine/` (engine + runner + sweep + export SQL).

## Executive summary

The engine was run week-by-week over 104 weeks (2024-08-04 → 2026-08-02).
With the proposed thresholds:

| Metric | Result |
|---|---|
| Verdicts | 32 `ahead` / 41 `consistent` / **1** `behind` / 30 `insufficient_data` |
| `ahead`↔`behind` flip-flops | **0** (3 raw-score sign flips, all absorbed by hysteresis) |
| Ground truth (a): 2025 build (196→231W) | **PASS** — 17 emitted weeks, all `ahead` or `consistent`, zero `behind` |
| Ground truth (b): founding week 2026-07-27 | **PASS** — `ahead`, confidence 0.70, explicit divergence from the model's "fatigued" narrative |
| Signal coverage | PD 52% of weeks, EF 69%, segments 1% |

Founding-week narrative facts, produced entirely from receipts:

> - Best 1-minute power in the last 3 weeks: 414W on 2026-08-02, up 4.3% on your previous 90-day best (397W)
> - Your power-per-heartbeat on steady rides (1.36 W/bpm) sits in the top 25% of every steady ride you've recorded — in summer heat, which usually suppresses it
> - On "1 min Climb 5.4%" (2026-07-27): 6% more power at 13 bpm lower heart rate than your typical run

This is the audit's manual adjudication, automated: model says TFI 49 / FS −13
("moderate base, meaningful fatigue"); the receipts say the athlete is producing
personal-best short power, near-best efficiency in heat, and more segment power
at 13 bpm lower heart rate. Verdict: `ahead`, and the coach can say why in
plain language.

---

## 1. What calibration changed about the design

The first naive run (signals = "output vs own recent baseline", thresholds
guessed) failed both ground truths. Four design changes, each forced by real
data, are the substance of this report:

### 1a. Attempt gating (the core asymmetry mechanism)

A trailing-window power best can trail the 90-day baseline best simply because
no maximal effort happened recently. Without gating, the founding week read
`behind` at 0.85 confidence off "20-min best down 9.8%" — when the athlete
just hadn't done a 20-min test in a heavy block. **Rule:** a duration only
participates in the movement metric if the window best reaches ≥ 90% of the
baseline best (a comparable *attempt*). No attempted durations → the signal
reports "no recent max efforts" (weak-positive nothing-contradicts evidence),
never manufactured decline. The sensitivity sweep validates this is the
load-bearing knob: loosening the gate to 0.88 produces 8 false `behind` weeks;
0.90–0.95 all pass both ground truths.

### 1b. Metric consistency inside every comparison

EF was initially computed as EP÷HR with avg-power fallback. EP coverage is
era-dependent (absent Dec 2024–Apr 2025) and EP ≥ avg power by construction, so
comparisons mixing eras manufactured ±15–20% phantom EF swings. **Rule: EF is
always avg power ÷ avg HR** (as the brief specified); EP is used only to derive
a missing variability index. Generalizable lesson for Phase 2: a signal must
never compare values computed by different methods.

### 1c. Verdict = residual vs the model, not raw trend

November 2025 read `behind` for weeks: power bests −5–7%… while TFI itself fell
50→33. Output declining *in step with* the model is `consistent` — the verdict
must be the residual between demonstrated-output direction and model-implied
direction, per signal, over that signal's own comparison span (see §4).
With the fatigue rule (§4), this is also what makes the founding week land
`ahead` rather than `consistent`.

### 1d. All-time percentile for EF

A gain that is >6 weeks old lives inside the trend baseline and disappears
from a window-vs-baseline delta. The audit's own reasoning ("EF sits at its
all-time best") needs an all-time percentile: window mean vs every prior
qualifying ride (min 20). ≥85th percentile promotes the EF signal to `up`;
≥70th produces a narrative fact. (The founding week sits at the 75th
percentile on the avg-power metric — the audit's "1.40+ all-time best" figure
was EP-based, which reads higher by construction. Receipt wording reflects the
percentile actually measured.)

## 2. The three signals as implemented

### Signal 1 — Power-duration movement (weight 0.4)

Best 1-min / 5-min / 20-min from `power_curve_summary` (already materialized
per ride; no stream reprocessing needed). Trailing 21 days vs the prior 90
days, per-duration attempt gating (§1a), duration weights 0.2 / 0.3 / 0.5
(20-min tracks threshold fitness; 1-min is most motivation-sensitive).
Qualifies with ≥5 baseline + ≥2 window rides carrying curves.
Movement ≥ +2% → up; ≤ −6% → down; else flat.

*Stream-derivation note (brief asked):* per-ride bests are already
materialized, so stored streams were not reprocessed. Coverage gaps are
therefore curve-materialization gaps, not stream-retention gaps — see §7.

### Signal 2 — Efficiency factor trend (weight 0.4)

Qualifying rides: power + HR present, ≥40 min, not trainer, VI ≤ **1.12**
(proposed from the observed steady-ride VI distribution; the sweep shows 1.15
and 1.20 behave identically, while 1.08 guts coverage to 17 ahead-weeks and
drops founding-week confidence to 0.3 — 1.12 sits on the stable plateau).
Rides with *unknown* VI (Dec 2024–Apr 2025 have power+HR but no analytics) are
accepted with a flag and a −0.10 confidence penalty when they exceed half the
window — discarding them blinds the engine through the strongest historical
build. Window = 35 days vs prior 180 days; Δ ≥ +2% → up; ≤ −3% → down.

Confounders, handled explicitly:
- **Heat / season:** an EF *decline* measured across a season boundary
  (hot-months window vs cool baseline or vice versa) is demoted to neutral —
  confounded in both directions. An EF *gain* into the hot season is kept
  (understated if anything). Real per-ride temperature exists only on segment
  traversals today; season = calendar proxy (May–Sep) until weather
  enrichment lands (§7).
- **Indoor:** trainer rides excluded (8 rides total in this dataset).
- **Sparse power:** handled by qualification minima → `insufficient_data`.

### Signal 3 — Repeat segments (weight 0.2, supporting only)

Known constraint confirmed: only 4 segments have ≥3 traversals, all detected
since Oct 2025, and the raw traversal data needs a sanity filter — the
detector emits partial matches with impossible implied speeds (14.8 km in
590 s ≈ 90 km/h) and one segment has 12 power-less traversals with
suspiciously identical durations. **Filter:** power + HR present and implied
speed within 8–45 km/h. Every window traversal is evaluated against the
median of its predecessors (an easy recovery spin must not mask Monday's
strong pass). The fitness signature — faster-or-equal time at ≥3 bpm lower HR,
or ≥3% higher power at equal-or-lower HR, or equal power at lower HR — scores
+1; decline requires *every* evaluated pass to be slower at higher HR; a
max-effort PR (faster at much higher HR) scores 0 by design. The signal
qualified in exactly 1 of 104 weeks — the founding week, where it contributed
the 13-bpm receipt — and the engine degrades gracefully without it.

## 3. Proposed thresholds (complete)

All values live in `DEFAULT_CONFIG` in `evidence-engine.mjs`; the sensitivity
sweep (§6) shows each sits on a plateau, not a knife edge.

| Parameter | Value | Basis |
|---|---|---|
| PD window / baseline | 21 d / 90 d | brief |
| PD attempt ratio | 0.90 | 0.88 produces false behinds; 0.90–0.95 all pass |
| PD up / down | +2% / −6% | −4/−5% create threshold-noise behinds; −6 to −8 stable |
| PD duration weights | 0.2 / 0.3 / 0.5 | aerobic durations dominate |
| PD sample minima | 5 baseline / 2 window rides | below this, single-ride artifacts |
| EF window / baseline | 35 d / 180 d | 28 d and 42 d behave identically |
| EF VI gate | ≤ 1.12 (unknown allowed, flagged) | plateau 1.12–1.20 |
| EF up / down | +2% / −3% | HR noise floor |
| EF all-time percentile | ≥85% promotes; ≥70% is a fact | encodes the audit's reasoning |
| Segment sanity | power+HR, 8–45 km/h implied speed | detector artifacts |
| Segment signature margins | 2% time, 3 bpm, 3% power | below measurement noise otherwise |
| Signal weights | PD 0.4 / EF 0.4 / seg 0.2 | brief: segments supporting |
| Verdict bands | ahead ≥ +0.4, behind ≤ −0.4 | ±0.3 and ±0.5 both pass GTs |
| Hysteresis | direct A↔B flip needs \|score\| ≥ 0.7 | absorbed all 3 raw sign-flips |
| Fatigued FS | ≤ −10 | −8 identical; −15 drops founding week to consistent |

## 4. Verdict semantics: the residual matrix

Per signal, direction (`up`/`flat`/`down`) is compared against the
model-implied direction over the same span (TFI at window-mid vs TFI at
baseline-mid; % on a ≥10 base, absolute otherwise):

| output ↓ / model → | up | flat | down |
|---|---|---|---|
| **up** | 0 | +1 | +1 |
| **flat** | 0 | 0 | +0.5 |
| **down** | −1 | −1 | 0 |

**Fatigue rule:** when the week's FS ≤ −10 the model *itself* predicts
suppressed current output, so expectations shift: `down` → 0 (expected),
`flat` → +0.5 (over-expectation), `up` → +1 (the strongest single observation
the engine can make). This rule, not special-casing, is why the founding week
sides with the athlete.

Signals with no usable direction (PD with no attempts, season-demoted EF)
participate at half weight with value 0 — "observed, nothing contradicts" —
which also guarantees a lone segment can never carry a verdict.
Segments score absolutely (a same-course comparison already embeds its own
baseline). Weighted mean of available residuals → bands → hysteresis.

## 5. Confidence formula

```
conf = 0.35·PDqualified (×0.5 if no attempts)
     + 0.35·EFqualified
     + 0.10·SEGqualified
     + 0.20 if ≥2 qualified signals agree in sign (raw signal scores)
     − 0.15 if qualified signals disagree in sign
     + 0.10 if both primary windows are rich (≥4 rides each)
     − 0.05 if EF window straddles a season boundary
     − 0.10 if >half the EF window rides have unknown VI
clamped to [0, 1]; insufficient_data → 0
```

Agreement is measured on *raw* signal scores, deliberately not on
post-fatigue-adjustment residuals: the fatigue rule is an interpretive layer,
and confidence should reflect signal-level corroboration. The founding week
scores 0.70: both primary signals + segment present and rich, but PD's raw
direction (down) disagrees with EF/segment — honest, and it lands in the
middle wording tier (§8).

## 6. Stability & sensitivity

Zero `ahead`↔`behind` transitions in the final timeline. Three raw-score sign
flips (2026-02-02→09 region and 2026-07-20→27) were all absorbed by the
hysteresis band; each sat within ±0.5 of zero, i.e. threshold noise, not real
change. One-at-a-time perturbation of every key threshold (23 variants):

- **GT(a) passes in all 23 variants.**
- **GT(b) reads `ahead` in 17/23** and degrades only to `consistent` — never
  `behind` — in the 5 boundary variants (tighter PD band −4/−5%, VI 1.08,
  score band ±0.5, fatigued-FS −15).
- Flip-flops: 0 in all variants.

## 7. Data coverage — what the integrations need

| Signal | Weeks available | Dominant gap |
|---|---|---|
| Power-duration | 54/104 (52%) | `power_curve_summary` not materialized for most 2024-Q4–2025-Q2 power rides |
| Efficiency factor | 72/104 (69%) | 2024-Q3 power blackout (3/27 rides with power); May-2025 & May-2026 sparse months |
| Segments | 1/104 (1%) | detection only since Oct 2025; partial-match artifacts; traversal power/HR only since Mar 2026 |

`insufficient_data` (30 weeks) concentrates in: 2024-08→12 (17 weeks — the
pre-power-meter era, correctly blind), 2025-01 & 2025-05 (7 weeks — analytics
gaps), 2026-05 (2 weeks — sparse riding month).

Concrete integration follow-ups (not Phase 2 blockers; they raise coverage):
1. **Backfill `power_curve_summary`** for historical rides with power streams
   (would roughly double PD coverage in 2025).
2. **Backfill `ride_analytics`** (EF/VI) for Dec 2024–Apr 2025 power rides —
   removes the unknown-VI tier entirely.
3. **Segment detector quality:** drop partial matches (implied-speed check at
   write time), always attach power/HR to traversals, and revisit repeatable-
   segment detection density — 4 qualifying segments in 21 months is the
   binding constraint on the third signal.
4. **Weather enrichment** (temperature per activity) would replace the
   calendar-month heat proxy with measured temperature.

## 8. Asymmetry policy (proposal for discussion)

Telling an athlete showing FS −19 "you're actually fine, push on" carries
injury risk; the engine is asymmetric at every layer (attempt gating, heat
demotion of EF declines, decline-needs-unanimity in segments), and the coach
wording adds the final layer:

| Verdict | Confidence | Coach voice |
|---|---|---|
| `ahead` | ≥ 0.7 **and** ≥2 signals agreeing | May soften the model's fatigue narrative: "the evidence says you're absorbing this load better than the numbers suggest" — and may support the athlete's own read when they report feeling strong. Never prescribes extra load; invites: "if you're feeling good, we could…" |
| `ahead` | 0.4 – 0.7 | "Trending well" — receipts framed positively, model narrative unchanged |
| `ahead` | < 0.4 | Receipts only, no verdict language |
| `consistent` | any | Say nothing special (brief: evidence and model agree) |
| `behind` | any | Never scolds. Model stays primary; receipts appear only if the athlete asks why. One `behind` week is noise; the coach reacts only to ≥3 consecutive |
| `insufficient_data` | — | Silent. Optionally, at most once a month: "a steady 40-minute ride with HR would help me read your fitness" |

Hard guards regardless of verdict: never override fatigue language when FS ≤
−30 (the model may be wrong about fitness, but a huge acute spike is real);
never suggest modifying planned workouts in v1 (verdict informs narrative
only, athlete decides).

The founding week under this policy: `ahead` at 0.70 with PD's raw direction
dissenting → middle tier. The coach validates the athlete's feel and shows
the receipts, without prescribing more load. That is the intended behavior
for the first production verdict.

## 9. Full verdict timeline (2024-08 → present)

Verdict/score/conf from the engine; TFI/FS from the cleaned daily series
(week-end value); `diverges` = engine verdict contradicts the model narrative.
PD mv% = attempted-durations weighted movement ("no-max" = qualified, no
attempts); EF Δ% = steady-ride EF vs prior 180 d.

| week | verdict | score | conf | TFI | FS | PD mv% | EF Δ% | seg | diverges |
|---|---|---|---|---|---|---|---|---|---|
| 2024-08-05 | — |  |  | 4 | -7 |  |  |  |  |
| 2024-08-12 | — |  |  | 5 | -10 |  |  |  |  |
| 2024-08-19 | — |  |  | 7 | -11 |  |  |  |  |
| 2024-08-26 | — |  |  | 7 | -7 |  |  |  |  |
| 2024-09-02 | — |  |  | 9 | -11 |  |  |  |  |
| 2024-09-09 | — |  |  | 9 | -5 |  |  |  |  |
| 2024-09-16 | — |  |  | 9 | -3 |  |  |  |  |
| 2024-09-23 | — |  |  | 29 | -59 |  |  |  |  |
| 2024-09-30 | — |  |  | 36 | -53 |  |  |  |  |
| 2024-10-07 | — |  |  | 40 | -38 |  |  |  |  |
| 2024-10-14 | — |  |  | 36 | -5 |  |  |  |  |
| 2024-10-21 | — |  |  | 32 | 13 |  |  |  |  |
| 2024-10-28 | — |  |  | 28 | 20 |  |  |  |  |
| 2024-11-04 | — |  |  | 30 | -4 |  |  |  |  |
| 2024-11-11 | — |  |  | 32 | -8 |  |  |  |  |
| 2024-11-18 | — |  |  | 38 | -21 |  |  |  |  |
| 2024-11-25 | — |  |  | 33 | 8 |  |  |  |  |
| 2024-12-02 | — |  |  | 46 | -33 |  |  |  |  |
| 2024-12-09 | — |  |  | 43 | -5 |  |  |  |  |
| 2024-12-16 | consistent | 0 | 0.2 | 51 | -30 |  | -11.6 |  |  |
| 2024-12-23 | consistent | 0 | 0.2 | 49 | -4 |  | -11.6 |  |  |
| 2024-12-30 | consistent | 0 | 0.2 | 62 | -29 |  | -9.7 |  |  |
| 2025-01-06 | ahead | 0.5 | 0.2 | 81 | -94 |  | 0.8 |  | yes |
| 2025-01-13 | — |  |  | 85 | -54 |  |  |  |  |
| 2025-01-20 | — |  |  | 90 | -36 |  |  |  |  |
| 2025-01-27 | — |  |  | 90 | -4 |  |  |  |  |
| 2025-02-03 | — |  |  | 82 | 18 |  |  |  |  |
| 2025-02-10 | consistent | 0 | 0.25 | 73 | 39 |  | 9.7 |  |  |
| 2025-02-17 | consistent | 0 | 0.25 | 69 | 34 |  | 2.2 |  |  |
| 2025-02-24 | consistent | 0 | 0.25 | 69 | 14 |  | 2.3 |  |  |
| 2025-03-03 | consistent | 0 | 0.25 | 68 | 11 |  | 3.8 |  |  |
| 2025-03-10 | consistent | 0 | 0.25 | 65 | 14 |  | 5.9 |  |  |
| 2025-03-17 | consistent | 0 | 0.25 | 63 | 14 |  | 6.4 |  |  |
| 2025-03-24 | consistent | 0 | 0.25 | 64 | 8 |  | 9.6 |  |  |
| 2025-03-31 | consistent | 0 | 0.25 | 62 | 6 |  | 10.1 |  |  |
| 2025-04-07 | consistent | 0 | 0.25 | 61 | -3 |  | 9.2 |  |  |
| 2025-04-14 | consistent | 0 | 0.25 | 60 | 7 |  | 9.1 |  |  |
| 2025-04-21 | consistent | 0 | 0.25 | 62 | 11 |  | 8.5 |  |  |
| 2025-04-28 | consistent | 0 | 0.25 | 60 | 0 |  | 9 |  |  |
| 2025-05-05 | — |  |  | 56 | 4 |  |  |  |  |
| 2025-05-12 | — |  |  | 54 | 8 |  |  |  |  |
| 2025-05-19 | — |  |  | 52 | 15 |  |  |  |  |
| 2025-05-26 | — |  |  | 50 | 14 |  |  |  |  |
| 2025-06-02 | — |  |  | 55 | -9 |  |  |  |  |
| 2025-06-09 | ahead | 1 | 0.3 | 57 | -9 |  | 13 |  |  |
| 2025-06-16 | ahead | 1 | 0.3 | 59 | -28 |  | 13.4 |  | yes |
| 2025-06-23 | ahead | 1 | 0.3 | 58 | -2 |  | 14.3 |  |  |
| 2025-06-30 | ahead | 1 | 0.95 | 57 | -1 | 8.9 | 15 |  |  |
| 2025-07-07 | consistent | 0 | 0.6 | 52 | 13 | -7.7 | 14.2 |  |  |
| 2025-07-14 | ahead | 0.67 | 0.47 | 49 | 13 | no-max | 13.3 |  |  |
| 2025-07-21 | ahead | 0.67 | 0.57 | 49 | 13 | no-max | 8.3 |  |  |
| 2025-07-28 | ahead | 0.67 | 0.57 | 53 | -5 | no-max | 5 |  |  |
| 2025-08-04 | consistent | -0.25 | 0.75 | 51 | -8 | -8.8 | 1.6 |  |  |
| 2025-08-11 | consistent | 0.25 | 0.75 | 50 | -7 | -8.8 | 0 |  |  |
| 2025-08-18 | ahead | 0.5 | 0.6 | 50 | 12 | -8.8 | 2.8 |  |  |
| 2025-08-25 | ahead | 0.67 | 0.57 | 48 | 4 | no-max | 5.7 |  |  |
| 2025-09-01 | ahead | 0.75 | 0.75 | 46 | 17 | -3.8 | 7.6 |  |  |
| 2025-09-08 | ahead | 0.75 | 0.75 | 44 | 2 | 1 | 8.2 |  |  |
| 2025-09-15 | ahead | 0.75 | 0.75 | 41 | 7 | 1 | 9.3 |  |  |
| 2025-09-22 | ahead | 0.75 | 0.8 | 39 | 7 | 1 | 7.2 |  |  |
| 2025-09-29 | ahead | 1 | 1 | 37 | 8 | 4.5 | 8.8 |  |  |
| 2025-10-06 | ahead | 0.75 | 0.7 | 33 | 15 | -2.4 | 7.5 |  |  |
| 2025-10-13 | ahead | 0.75 | 0.7 | 32 | 8 | -0.1 | 5.1 |  |  |
| 2025-10-20 | ahead | 0.5 | 0.5 | 32 | -3 | -6.9 | 4.5 |  |  |
| 2025-10-27 | consistent | 0.25 | 0.75 | 33 | -7 | -6.5 | 0.6 |  |  |
| 2025-11-03 | consistent | 0.25 | 0.75 | 33 | -11 | -6.2 | -1.8 |  |  |
| 2025-11-10 | ahead | 0.5 | 0.75 | 33 | 2 | -4.2 | -2.3 |  |  |
| 2025-11-17 | consistent | 0.33 | 0.75 | 34 | 2 | -5.6 | -3 |  |  |
| 2025-11-24 | consistent | 0.33 | 0.75 | 34 | -4 | -4.6 | -3.3 |  |  |
| 2025-12-01 | consistent | 0.25 | 0.65 | 30 | 10 | -6.3 | -1.6 |  |  |
| 2025-12-08 | consistent | 0.25 | 0.65 | 30 | 14 | -6.8 | -2.1 |  |  |
| 2025-12-15 | ahead | 0.5 | 0.75 | 31 | 10 | -5.8 | -0.4 |  |  |
| 2025-12-22 | ahead | 0.5 | 0.75 | 34 | -18 | -5.5 | -1 |  | yes |
| 2025-12-29 | ahead | 0.75 | 0.75 | 39 | -30 | -3.1 | 10.7 |  | yes |
| 2026-01-05 | ahead | 0.5 | 0.75 | 39 | 2 | -2.8 | 9.5 |  |  |
| 2026-01-12 | ahead | 0.5 | 0.75 | 37 | 0 | -2.8 | 6.3 |  |  |
| 2026-01-19 | ahead | 0.5 | 0.75 | 35 | 1 | -3.9 | 3.7 |  |  |
| 2026-01-26 | ahead | 1 | 1 | 37 | 3 | 13.9 | 4.2 |  |  |
| 2026-02-02 | consistent | -0.5 | 0.65 | 37 | 1 | 13.9 | -3.6 |  |  |
| 2026-02-09 | ahead | 0.5 | 0.65 | 37 | -10 | 14 | -4.3 |  | yes |
| 2026-02-16 | consistent | 0 | 0.8 | 36 | 2 | -5.3 | -2.8 |  |  |
| 2026-02-23 | consistent | 0 | 0.62 | 38 | 0 | no-max | -0.2 |  |  |
| 2026-03-02 | consistent | 0 | 0.62 | 36 | 4 | no-max | -1.1 |  |  |
| 2026-03-09 | behind | -0.5 | 0.8 | 36 | -5 | -7.4 | -0.7 |  |  |
| 2026-03-16 | consistent | 0.5 | 0.65 | 41 | -27 | -7.4 | 2.3 |  |  |
| 2026-03-23 | ahead | 0.5 | 0.65 | 44 | -29 | -7.4 | 2.5 |  | yes |
| 2026-03-30 | consistent | 0.25 | 0.8 | 44 | -15 | -8.9 | 0.5 |  |  |
| 2026-04-06 | consistent | 0 | 0.62 | 43 | 10 | no-max | 2.4 |  |  |
| 2026-04-13 | consistent | 0 | 0.8 | 43 | 0 | -0.7 | 0.3 |  |  |
| 2026-04-20 | consistent | 0 | 0.8 | 42 | 6 | -0.7 | -0.2 |  |  |
| 2026-04-27 | consistent | 0 | 0.8 | 44 | 7 | -0.7 | -0.9 |  |  |
| 2026-05-04 | consistent | 0 | 0.52 | 40 | 3 | no-max | 2 |  |  |
| 2026-05-11 | consistent | 0 | 0.35 | 43 | 1 |  | 1.3 |  |  |
| 2026-05-18 | — |  |  | 43 | -15 |  |  |  |  |
| 2026-05-25 | — |  |  | 48 | -26 |  |  |  |  |
| 2026-06-01 | ahead | 0.5 | 0.35 | 50 | -10 | -3.6 |  |  | yes |
| 2026-06-08 | ahead | 0.5 | 0.35 | 50 | -18 | -3.6 |  |  | yes |
| 2026-06-15 | ahead | 1 | 0.95 | 50 | -13 | 2.1 | 3.4 |  | yes |
| 2026-06-22 | consistent | 0 | 0.95 | 45 | 16 | 2.1 | 2.9 |  |  |
| 2026-06-29 | consistent | 0 | 0.95 | 45 | 10 | 4.1 | 3.2 |  |  |
| 2026-07-06 | consistent | 0 | 0.75 | 47 | 7 | -2.8 | 1 |  |  |
| 2026-07-13 | consistent | 0 | 0.75 | 43 | 2 | -2.8 | 1 |  |  |
| 2026-07-20 | consistent | 0 | 0.75 | 45 | -1 | -5.4 | 0.5 |  |  |
| 2026-07-27 | ahead | 0.4 | 0.7 | 49 | -13 | -6.3 | 0.6 | 1 | yes |

## 10. Phase 2 design notes (pre-scoped, pending discussion)

- `computeWeekVerdict()` is already pure (data in, verdict out) — the Phase 2
  job wraps it with the same queries as `export-queries.sql`, per athlete,
  strictly per-athlete baselines.
- Storage: `fitness_evidence_weekly (user_id, week)` holding exactly the
  verdict object (verdict, confidence, score, signals JSONB, model_divergence
  JSONB, narrative_facts). No columns on existing metric tables.
- Job: weekly, after the nightly `training_load_daily` recompute; idempotent
  upsert; skip (don't fail) athletes below qualification minima.
- Coach: inject latest verdict + facts + the §8 tier table into the system
  prompt alongside the existing data-correction notice in `api/coach.js`.
- Regression fixtures from this calibration set: founding week (`ahead`),
  2025-03 build week (`consistent`), 2024-10 week (`insufficient_data`),
  2025-11 off-season week (parallel-decline `consistent`/`ahead`-lite), plus
  the sentinel-free invariant (engine only ever sees cleaned inputs).

## 11. Open questions for discussion

1. **Verdict distribution:** 32 `ahead` vs 1 `behind` over two years. The
   asymmetry is by design, but is this the right prior for coach messaging
   frequency, or should the `ahead` wording tiers be tightened further?
2. **`ahead` at low confidence from a single signal** (e.g. 2026-06-01/08,
   conf 0.35, PD-only flat-under-fatigue): keep emitting with receipts-only
   wording, or demote to `consistent` below a confidence floor?
3. **EF metric choice:** avg-power÷HR (consistent, per brief) vs EP÷HR
   (variability-robust, matches stored `ride_analytics.efficiency_factor`,
   but unusable until the §7 backfills land). Proposal: stay on avg-power
   until backfill, then re-calibrate.
4. **Residual reference:** TFI direction is compared span-over-span; an
   absolute TFI→watts transfer model was deliberately avoided in v1. Agree?
5. **Segment signal weight** once detector quality improves — revisit after
   §7 item 3, or keep at 0.2 indefinitely?
