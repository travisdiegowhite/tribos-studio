// Daily AI usage quotas — the economic backstop on Anthropic spend.
//
// Burst rate limits (rateLimit.js) stop hammering; this module bounds total
// daily spend: a per-user daily cap and a global daily ceiling across all
// users. Applied to every user-initiated endpoint that calls Claude, after
// auth and after the endpoint's burst limit. Cron/system Claude endpoints
// (coach-check-in-generate, coach-correction-trigger, proactive-insights)
// are deliberately excluded — they're cron-secret-gated and schedule-bounded,
// and a busy day must not break scheduled coach features.
//
// Counters reuse the rate_limits table via checkRateLimit. The check_rate_limit
// RPC is a fixed window anchored at first request, so the UTC date is baked
// into the key to make quotas reset at midnight UTC; the dated rows age out
// via the existing cleanup_rate_limits job.

import { checkRateLimit } from './rateLimit.js';

const DEFAULT_USER_DAILY_LIMIT = 100;
const DEFAULT_GLOBAL_DAILY_LIMIT = 2000;
const DAY_MINUTES = 24 * 60;

function parseLimit(envValue, fallback) {
  const parsed = parseInt(envValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getAiQuotaLimits() {
  return {
    userDaily: parseLimit(process.env.AI_DAILY_USER_LIMIT, DEFAULT_USER_DAILY_LIMIT),
    globalDaily: parseLimit(process.env.AI_DAILY_GLOBAL_LIMIT, DEFAULT_GLOBAL_DAILY_LIMIT),
  };
}

function utcDateKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Count one AI call against the global daily ceiling only (no per-user cap).
 * Used for guest traffic, which is already capped per-IP by the caller.
 * Returns null if allowed; sends a 429 and returns the response if the
 * global ceiling is reached.
 */
export async function enforceGlobalAiQuota(req, res) {
  const { globalDaily } = getAiQuotaLimits();
  const date = utcDateKey();

  const globalResult = await checkRateLimit(`ai-daily:global:${date}`, globalDaily, DAY_MINUTES);
  if (!globalResult.allowed) {
    return res.status(429).json({
      error: 'ai_capacity',
      message: 'AI features are temporarily at capacity. Please try again later.',
      resetAt: globalResult.resetAt.toISOString(),
    });
  }

  return null;
}

/**
 * Enforce the per-user daily AI quota and the global daily ceiling.
 * Call AFTER auth (userId must be the verified token identity) and after the
 * endpoint's burst rate limit. Returns null if allowed; sends a 429 and
 * returns the response otherwise — same calling convention as rateLimitByUser:
 *
 *   const quotaExceeded = await enforceAiQuota(req, res, user.id);
 *   if (quotaExceeded !== null) return;
 */
export async function enforceAiQuota(req, res, userId) {
  const { userDaily } = getAiQuotaLimits();
  const date = utcDateKey();

  // User first, so a denial is attributed to the caller's own usage
  const userResult = await checkRateLimit(`ai-daily:user:${userId}:${date}`, userDaily, DAY_MINUTES);
  if (!userResult.allowed) {
    return res.status(429).json({
      error: 'ai_daily_quota',
      message: 'Daily AI limit reached — resets at midnight UTC.',
      resetAt: userResult.resetAt.toISOString(),
    });
  }

  return enforceGlobalAiQuota(req, res);
}
