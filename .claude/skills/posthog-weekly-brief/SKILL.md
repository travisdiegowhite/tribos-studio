---
name: posthog-weekly-brief
description: Generate the weekly PostHog insights brief for tribos.studio - queries last week vs the prior week, writes docs/weekly-updates/YYYY-MM-DD-posthog.md, and opens a single-file PR. Use when asked for the "weekly posthog brief" or "weekly insights".
---

# Weekly PostHog Insights Brief

Produce a comparable, low-ceremony weekly analytics brief. Follow the steps
exactly — the queries are fixed on purpose so week-over-week numbers are
comparable.

## 1. Compute the window

- **This week** = the most recent full Monday–Sunday week (UTC).
- **Last week** = the week before it.
- The brief is named for the Monday **after** "this week" (i.e. today's Monday
  if run on schedule): `docs/weekly-updates/YYYY-MM-DD-posthog.md`.

## 2. Read context

Read `docs/posthog-event-catalog.md` for event names and quirks. Key rules:
count generations with `*generation_started` (never `generation_routing_called`),
union v1 (`route_builder_*`) + v2 (`rb2_*`) families separately, ignore the dead
`today_view.*` family, and report absolute counts (n < 20 comparisons are noise).

## 3. Run the fixed query set

Load PostHog tools via ToolSearch (query "posthog"). Run each HogQL query twice
(this week, last week) unless it groups by week itself. Template queries — keep
the event lists in sync with the catalog:

**a. Generation volume + success rate, per builder**
```sql
SELECT event, count(), count(DISTINCT distinct_id)
FROM events
WHERE timestamp >= '<week_start>' AND timestamp < '<week_end>'
  AND event IN ('rb2_generation_started','rb2_generation_completed','rb2_generation_failed',
                'route_builder_generation_started','route_builder_generation_completed',
                'route_builder_generation_failed')
GROUP BY event
```
Success rate = completed / started, per builder.

**b. Save funnel, per builder (unique sessions)**
```sql
SELECT event, count(DISTINCT JSONExtractString(properties, 'session_id'))
FROM events
WHERE timestamp >= '<week_start>' AND timestamp < '<week_end>'
  AND event IN ('rb2_generation_completed','rb2_route_saved',
                'route_builder_generation_completed','route_builder_suggestion_selected',
                'route_builder_route_saved')
GROUP BY event
```
v1 funnel: generation_completed → suggestion_selected → route_saved.
v2 funnel: generation_completed → route_saved (no selection step).

**c. v1 abandonment** — `route_builder_generation_abandoned` count + `reason`
breakdown. rb2 has no abandonment event: report "n/a (not instrumented)".

**d. Provider fallback**
```sql
SELECT event,
       JSONExtractString(properties, 'to_provider')   AS to_provider,
       JSONExtractString(properties, 'tier')          AS tier,
       count()
FROM events
WHERE timestamp >= '<week_start>' AND timestamp < '<week_end>'
  AND event IN ('route_builder_provider_fallback_chain_advanced','route_fallback_used')
GROUP BY event, to_provider, tier
```

**e. Growth signals** — counts of `rb2_guest_generation_cap_hit` and
`rb2_signup_modal_shown` (with `trigger` breakdown), and how many distinct
anonymous distinct_ids that saw the modal later appear identified in the window.

**f. Top errors**
```sql
SELECT event,
       JSONExtractString(properties, 'failure_kind')  AS failure_kind,
       JSONExtractString(properties, 'error_message') AS error_message,
       count()
FROM events
WHERE timestamp >= '<week_start>' AND timestamp < '<week_end>'
  AND (event LIKE '%_failed' OR event LIKE '%_error')
GROUP BY event, failure_kind, error_message
ORDER BY count() DESC LIMIT 5
```

**g. Weekly actives** — `count(DISTINCT distinct_id)` overall and split by
identified vs anonymous (`person_id IS NOT NULL` / `distinct_id` UUID-shaped),
plus `count(DISTINCT distinct_id)` on `$pageview`.

## 4. Write the brief

`docs/weekly-updates/YYYY-MM-DD-posthog.md`:

```markdown
# Weekly PostHog Brief — <YYYY-MM-DD>

Window: <this week Mon>–<Sun> vs <last week Mon>–<Sun> (UTC). Absolute counts;
n < 20 deltas are directional only.

## Metrics

| Metric | This week | Last week | Δ |
|---|---|---|---|
| Weekly active users (distinct_ids) | … | … | … |
| RB2 generations started / completed (success %) | … | … | … |
| RB1 generations started / completed (success %) | … | … | … |
| RB2 save funnel: completed → saved | … | … | … |
| RB1 save funnel: completed → selected → saved | … | … | … |
| RB1 abandonment | … | … | … |
| Provider fallbacks | … | … | … |
| Guest cap hits / signup modal shown | … | … | … |

## Top errors
…

## What changed / Anomalies / Suggested actions
- (max 5 bullets, each tied to a number above)

---
_Queries that failed or returned empty: … (or "none")_
```

Rates go in parentheses next to their absolute counts. The "What changed"
section is your analysis — tie every claim to a number; if nothing meaningful
changed, say so in one line rather than manufacturing insight.

## 5. Git flow — PR, never a direct push to main

1. `git fetch origin main` and branch `posthog-brief/YYYY-MM-DD` from
   `origin/main`.
2. Commit ONLY the new brief file.
3. `git push -u origin posthog-brief/YYYY-MM-DD`.
4. Open a PR titled `Weekly PostHog brief YYYY-MM-DD` — in Claude cloud
   sessions use the GitHub MCP `create_pull_request` tool (there is no `gh`
   CLI); locally `gh pr create` is fine. Body: one-paragraph summary of the
   headline numbers.

## Failure mode — never skip silently

If PostHog tools are unavailable or every query fails: still write the brief
file containing only the header and a clear statement of what failed (e.g.
"PostHog MCP connector unavailable in this session — no data this week"), and
open the PR anyway. A stub PR is the alarm; a silent week is a bug.
