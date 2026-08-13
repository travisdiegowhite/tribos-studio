# Follow-up: close the unauthenticated fallback in activity sync endpoints

**Status: TODO — approved for a future PR (Travis, 2026-08-13)**

## The hole

`api/strava-activities.js` (`validateUserAccess`, ~line 66) and
`api/garmin-activities.js` (same pattern) deliberately **fall open when no
`Authorization` header is present** — a request with a *mismatched* JWT gets
403, but a request with *no* JWT at all is allowed through with any `userId`
in the body. Both sites carry `TODO: Make this required after frontend is
updated`.

Proof it's exploitable: during the 2026-08-13 Strava gap backfill (after the
June 30 – Aug 11 app deactivation, see `api/internal/backfill-strava-gap.js`),
the entire 50-user backfill was executed server-to-server through this
fallback — no credentials required. Anyone who knows or guesses a user UUID
can trigger Strava/Garmin syncs, force token refreshes, and read speed
profiles (`get_speed_profile`) for that user.

## The fix

1. Verify the frontend always sends the header: `src/utils/stravaService.js`
   and `src/utils/garminService.js` call these endpoints — confirm every call
   site attaches the Supabase session token (most already do).
2. In both endpoints, replace the fall-open branch with a 401 when the
   `Authorization` header is missing.
3. Watch Vercel logs for the existing `⚠️ No Authorization header provided`
   warnings for a few days first — zero occurrences from real clients means
   the flip is safe.

Note: internal/admin tooling that relied on the fallback (the one-off gap
backfill above) must instead use `api/internal/backfill-strava-gap.js`
(Bearer JWT + allowlist) or another authenticated path.
