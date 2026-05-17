# T2.6 Audit Workspace

Working notes for the T2.6 RouterClient + Executor parity audit.

The **formal deliverable** is `docs/t2.6-audit-report.md` at the repo
root. The files in this directory are the evidence trail that backs it.

## Files

| File | What it holds |
|---|---|
| `README.md` | This file. |
| `legacy-vs-new-extraction.md` | Side-by-side comparison of what each provider's legacy module returns vs what the new adapter extracts. The smoking gun for the elevation bug. |
| `routecontext-schema-mismatches.md` | Every Supabase query in `assembleRouteContext.ts`, mapped against actual migrations. Confirms three table/column mismatches. |
| `comparison-runs.md` | Real-API side-by-side runs. **Not executed in this audit** — no API keys in the audit environment. The runner script is in `scripts/audit/t2.6/comparison-runner.ts`; Travis to execute. |
| `geojson/` | Output dir for `comparison-runner.ts` GeoJSON files. Empty until the runner is executed. |

## How to consume the audit

1. Read `docs/t2.6-audit-report.md` for the summary, findings list, and severity ratings.
2. For any finding you want to verify, the linked evidence files in this directory contain the line numbers and exact code references.
3. The proposed fix specs (T2.6.1, T2.6.2, ...) are listed in the report's "Recommended fix sequence" section and are not yet written.

## Methodology

Phase A only — see the report for the rationale on why Phase B was not triggered. The audit pattern was:

1. Read each new provider adapter and its underlying legacy module side-by-side.
2. Enumerate every Supabase query in `assembleRouteContext` and cross-check against `database/migrations/`.
3. Walk the chain from `useAIGeneration` → executor adapter → executor → RouterClient → provider → snapshot back, looking for fields that get silently dropped or never populated.
4. Cross-reference findings against the explicit "preserved behavior" list in `docs/legacy-routing-notes.md`.

## What's intentionally NOT in scope

- Phase B (ConstraintBuilder, MutationHandlers, ManualHandlers, Executor facade internals).
- Real-API runs (requires env access).
- Visual route inspection in geojson.io (depends on runs).
- Production code changes — fixes are separate specs.
