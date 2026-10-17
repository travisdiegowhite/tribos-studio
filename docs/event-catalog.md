# Event catalog (Train → Find an event)

Oct 12, 2026. A browsable list of public events on `/train?tab=events`, the last tab, labelled **Find an event**. A rider filters it, opens the event site, and adds an event to their season through the normal race form.

## Pieces

| Piece | File |
|---|---|
| Table | `database/migrations/130_event_catalog.sql` |
| Seed (493 US gravel events, 2027) | `database/migrations/131_event_catalog_seed_gravel_2027.sql`, generated from `database/seeds/gravel_events_2027.json` by `scripts/build-event-catalog-seed.mjs` |
| Seed (102 US running events, 2027) | `database/migrations/137_event_catalog_seed_run_2027.sql` (plus an index on `discipline`), generated from `database/seeds/run_events_2027.json` with `--migration 137 --discipline road_run --with-discipline-index` |
| Weekly refresh (cron) | `api/event-catalog-refresh.js` → `api/utils/eventCatalogRefresh.js` |
| Browser reads, filters, prefill | `src/lib/events/eventCatalog.ts` |
| Tab | `src/components/train/EventsTab.tsx` |

**Setup:** apply 130, then 131, then 137, by hand. Confirm with `npm run audit:schema`. Until 130 is applied the tab shows a load error, and the cron fails loudly (500), so it doesn't stay quietly green.

## How it differs from `race_directory`

`race_directory` (migration 129) holds races that athletes saved through race search. The catalog is curated: every row comes from the seed or the refresh, and athletes only read it. "Add to season" opens `RaceGoalModal` prefilled with no id, and nothing is saved until the rider saves the form. The catalog never writes to `race_goals`.

## Dates are mostly projections

At seed time the statuses were: est 363, confirmed 59, partial 52, risk 19.

- `statusText` goes next to every date: Confirmed / Date TBC / Est. from 2026 / At risk.
- An `est` date is never shown as official. The caveat is also copied into the race's notes when it's added.
- On `est` rows the seed's `date_label` is last year's label ("Jan 31–Feb 1" against a projected Jan 30). The tab shows it only when it's vague ("March, day TBA").
- `event_date` is a Postgres `date`. It's compared as a string and formatted in UTC, never parsed as local time.

## Weekly refresh

The cron runs Mondays at 05:00 UTC (`vercel.json`, `maxDuration` 300). Each run:

1. **Picks** up to 24 unconfirmed upcoming events (`EVENT_REFRESH_BATCH`, max 60). Never-checked events come first, then the least recently checked, soonest first within each.
2. **Checks** each event: `claude-sonnet-5-5` with up to 3 web searches and 2 page fetches. It reports through a strict `report_event` tool, 4 at a time, and stops starting new checks after 230 s.
3. **Applies** the result with `planUpdate` (pure and tested). The cited page must be on a site the search actually returned (the same check race search uses), or only the check itself is recorded.

| Report | Change |
|---|---|
| `announced` (organizer or registration page), in-season, upcoming | → `confirmed`, with the new date, distances, and the url if there was none |
| …but more than 60 days from the projection | → `partial`, with a "check it's the same event" note |
| `third_party_date` (calendar or aggregator only) | → `partial`; never applied over a `confirmed` row |
| `cancelled` | → `risk` with the organizer's note; the date is kept |
| `not_announced`, `not_found`, unverified, wrong season | Nothing changes except `last_checked_at` / `last_check` |

Every check writes `last_checked_at` and `last_check` (outcome, cited url, whether it was verified, a note). A changed row gets `source = 'refresh'`. A transient API error leaves the event unchecked, so it comes first next week. An auth error stops the run. If every check in a run fails, it returns 502.

**Manual run:** `GET /api/event-catalog-refresh?limit=5&dry=1` with `Authorization: Bearer $CRON_SECRET`. A dry run writes nothing and returns each planned patch. Do a dry run before trusting the first real batch.

**Throughput and cost:** 433 events were unconfirmed at seed time. At 24 a week, the soonest events (January to March) are checked within the first month, and the whole list takes about 18 weeks. Each check is roughly $0.03–0.10 (searches at $10 per 1,000, plus Sonnet tokens), so about $1–3 a week. To go faster, raise `EVENT_REFRESH_BATCH`, up to about 40 within the time budget.

## Updating the dataset

The seed is `ON CONFLICT (id) DO NOTHING`, so re-running it never overwrites a row the refresh corrected. A newer dataset can add events this way. Pushing new values over existing rows needs an explicit UPDATE migration that decides which wins.

Seed fix: `omg-oxford-mississippi-gravel-ms` was dated 2027-12-30 against a "January, day TBA" label (the projection slipped a year). It's seeded as 2027-01-01, still `est`.

## Not done yet

- **Geocoding.** `lat`/`lng` are NULL. A "near me" filter needs a town-level geocode of `city, state`; for "A → B" events, use the start town.
- **Coverage.** KY, MS, LA, TN, IL, IN, OH, MD, NJ and WA are thin. Riders add missing events through "Add an event that's not listed".
- **Race search.** "Find a race" on the Season tab doesn't search the catalog yet.
- **Gravel and running only.** `discipline` is `gravel`, `road_run` or `trail_run` (multisport phase 5). The run seed is a curated list of well-known recurring US road and trail races (majors, big-city marathons and halves, notable 10Ks and 5Ks, trail and ultra classics), not a complete calendar. Every run date is `est`, projected from the race's usual weekday rule (e.g. the third Monday of April) with `previous_date` set, so the refresh confirms them like any other row.

## Running events (multisport phase 5)

- **Seed script.** `scripts/build-event-catalog-seed.mjs` takes `--discipline` (default `gravel`; an event's own `discipline` wins), `--migration` (default 131) and `--with-discipline-index`. With no flags it reproduces 131 byte for byte, and `api/utils/eventCatalogRefresh.test.js` checks that, along with 137.
- **Refresh.** `pickEvents` selects `discipline`, and the prompt names a "US running race" or a "US trail race" instead of a "US gravel event".
- **Tab.** A Ride / Run / All filter appears once the catalog holds both sports, and it starts on the athlete's primary sport (`loadSportProfile`). The type list and distance buckets follow the sport. Run buckets are ≤10K, half, marathon and ultra.
- **Add to season.** `raceTypeFor` sets `race_type`:
  - gravel stays `gravel`;
  - a trail event becomes `trail_run`, or `ultra_run` beyond a marathon;
  - a road run maps by distance to `run_5k`, `run_10k`, `half_marathon` or `marathon`.

  `entrySport` then files the race's calendar entry as running.
