/**
 * Reactivation block (spec §2.2).
 *
 * Restore neuromuscular sharpness and rebuild volume without accumulating
 * fatigue. Bridges Recovery into the next adaptation block.
 */

import type { BlockDefinition, GeneratedSession } from './types';
import { afiTfiRatio, enumerateDates, latestSnapshot } from './types';

const HARD_MIN_DAYS = 3;
const HARD_MAX_DAYS = 10;

export const reactivation: BlockDefinition = {
  type: 'reactivation',

  entry_conditions: (ctx) => {
    const snap = latestSnapshot(ctx);
    if (!snap) return false;

    // Recovery completed OR ≥5 days post-race with no recovery needed
    const recoveryDone = ctx.current_block?.block_type === 'recovery';
    const daysSinceRace = ctx.recent_activity.days_since_last_race;
    const longSinceRace = daysSinceRace !== null && daysSinceRace >= 5;
    if (!recoveryDone && !longSinceRace) return false;

    if (snap.form_score < ctx.coefficients.fs_recovery_target) return false;

    // AFI within 15% of baseline (assume baseline = TFI for now)
    if (snap.tfi <= 0) return true;
    const afiDelta = Math.abs(snap.afi - snap.tfi) / snap.tfi;
    return afiDelta <= 0.15;
  },

  exit_conditions: (ctx) => {
    const snap = latestSnapshot(ctx);
    if (!snap) return false;

    // Weekly RSS ≥90% of pre-race baseline → approximated via TFI flat-or-rising
    const tfiFlatOrRising = ctx.daily_stats.length < 7
      || snap.tfi >= ctx.daily_stats[Math.min(6, ctx.daily_stats.length - 1)].tfi;

    const ratio = afiTfiRatio(ctx);
    const ratioOK = ratio <= 1.10;

    return tfiFlatOrRising && ratioOK;
  },

  duration_range: [HARD_MIN_DAYS, HARD_MAX_DAYS],

  default_duration: (ctx) => {
    // Default 7d. Compress to 3–5 if next event <3 weeks away.
    const nextEvent = ctx.upcoming_events[0];
    if (nextEvent) {
      const today = new Date(ctx.today + 'T00:00:00Z');
      const eventDate = new Date(nextEvent.date + 'T00:00:00Z');
      const daysUntil = Math.round(
        (eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntil < 21) return 4;
    }
    return 7;
  },

  generate_sessions: (start, end, _ctx) => {
    const dates = enumerateDates(start, end);
    const totalDays = dates.length;

    return dates.map((date, idx): GeneratedSession => {
      const ratio = idx / Math.max(1, totalDays - 1);

      // 4–6 sessions across the block; rest days interleave
      const isRestDay = idx % 3 === 2; // every 3rd day rest
      if (isRestDay) {
        return {
          date,
          session_type: 'rest',
          target_rss: 0,
          target_duration_min: 0,
          prescribed_intervals: null,
          long_ride_flag: false,
          notes: 'Rest day during reactivation rebuild.',
        };
      }

      // Insert a tempo touch-up session mid-block
      const tempoDay = Math.floor(totalDays * 0.6);
      if (idx === tempoDay) {
        return {
          date,
          session_type: 'tempo',
          target_rss: 60,
          target_duration_min: 60,
          prescribed_intervals: [
            {
              duration_min: 8,
              target_pct_ftp_min: 76,
              target_pct_ftp_max: 87,
              recovery_min: 4,
              repeats: 2,
              notes: 'Tempo touch-up — not a build session',
            },
          ],
          long_ride_flag: false,
          notes: 'Tempo touch-up: 2x 8 min @ 76–87% FTP. Sharpening only.',
        };
      }

      // Insert neuromuscular openers in 1–2 sessions early
      if (idx === Math.floor(totalDays * 0.3)) {
        return {
          date,
          session_type: 'z2',
          target_rss: 50,
          target_duration_min: 60,
          prescribed_intervals: [
            {
              duration_min: 0.5,
              target_pct_ftp_min: 110,
              target_pct_ftp_max: 130,
              recovery_min: 2.5,
              repeats: 5,
              notes: '30s standing accelerations, full recovery between',
            },
          ],
          long_ride_flag: false,
          notes:
            'Z2 base + 5x 30s standing accelerations. Neuromuscular wake-up.',
        };
      }

      // Volume rebuilds from ~50% of pre-race weekly RSS toward 90–100%
      const targetRss = Math.round(45 + ratio * 35); // 45 → 80
      const targetDuration = Math.round(50 + ratio * 40); // 50 → 90 min

      return {
        date,
        session_type: 'z2',
        target_rss: targetRss,
        target_duration_min: targetDuration,
        prescribed_intervals: null,
        long_ride_flag: idx === totalDays - 2,
        notes: 'Z2 volume rebuild (65–75% FTP). Conversational pace.',
      };
    });
  },

  progression_rule: (base, _ctx, _dayIndex) => base,
};
