/**
 * VO2 / Race Sharpening block (spec §2.5).
 *
 * Block-periodized HIT (Rønnestad-style): 4–5 HIT sessions in week 1,
 * lighter week 2, optional race-specific week 3.
 */

import type { BlockDefinition, GeneratedSession } from './types';
import { afiTfiRatio, enumerateDates, latestSnapshot } from './types';

const HARD_MIN_DAYS = 9;
const HARD_MAX_DAYS = 21;

export const vo2: BlockDefinition = {
  type: 'vo2',

  entry_conditions: (ctx) => {
    const snap = latestSnapshot(ctx);
    if (!snap) return false;

    if (afiTfiRatio(ctx) > 1.10) return false;
    if (snap.form_score < ctx.coefficients.fs_recovery_target) return false;

    // ≥7 days from last race
    const daysSinceRace = ctx.recent_activity.days_since_last_race;
    if (daysSinceRace !== null && daysSinceRace < 7) return false;

    // Need ≥14 days before A-race
    const nextEvent = ctx.upcoming_events[0];
    if (nextEvent && nextEvent.tier === 'A') {
      const today = new Date(ctx.today + 'T00:00:00Z');
      const eventDate = new Date(nextEvent.date + 'T00:00:00Z');
      const daysUntil = Math.round(
        (eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntil < 14) return false;
    }

    return true;
  },

  exit_conditions: (ctx) => {
    const snap = latestSnapshot(ctx);
    if (!snap) return false;
    return afiTfiRatio(ctx) <= 1.15;
  },

  duration_range: [HARD_MIN_DAYS, HARD_MAX_DAYS],

  default_duration: (_ctx) => 14,

  generate_sessions: (start, end, ctx) => {
    const dates = enumerateDates(start, end);
    const spacingHours = ctx.coefficients.hit_spacing_hours;
    // 36h spacing → can stack quality every other day; 48h → every 3rd day
    const stackEveryOther = spacingHours === 36;

    return dates.map((date, idx): GeneratedSession => {
      const weekIdx = Math.floor(idx / 7);

      // Week 1: dense HIT (4–5 sessions)
      if (weekIdx === 0) {
        const isHitDay = stackEveryOther ? idx % 2 === 1 : idx % 3 === 1;
        if (isHitDay) {
          // Rotate session menu
          const sessionPick = idx % 3;
          const intervals =
            sessionPick === 0
              ? [
                  {
                    duration_min: 4,
                    target_pct_ftp_min: 105,
                    target_pct_ftp_max: 115,
                    recovery_min: 3,
                    repeats: 5,
                    notes: 'Classic 4-min reps (Hickson)',
                  },
                ]
              : sessionPick === 1
              ? [
                  {
                    duration_min: 0.5,
                    target_pct_ftp_min: 105,
                    target_pct_ftp_max: 115,
                    recovery_min: 0.25,
                    repeats: 13,
                    notes: '30/15s set — 9–13 min, 3 sets',
                  },
                ]
              : [
                  {
                    duration_min: 3,
                    target_pct_ftp_min: 110,
                    target_pct_ftp_max: 115,
                    recovery_min: 2,
                    repeats: 6,
                    notes: 'Compressed 3-min @ 110–115% FTP',
                  },
                ];
          return {
            date,
            session_type: 'vo2',
            target_rss: 95,
            target_duration_min: 75,
            prescribed_intervals: intervals,
            long_ride_flag: false,
            notes: `VO2 quality (week 1, dense block).`,
          };
        }
        // Z1 day between quality
        return {
          date,
          session_type: 'z1',
          target_rss: 30,
          target_duration_min: 45,
          prescribed_intervals: null,
          long_ride_flag: false,
          notes: 'Easy Z1 between HIT days. Recovery-emphasis.',
        };
      }

      // Week 2: 1–2 HIT sessions, more Z2
      if (weekIdx === 1) {
        const dow = idx % 7;
        if (dow === 1) {
          return {
            date,
            session_type: 'vo2',
            target_rss: 85,
            target_duration_min: 70,
            prescribed_intervals: [
              {
                duration_min: 4,
                target_pct_ftp_min: 105,
                target_pct_ftp_max: 115,
                recovery_min: 3,
                repeats: 4,
                notes: 'Absorption-week HIT (lighter than week 1)',
              },
            ],
            long_ride_flag: false,
            notes: 'Week 2 HIT — lighter dose, allow adaptation.',
          };
        }
        if (dow === 0 || dow === 4) {
          return {
            date,
            session_type: 'rest',
            target_rss: 0,
            target_duration_min: 0,
            prescribed_intervals: null,
            long_ride_flag: false,
            notes: 'Rest day.',
          };
        }
        if (dow === 5) {
          return {
            date,
            session_type: 'z2',
            target_rss: 95,
            target_duration_min: 150,
            prescribed_intervals: null,
            long_ride_flag: true,
            notes: 'Long Z2 — slightly reduced (-15%) vs threshold block.',
          };
        }
        return {
          date,
          session_type: 'z2',
          target_rss: 55,
          target_duration_min: 70,
          prescribed_intervals: null,
          long_ride_flag: false,
          notes: 'Z2 absorption.',
        };
      }

      // Week 3 (optional): 1 HIT + race-specific
      const dow3 = idx % 7;
      if (dow3 === 1) {
        return {
          date,
          session_type: 'vo2',
          target_rss: 85,
          target_duration_min: 75,
          prescribed_intervals: [
            {
              duration_min: 5,
              target_pct_ftp_min: 105,
              target_pct_ftp_max: 110,
              recovery_min: 4,
              repeats: 4,
              notes: 'Final VO2 dose before race-specific',
            },
          ],
          long_ride_flag: false,
          notes: 'Final VO2 quality before race-specific block.',
        };
      }
      return {
        date,
        session_type: 'z2',
        target_rss: 50,
        target_duration_min: 60,
        prescribed_intervals: null,
        long_ride_flag: false,
        notes: 'Z2 transition into race-specific.',
      };
    });
  },

  progression_rule: (base, ctx, _dayIndex) => {
    // If wellness severely down, swap a HIT day for Z2
    const todayWellness = ctx.subjective.find((s) => s.date === base.date);
    if (
      base.session_type === 'vo2' &&
      todayWellness?.wellness_score !== undefined &&
      todayWellness.wellness_score <= 4
    ) {
      return {
        ...base,
        session_type: 'z1',
        target_rss: 30,
        target_duration_min: 45,
        prescribed_intervals: null,
        notes: 'HIT swapped to Z1 — wellness flagged. Push session.',
      };
    }
    return base;
  },
};
