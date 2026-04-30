# Today View — Codebase Inventory

This directory inventories what data and infrastructure already exist in
`tribos-studio` to support a planned "Today" view (a unified front door
that answers *where, why, and how I'm riding today*).

This is a **research deliverable, not a design**. No UI is proposed and
no new code has been written. Each entry cites the file path, table
name, column name, or function signature it found in the repo as of
2026-04-30.

## Parts

| File | Covers |
|------|--------|
| [`01-workout-and-route.md`](./01-workout-and-route.md) | Today's prescribed workout + today's prescribed route — schemas, hooks, structure shapes, reusable map components |
| [`02-athlete-state-and-plan.md`](./02-athlete-state-and-plan.md) | Freshness inputs (TFI/AFI/FS, RSS, EFI, TWL, TCAS, terrain class) and plan/block context (race goals, phase derivation) |
| [`03-coach-and-conditions.md`](./03-coach-and-conditions.md) | Coach personas, context assembly, Anthropic SDK usage; weather endpoints and location sourcing |
| [`04-gaps.md`](./04-gaps.md) | What does NOT exist yet — split between "data exists, UI/hook gap" and "backend work also needed" |

## Reading the metric column tables

Tribos is mid-rollout of a metric rename described in
`docs/TRIBOS_METRICS_SPECIFICATION.md` and tracked in
`docs/METRICS_ROLLOUT_STATUS.md`. The reader policy from `CLAUDE.md`:

> Code added or modified under `api/` and `src/` should:
> - **Read canonical-first with legacy fallback** (`activity.rss ?? activity.tss`).
> - **Write canonical only** for new writers (legacy columns get NULL).
> - Treat the legacy column names as deprecated.

Throughout these docs, when a table has both columns, both are listed.
The pattern to assume in any new Today-view code is canonical-first
(`tfi`, `afi`, `form_score`, `rss`, `effective_power`, `ride_intensity`,
`weekly_rss`, `avg_effective_power`) with the legacy column as a
fallback (`ctl`, `atl`, `tsb`, `tss`, `normalized_power`,
`intensity_factor`, `weekly_tss`, `avg_normalized_power`).

The DROP migrations for the legacy columns (074–080) are deferred —
do not assume the legacy columns are gone.

## Quick legend

| Canonical | Legacy | Meaning |
|-----------|--------|---------|
| `rss` | `tss` | Ride Stress Score (terrain-adjusted training stress) |
| `tfi` | `ctl` | Training Fitness Index (long-term load EWMA) |
| `afi` | `atl` | Acute Fatigue Index (short-term load EWA) |
| `form_score` | `tsb` | Form Score (yesterday's TFI − yesterday's AFI) |
| `effective_power` | `normalized_power` | EP — 4th-power rolling avg |
| `ride_intensity` | `intensity_factor` | RI = EP / FTP |
| `rss_source` (6-tier) | `tss_source` (4-tier) | `device \| power \| kilojoules \| hr \| rpe \| inferred` (canonical) vs `power \| hr \| rpe \| inferred` (legacy) |

## Source verification

Every file path and column name in these docs was checked against the
working tree at branch `claude/today-view-inventory-Ni2cx`. Where a
claim was inferred (e.g. "persona is likely stored in localStorage"),
it is flagged with "inferred" or a similar hedge.
