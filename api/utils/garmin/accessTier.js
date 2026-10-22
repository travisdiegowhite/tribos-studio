/**
 * Garmin Connect Developer Program access tier (Start Guide 2.0, 2026-10).
 *
 * Starter Access — which tribos is on — is PUSH-only: no historical data
 * (/backfill/*), no ad-hoc pulls (activityDetails / activities?summaryId /
 * dailies by upload time), one client ID, and at most 1,000 connected users.
 * PING/PULL and historical access are Enterprise-only.
 *
 * Every backfill and pull call site checks isGarminHistoricalAccessEnabled()
 * and returns without contacting Garmin when it is false. Set
 * GARMIN_HISTORICAL_ACCESS_ENABLED=true only if Garmin grants Enterprise
 * access. Read at call time (not module load) so tests can toggle it.
 *
 * Re-reading a FIT file from a callbackURL that arrived in an activityFiles
 * PUSH is NOT gated: that is part of PUSH delivery.
 */

export const STARTER_TIER_SKIP = 'starter_tier';

export function isGarminHistoricalAccessEnabled() {
  return process.env.GARMIN_HISTORICAL_ACCESS_ENABLED === 'true';
}

export function getGarminMaxConnections() {
  const parsed = Number.parseInt(process.env.GARMIN_MAX_CONNECTIONS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1000;
}
