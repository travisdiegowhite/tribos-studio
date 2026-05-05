/**
 * Taper block (spec §2.7).
 *
 * Reduce fatigue while preserving fitness. Strongest evidence base of any block:
 * Mujika & Padilla 2003, Bosquet 2007 meta-analysis (volume -41–60%, intensity
 * preserved, exponential decay > step).
 */

import type { BlockDefinition, GeneratedSession } from './types';
import { enumerateDates } from './types';

const HARD_MIN_DAYS = 2;
const HARD_MAX_DAYS = 14;

export const taper: BlockDefinition = {
  type: 'taper',

  entry_conditions: (ctx) => {
    const nextEvent = ctx.upcoming_events[0];
    if (!nextEvent) return false;
    const today = new Date(ctx.today + 'T00:00:00Z');
    const eventDate = new Date(nextEvent.date + 'T00:00:00Z');
    const daysUntil = Math.round(
      (eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysUntil >= 2 && daysUntil <= 14;
  },

  exit_conditions: (ctx) => {
    const nextEvent = ctx.upcoming_events[0];
    if (!nextEvent) return true;
    const today = new Date(ctx.today + 'T00:00:00Z');
    const eventDate = new Date(nextEvent.date + 'T00:00:00Z');
    return eventDate <= today;
  },

  duration_range: [HARD_MIN_DAYS, HARD_MAX_DAYS],

  default_duration: (ctx) => {
    const tier = ctx.upcoming_events[0]?.tier ?? 'B';
    if (tier === 'A') return 12;
    if (tier === 'B') return 6;
    return 3; // C
  },

  generate_sessions: (start, end, ctx) => {
    const dates = enumerateDates(start, end);
    const totalDays = dates.length;
    const tier = ctx.upcoming_events[0]?.tier ?? 'B';

    return dates.map((date, idx): GeneratedSession => {
      // Spec §2.7 exponential decay: -20% by d-14, -35% by d-10, -50% by d-5, -65% by d-2
      const daysToRace = totalDays - idx;
      let volumeFactor = 1.0;
      if (tier === 'A') {
        if (daysToRace <= 2) volumeFactor = 0.35;
        else if (daysToRace <= 5) volumeFactor = 0.50;
        else if (daysToRace <= 10) volumeFactor = 0.65;
        else volumeFactor = 0.80;
      } else if (tier === 'B') {
        volumeFactor = 0.60;
      } else {
        volumeFactor = 0.70;
      }

      const baseDuration = 75;
      const duration = Math.round(baseDuration * volumeFactor);

      // Day -1: 30–45 min easy + 3–4x 30s spin-ups OR full rest
      if (daysToRace === 1) {
        return {
          date,
          session_type: 'opener',
          target_rss: 18,
          target_duration_min: 35,
          prescribed_intervals: [
            {
              duration_min: 0.5,
              target_pct_ftp_min: 100,
              target_pct_ftp_max: 130,
              recovery_min: 2,
              repeats: 3,
              notes: 'Day-before spin-ups, full recovery',
            },
          ],
          long_ride_flag: false,
          notes: '30–45 min easy + 3x 30s spin-ups. Or full rest if you prefer.',
        };
      }

      // Mid-taper short race-pace efforts (every ~3rd day, A-race)
      if (tier === 'A' && idx % 3 === 1 && daysToRace > 4) {
        return {
          date,
          session_type: 'threshold',
          target_rss: 30,
          target_duration_min: duration,
          prescribed_intervals: [
            {
              duration_min: 2,
              target_pct_ftp_min: 95,
              target_pct_ftp_max: 105,
              recovery_min: 4,
              repeats: 4,
              notes: 'Mid-taper race-pace efforts',
            },
          ],
          long_ride_flag: false,
          notes: '4x 2 min @ 100% FTP. Intensity preserved, volume reduced.',
        };
      }

      // Late-taper short stimulus
      if (tier === 'A' && idx % 3 === 1 && daysToRace <= 4 && daysToRace > 1) {
        return {
          date,
          session_type: 'threshold',
          target_rss: 22,
          target_duration_min: duration,
          prescribed_intervals: [
            {
              duration_min: 1,
              target_pct_ftp_min: 102,
              target_pct_ftp_max: 108,
              recovery_min: 3,
              repeats: 3,
              notes: 'Late-taper sharpener',
            },
          ],
          long_ride_flag: false,
          notes: '3x 1 min @ 105% FTP. Tiny stimulus, big freshness.',
        };
      }

      return {
        date,
        session_type: 'z1',
        target_rss: Math.round(duration * 0.5),
        target_duration_min: duration,
        prescribed_intervals: null,
        long_ride_flag: false,
        notes: `Easy Z1 (${duration} min). Volume reduced ${Math.round((1 - volumeFactor) * 100)}%.`,
      };
    });
  },

  progression_rule: (base, _ctx, _dayIndex) => {
    // Taper is the one block where deviating less aggressively is the bigger risk.
    // No mid-block second-guessing.
    return base;
  },
};
