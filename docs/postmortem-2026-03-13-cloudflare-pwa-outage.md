# Post-Mortem: Production Site Outage (March 12–13, 2026)

## Incident Summary

| Field | Detail |
|-------|--------|
| **Duration** | ~18 hours (Mar 12 ~11:00 PM CT → Mar 13 ~5:00 PM CT) |
| **Impact** | 100% of users on `www.tribos.studio` saw infinite spinner; site completely unusable |
| **Root Cause** | Cloudflare CDN caching stale assets + service worker precaching all JS chunks |
| **Resolution** | Purged Cloudflare cache + removed PWA service worker entirely |
| **PRs involved** | #544, #545, #546, #547, #548, #549 |

## Timeline

| Time (CT) | Event |
|-----------|-------|
| Mar 12, 4:30 PM | PR #544 merged: coach check-in feature (added new components, modified TrainingDashboard) |
| Mar 12, 4:49 PM | Site breaks — infinite spinner on all pages. Service worker serves stale JS chunks from previous deployment |
| Mar 12, 5:15 PM | PR #545 merged: revert PR #544 to restore working state |
| Mar 12, 5:15 PM | Site still broken — Cloudflare cached the broken assets and service worker |
| Mar 12, 6:24 PM | PR #546 merged: SW precache fix (exclude JS from precache, add `onNeedRefresh`) |
| Mar 12, 6:24 PM | Site still broken — Cloudflare still serving stale `sw.js` with old precache list |
| Mar 12, 7:00 PM | PR #547 merged: chunk splitting fix + SpeedInsights removal |
| Mar 12, 7:00 PM | Site still broken — same Cloudflare caching issue |
| Mar 12, 10:20 PM | PR #548 merged: full revert to PR #543 state (nuclear option) |
| Mar 12, 10:20 PM | Site still broken — Cloudflare cache not purged |
| Mar 13, ~5:00 PM | PR #549 merged: remove PWA entirely + add SW killer script |
| Mar 13, ~5:00 PM | User purges Cloudflare cache → **site restored** |

## Root Cause Analysis

### Two independent issues compounded into a prolonged outage:

### 1. Service Worker Precaching All JS Chunks

The `vite-plugin-pwa` (Workbox) was configured to precache **all 67 build output files** (~5.6 MB), including every JS chunk with content-hashed filenames. On each new deployment:

- Vite generates new chunk hashes (e.g., `index-D1toeC0f.js` → `index-Do77z-H-.js`)
- The old service worker (still active in users' browsers) tries to serve the old chunks
- Old chunks don't exist on the new deployment
- Vercel's SPA rewrite (`/((?!api/).*) → /index.html`) returns HTML instead of JS
- Browser gets MIME type error (`text/html` instead of `application/javascript`)
- App fails to initialize → infinite spinner

**Why this wasn't caught earlier**: Previous deployments changed few enough files that the vendor chunks (which hold the bulk of the code) kept the same hashes. PR #544 changed enough files to produce new hashes across multiple chunks simultaneously.

### 2. Cloudflare CDN Caching Stale Assets

The custom domain `www.tribos.studio` routes through Cloudflare before hitting Vercel. Key caching issues:

- **`sw.js` cached for 4 hours** (`Cache-Control: public, max-age=14400`) — Cloudflare served the old service worker even after Vercel had the new one
- **JS chunks cached at Cloudflare edge** — even after Vercel deployed new assets, Cloudflare edge nodes in various regions continued serving stale versions
- **No cache-busting headers** for `sw.js` — it was treated like any other static file

This meant that **every fix deployed to Vercel was invisible to users** because Cloudflare kept serving the broken version. Multiple fix attempts (PRs #545–#548) all worked when accessed via direct Vercel URLs but failed on the production domain.

### How We Confirmed the Root Cause

1. Direct Vercel deployment URL (`tribos-studio-*.vercel.app`) → **loaded fine** in all browsers
2. Production domain (`www.tribos.studio`) → **infinite spinner** in all browsers, all devices
3. Fresh browsers with no service worker cache → **still broken** (ruled out SW-only theory)
4. After Cloudflare cache purge → **immediately fixed**

## Resolution

### Immediate Fix
- Purged Cloudflare cache ("Purge Everything") for `tribos.studio`

### Permanent Fix (PR #549)
1. **Removed PWA/service worker entirely** — `vite-plugin-pwa` removed from build, `registerSW()` removed from `main.jsx`
2. **Added SW killer script** in `index.html` — inline script that unregisters any stale service workers and clears all caches before the app loads
3. **Added `no-cache` headers for `sw.js`** in `vercel.json` — prevents Cloudflare from caching any residual service worker file

## Lessons Learned

### 1. PWA Service Workers Are Dangerous for Frequently-Deployed SPAs
Service workers that precache JS chunks create a ticking time bomb: every deployment can break users who have the old SW cached. This is especially true with content-hashed Vite builds where chunk filenames change on every build.

**Rule**: Do not use Workbox precaching for JS chunks in a frequently-deployed SPA. If you need a service worker, use `NetworkFirst` for everything and never precache JS.

### 2. CDN Caching Can Make Deployments Invisible
When a CDN (Cloudflare) sits between your hosting provider (Vercel) and your users, deploying new code doesn't mean users see it. Critical files like `sw.js` and `index.html` must have `no-cache` or `max-age=0` headers.

**Rule**: Always set `Cache-Control: no-cache, no-store, must-revalidate` for service worker files. Set `max-age=0, must-revalidate` for HTML files. Only use long `max-age` for content-hashed assets (`/assets/*`).

### 3. Test on Production Domain, Not Just Deployment URLs
All fix attempts were verified by checking Vercel deployment previews, which bypass Cloudflare. The actual production domain was never verified until the final diagnosis.

**Rule**: After any deployment that changes caching behavior, verify on the actual production domain (`www.tribos.studio`), not just Vercel preview URLs.

### 4. Have a Cloudflare Cache Purge in Your Deployment Playbook
When things break in production and fixes aren't taking effect, always consider CDN caching as a potential cause. A quick "Purge Everything" in Cloudflare takes 30 seconds and eliminates this entire class of issues.

### 5. The SPA Rewrite Is a Silent Footgun
Vercel's `/((?!api/).*) → /index.html` rewrite means that **any missing file returns HTML with a 200 status**. This is great for client-side routing but terrible for debugging: missing JS files don't 404, they return HTML, causing cryptic MIME type errors instead of clear 404s.

## Prevention Measures

| Measure | Status |
|---------|--------|
| Remove PWA service worker from build | ✅ Done (PR #549) |
| Add SW killer script for existing users | ✅ Done (PR #549) |
| Add no-cache headers for sw.js | ✅ Done (PR #549) |
| Document Cloudflare cache purge in deployment process | ✅ This document |
| Add deployment verification on production domain | 📋 Manual check going forward |
| Consider adding Cloudflare cache purge to CI/CD pipeline | 📋 Future improvement |

## Files Changed in Resolution

| File | Change |
|------|--------|
| `index.html` | Added inline SW killer script |
| `vite.config.js` | Removed `vite-plugin-pwa` |
| `src/main.jsx` | Removed `registerSW()` |
| `vercel.json` | Added no-cache headers for `sw.js` |
