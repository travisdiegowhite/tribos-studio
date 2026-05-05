/**
 * Recovery block (spec §2.1).
 *
 * Purpose: clear post-event inflammation and restore autonomic balance.
 * Not an adaptation block. Triggered post-race or by acute fatigue spike.
 */

import type { BlockDefinition, GeneratedSession } from './types';
import { enumerateDates, latestSnapshot } from './types';

const HARD_MIN_DAYS = 3;
const HARD_MAX_DAYS = 10;

export const recovery: BlockDefinition = {
  type: 'recovery',

  entry_conditions: (ctx) => {
    const snap = latestSnapshot(ctx);
    if (!snap) return false;

    // Spec §2.1: any one of the following triggers
    if (ctx.recent_activity.max_rss_24h >= 250) return true;
    if (ctx.recent_activity.cumulative_rss_72h >= 400) return true;
    if (snap.form_score <= -25) return true;
    if (
      ctx.recent_activity.days_since_last_race !== null &&
      ctx.recent_activity.days_since_last_race <= 1 &&
      ctx.post_race_tier !== null
    ) {
      return true;
    }
    return false;
  },

  exit_conditions: (ctx) => {
    const snap = latestSnapshot(ctx);
    if (!snap) return false;

    const block = ctx.current_block;
    const daysIn = block?.days_in ?? 0;

    // Need 4-day AFI history; conservatively true if insufficient data.
    let afiDropped30 = false;
    if (ctx.daily_stats.length >= daysIn + 1 && daysIn >= 1) {
      const afiAtStart = ctx.daily_stats[Math.min(daysIn, ctx.daily_stats.length - 1)].afi;
      if (afiAtStart > 0) {
        const drop = (afiAtStart - snap.afi) / afiAtStart;
        afiDropped30 = drop >= 0.30;
      }
    }

    const fsRecovered = snap.form_score >= ctx.coefficients.fs_recovery_target;
    const enoughDaysSinceRace =
      ctx.recent_activity.days_since_last_race === null ||
      ctx.recent_activity.days_since_last_race >= 3;
    const noSoreness = !ctx.subjective.some(
      (s) => s.muscle_soreness_flag === true
    );

    return afiDropped30 && fsRecovered && enoughDaysSinceRace && noSoreness;
  },

  duration_range: [HARD_MIN_DAYS, HARD_MAX_DAYS],

  default_duration: (ctx) => {
    // Spec §2.1: A=5, B=3, C=0–2, plus masters mode bump
    let base = 5;
    if (ctx.post_race_tier === 'A') base = 5;
    else if (ctx.post_race_tier === 'B') base = 3;
    else if (ctx.post_race_tier === 'C') base = 2;

    const adjusted = base + ctx.coefficients.recovery_block_days_added;
    return Math.max(HARD_MIN_DAYS, Math.min(HARD_MAX_DAYS, adjusted));
  },

  generate_sessions: (start, end, _ctx) => {
    const dates = enumerateDates(start, end);
    return dates.map((date, idx): GeneratedSession => {
      // Days 1–2: full rest or ≤45 min Z1 (≤60% FTP); RSS 0–25/day
      // Days 3–5: 45–75 min Z1–low Z2; RSS 25–40/day
      // Days 6–7+: 60–90 min Z2 + optional 3–5x 30s spin-ups; RSS 40–55/day
      if (idx < 2) {
        return {
          date,
          session_type: idx === 0 ? 'rest' : 'z1',
          target_rss: idx === 0 ? 0 : 20,
          target_duration_min: idx === 0 ? 0 : 30,
          prescribed_intervals: null,
          long_ride_flag: false,
          notes:
            idx === 0
              ? 'Full rest. Hydrate, sleep, eat well.'
              : 'Easy Z1 spin (≤60% FTP). Just turn the legs over.',
        };
      }
      if (idx < 5) {
        return {
          date,
          session_type: 'z1',
          target_rss: 32,
          target_duration_min: 60,
          prescribed_intervals: null,
          long_ride_flag: false,
          notes: '45–75 min Z1 to low Z2. No structure, conversational pace.',
        };
      }
      return {
        date,
        session_type: 'z2',
        target_rss: 48,
        target_duration_min: 75,
        prescribed_intervals: [
          {
            duration_min: 0.5,
            target_pct_ftp_min: 80,
            target_pct_ftp_max: 95,
            recovery_min: 4.5,
            repeats: 4,
            notes: 'Optional 30-second spin-ups, 5 min apart',
          },
        ],
        long_ride_flag: false,
        notes: '60–90 min Z2 with optional spin-ups. Sharpening, not loading.',
      };
    });
  },

  progression_rule: (base, ctx, _dayIndex) => {
    // If subjective wellness drops, hold the rest day a bit longer
    const todayWellness = ctx.subjective.find((s) => s.date === base.date);
    if (todayWellness?.wellness_score !== undefined && todayWellness.wellness_score <= 4) {
      return {
        ...base,
        session_type: 'rest',
        target_rss: 0,
        target_duration_min: 0,
        prescribed_intervals: null,
        notes: 'Wellness flag — full rest day. Recovery delayed.',
      };
    }
    return base;
  },
};
