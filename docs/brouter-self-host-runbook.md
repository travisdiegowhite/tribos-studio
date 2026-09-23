# Self-hosted BRouter — runbook

The Route Builder's gravel routing, quiet-line alternates and road-tag
analysis all call BRouter (`src/utils/brouter.js`). The public `brouter.de`
instance has no SLA and runs stock profiles only. This runbook stands up the
Tribos instance on Fly.io: the upstream server image, the contiguous-US
tiles on a volume, and the Tribos profiles from `routing-profiles/`.

Design summary (see `docs/route-quality-brainstorm.md`, Track B item 7):

| Piece | Where | Notes |
|---|---|---|
| Container | `deploy/brouter/Dockerfile` | `ghcr.io/abrensch/brouter:latest` + `curl`, profiles, sync + entrypoint scripts |
| Tiles | `deploy/brouter/sync-segments.sh` | 12 × 5 five-degree `.rd5` squares (W125–W70 × N25–N45); ocean squares 404 and are skipped; ≈ 3 GB |
| Refresh | `deploy/brouter/entrypoint.sh` | syncs on an empty volume, then weekly (`RESYNC_INTERVAL_S`); `curl -z` only fetches newer tiles |
| App | `deploy/brouter/fly.toml` | `tribos-brouter`, region `den`, 2 GB shared-cpu-2x, volume `brouter_segments` at `/segments4`, health check routes a 2 km Boulder pair |
| Profiles | `routing-profiles/tribos-road.brf`, `tribos-gravel.brf` | copied into `/profiles2`; also uploaded at runtime as custom profiles by the client, so a profile change needs no redeploy |
| Client | `src/utils/brouter.js`, `src/utils/brouterProfiles.ts` | server list `[VITE_BROUTER_URL, brouter.de]`, circuit breaker, Tribos rendering + upload cache |
| Monitor | `api/brouter-health-monitor.js` | hourly at :15; pages Sentry `brouter.self_hosted_down` after two failed checks, `brouter.slow` over 8 s |
| State | `database/migrations/126_system_health_checks.sql` | consecutive-failure count; apply by hand |

## First deploy

Run from the **repo root** (the Docker build context must include
`routing-profiles/`; the root `.dockerignore` keeps everything else out).

```bash
fly auth login
fly launch --config deploy/brouter/fly.toml --no-deploy --copy-config --name tribos-brouter --region den
fly volumes create brouter_segments --size 5 --region den -a tribos-brouter
fly deploy --config deploy/brouter/fly.toml --dockerfile deploy/brouter/Dockerfile -a tribos-brouter
```

If `fly launch` rewrites `fly.toml`, restore ours (`git checkout
deploy/brouter/fly.toml`) before `fly deploy`; the file is the source of truth.

The first boot syncs the tiles before the server starts, which takes
10–30 minutes depending on brouter.de's upload speed. The health check's
600 s grace period covers most of that; if the machine gets restarted
mid-sync it resumes (tiles already on the volume are skipped). Watch it:

```bash
fly logs -a tribos-brouter
# … "segments: 47 downloaded, 0 up to date, 13 not on upstream (ocean), 0 failed"
# … "segments: 3.1G in /segments4"
```

## Verify

```bash
BASE=https://tribos-brouter.fly.dev
# 1. a route, with tag rows (the second element of "messages" is the header)
curl -s "$BASE/brouter?lonlats=-105.2705,40.0150|-105.2500,40.0300&profile=trekking&alternativeidx=0&format=geojson" \
  | python3 -c 'import json,sys; f=json.load(sys.stdin)["features"][0]; print(f["properties"]["track-length"], "m,", len(f["properties"]["messages"]), "rows")'
# 2. the Tribos profiles route (named copies and runtime uploads)
BROUTER_URL=$BASE node scripts/validate-brouter-profiles.mjs
# 3. CORS for the browser
curl -sI "$BASE/brouter?lonlats=-105.27,40.015|-105.25,40.03&profile=trekking&alternativeidx=0&format=geojson" | grep -i access-control
```

The validator uploads each template at its default parameters, routes the
Erie → Boulder pair and prints the distance and the WayTags keys seen. It
must list `maxspeed`, `lanes`, `lit` and `sidewalk` — the Tribos profiles
reference them so that BRouter emits them, which is what gives every
BRouter-built route a better traffic-stress score.

## Point the app at it

In Vercel → Project → Settings → Environment Variables (Production and
Preview):

| Variable | Value | Effect |
|---|---|---|
| `VITE_BROUTER_URL` | `https://tribos-brouter.fly.dev` | the browser tries our server first, brouter.de second |
| `BROUTER_URL` | same | the hourly health monitor probes it (skips when unset) |
| `VITE_BROUTER_TRIBOS_PROFILES` | `false` for now | flip to `true` for the Phase 3c cutover after a week of green checks |

Redeploy the app (Vite bakes `VITE_*` at build time) and purge the
Cloudflare cache as usual. Then apply migration 126 by hand and confirm with
`npm run audit:schema`; without it the monitor pages on every failed hour
instead of after two.

## Operate

- **Rollback**: unset `VITE_BROUTER_URL` and redeploy. Nothing else changes;
  the client already falls back to brouter.de on its own, and a server that
  fails twice is skipped for five minutes even before the rollback.
- **Refresh tiles by hand**: `fly ssh console -a tribos-brouter -C "/app/sync-segments.sh"`.
  The weekly loop does this on its own; upstream tiles refresh about weekly.
- **Upgrade the server image**: `fly deploy` again (the `FROM` tag is
  `latest`). Custom profile ids are cached client-side per server and
  re-uploaded when the server no longer knows them, so an upgrade needs no
  client change.
- **Change a profile**: edit `routing-profiles/*.brf`, run the validator
  against brouter.de, commit. Clients render and upload the new text on their
  next request (the cache key is the text's hash). `fly deploy` refreshes the
  named copies in `/profiles2` too, which only the validator's named-profile
  check and manual curls use.
- **Memory**: `JAVA_OPTS` caps the heap at 1400 MB on a 2 GB machine.
  `-DmaxRunningTime=60` aborts any single route after 60 s. Bump the VM to
  `shared-cpu-4x` / 4 GB if `fly logs` shows OOM kills under load.
- **Cost**: ≈ $12–18 / month (shared-cpu-2x 2 GB always on, 5 GB volume,
  outbound bandwidth).

## Monitoring

`api/brouter-health-monitor.js` runs at :15 every hour, routes the Boulder
pair on `BROUTER_URL`, and requires a feature with geometry and tag rows.
Sentry alert rules to add:

| Tag | Meaning | Action |
|---|---|---|
| `brouter.self_hosted_down` | two consecutive hourly checks failed | `fly status -a tribos-brouter`, `fly logs`; riders are already on brouter.de via the client fallback |
| `brouter.slow` | check succeeded but took over 8 s | tiles syncing, or the VM is undersized |
| `brouter.health_monitor_failed` | the cron itself threw | look at the Vercel function log |

Fly's own check (`[[http_service.checks]]`) restarts the machine when the
route request fails; the cron is the second opinion that reaches Sentry.

## What is deliberately not done

- No Cloudflare in front of the Fly app; Fly's edge terminates TLS and the
  hostname is not on the `tribos.studio` zone.
- No API proxy: the browser calls the server directly (CORS `*` is what the
  upstream server sends).
- BRouter is not the primary road router yet. That is Phase 3c
  (`VITE_BROUTER_PRIMARY_ROAD`), a separate PR after the soak.
