# Garmin Connect Developer Program 2.0 — compliance map (2026-10)

On 2026-10-15 Garmin moved the program to version 2.0. That release brought a new Developer Program Agreement and affidavit, Start Guide 2.0 and the OAuth2 PKCE spec 2.0. This page maps each obligation to the code that meets it, and lists the steps done outside the code.

Garmin's program documents are **confidential** (Agreement §8, affidavit ¶5). Do not commit them to this repo, and do not quote them at length in docs. Get them from the Garmin developer portal.

## Access tier: Starter

tribos is on **Starter Access**:

| Limit | What it means for tribos |
|---|---|
| PUSH-only delivery | Garmin sends data to us; we never ask for it. |
| No historical data | No backfill. |
| No ad-hoc data requests | No pulls. |
| One client ID | — |
| At most 1,000 connected users | Enforced at connect time. |

PING/PULL and backfill are Enterprise-only.

- **`api/utils/garmin/accessTier.js`** controls this through `GARMIN_HISTORICAL_ACCESS_ENABLED`, which defaults to off.
  - With it off, every backfill and pull returns without contacting Garmin. That covers:
    - the shared client (`garminApiClient.js`, `garminBackfill.js`)
    - `garmin-activities` sync and backfill actions
    - re-sync, reconcile, and the garmin2 backfill endpoint
    - `get_health_data`
  - Turn it on only if Garmin grants Enterprise. Also set `VITE_GARMIN_HISTORICAL_ACCESS=true` so the UI shows the import and re-sync tools again.
- **Allowed and still running:** re-reading a FIT file from the `callbackURL` that arrived in an activityFiles PUSH.
- **Connection cap:** `GARMIN_MAX_CONNECTIONS` defaults to 1000.
  - At the cap, `garmin-auth` `get_authorization_url` returns 409 `GARMIN_CAPACITY`.
  - Sentry gets `garmin.connection_cap_warning` at 90% and `garmin.connection_cap_reached` at 100%.
  - Users who are already connected are never blocked.

## Clause → code

| Obligation | Where |
|---|---|
| OAuth2 PKCE: S256, state, server-side token exchange and refresh, secret never in the browser | `api/garmin-auth.js`, `api/utils/garmin/tokenManager.js` |
| Every `garmin-auth` action requires a Supabase session (no request-body `userId`) | `api/garmin-auth.js` handler |
| User ID from `partner-gateway/rest/user/id`, falling back to the old path on 404 | `fetchGarminUserId` in `garminApiClient.js` |
| Permissions read at connect and repair, stored in `provider_user_data.permissions` | `fetchGarminPermissions`, `garmin-auth.js` |
| `DELETE /user/registration` on in-app disconnect and on account deletion | `deregisterGarminUser`, `garmin-auth.js` `disconnect`, `account-delete.js` |
| Deregistration notifications delete the integration row; imported activities stay | `api/utils/garmin/registrationEvents.js`, used by `api/garmin-webhook.js` and mirrored in the Cloudflare worker |
| Permission-change notifications store the list; `sync_enabled=false` while ACTIVITY_EXPORT is off | same files; the processor skips paused integrations |
| No course upload without COURSE_IMPORT | `pushRoute` in `garmin-auth.js` |
| §4.5 notice and express consent before data moves to or from Garmin | `GarminConsentModal` on every connect path (Settings, onboarding, import wizard), `ConsentGate` for existing users, `pushRoute` refuses without `garmin_data_consent_at` |
| §5.3 end-user terms protecting Garmin: third-party beneficiary, AS IS, liability, indemnity, release, not life-critical | `src/pages/Terms.jsx` §7.1; acceptance recorded by signup and by `ConsentGate` (`tos_version`) |
| §6.4 attribution on Garmin data | `PoweredByGarmin` (`src/components/GarminBranding.jsx`), shown on ride lists, the ride modal, Progress, the Today map and Settings |
| §15.4 privacy policy, data rights | `src/pages/PrivacyPolicy.jsx` |
| §15.10 AI transparency statement and explicit, withdrawable consent | Privacy Policy §4; `api/utils/aiConsent.js` checks consent on the server before every Claude call that carries training data |
| §15.11 no AI training on Garmin data | We train no models. Anthropic API traffic is not used for training. Stored coach history is never exported for training or evaluation. |
| §8 confidentiality | No Garmin program documents in the repo (removed 2026-10). The repo must stay private. |

## Steps outside the code

1. Make the GitHub repo private.
   - The Activity API PDFs it used to contain remain in git history.
   - Purging them would need a history rewrite and a force-push to main. That was not done.
2. Accept the 2.0 terms and the affidavit in the developer portal.
3. Disclose service providers to Garmin (affidavit ¶7):
   - Vercel (hosting)
   - Supabase (database)
   - Cloudflare (CDN, and the Worker that receives Garmin pushes)
   - Anthropic (AI)
   - Sentry (errors)
   - PostHog (analytics)
   - Resend (email)
4. Add every developer to the portal's Members list.
5. In API Tools → Endpoint Configuration, point **Deregistration** and **User Permissions** at the Worker.
   - Both now carry real handling.
6. Confirm activities and activityDetails are on PUSH. Do not switch anything to PING. See the Garmin freeze in `CLAUDE.md`.
7. Ask Garmin whether downloading activityFiles through `callbackURL` is allowed on Starter.
8. Before launching any new surface that shows Garmin data, give Garmin 30 days' notice at connect-support@developer.garmin.com (§6.6).
9. Subscribe to the developer blog for API updates.
10. Deploy the Worker by hand: `cd cloudflare-workers/garmin-webhook && npx wrangler deploy`.
    - It does not deploy with Vercel. Version 5.1.0 adds the registration notifications.

## Known follow-ups

- **Cafe check-ins** share weekly ride counts, hours and TSS with pod members. Those numbers can include Garmin activities, and there's no attribution.
  - The `cafe_check_ins` row does not record whether Garmin data was included.
  - Attributing it properly needs a column, which means a migration applied by hand.
- **`route-coach`, `claude-routes` and `fuel-plan`** call Claude with context built in the browser.
  - Check whether that context can carry Garmin-derived numbers.
  - If it can, gate those endpoints with `rejectWithoutAiConsent` too.
