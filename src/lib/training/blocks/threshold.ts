/**
 * Threshold / Sweet Spot Build block (spec §2.4).
 *
 * Drive FTP improvement via sustained sub-threshold to threshold work.
 */

import type { BlockDefinition, GeneratedSession } from './types';
import { afiTfiRatio, enumerateDates, latestSnapshot } from './types';

const HARD_MIN_DAYS = 14;
const HARD_MAX_DAYS = 28;

export const threshold: BlockDefinition = {
  type: 'threshold',

  entry_conditions: (ctx) => {
    const snap = latestSnapshot(ctx);
    if (!snap) return false;

    // Aerobic floor: EFI decoupling ≤5%
    const decoupling = ctx.recent_activity.recent_efi_decoupling;
    if (decoupling !== null && decoupling > 0.05) return false;

    if (afiTfiRatio(ctx) > 1.10) return false;
    if (snap.form_score < ctx.coefficients.fs_recovery_target) return false;

    // FTP estimate within 6 weeks
    const ftpAge = ctx.recent_activity.days_since_ftp_estimate;
    if (ftpAge !== null && ftpAge > 42) return false;

    return true;
  },

  exit_conditions: (ctx) => {
    const ratio = afiTfiRatio(ctx);
    if (ratio > 1.15) return true; // forced exit by fatigue

    const snap = latestSnapshot(ctx);
    if (!snap) return false;
    return snap.form_score >= -10 && ratio <= 1.15;
  },

  duration_range: [HARD_MIN_DAYS, HARD_MAX_DAYS],

  default_duration: (ctx) => {
    // Common: 3 weeks (2 build + 1 lighter)
    const nextEvent = ctx.upcoming_events[0];
    if (nextEvent) {
      const today = new Date(ctx.today + 'T00:00:00Z');
      const eventDate = new Date(nextEvent.date + 'T00:00:00Z');
      const daysUntil = Math.round(
        (eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      // Need ~14 days for VO2 + race-specific + taper after threshold
      const slack = daysUntil - 28;
      if (slack < 14) return 14;
      if (slack < 21) return 17;
    }
    return 21;
  },

  generate_sessions: (start, end, ctx) => {
    const dates = enumerateDates(start, end);
    const totalDays = dates.length;
    const spacing = ctx.coefficients.hit_spacing_hours; // 36 or 48 hours

    return dates.map((date, idx): GeneratedSession => {
      const dow = idx % 7;
      const weekIndex = Math.floor(idx / 7);

      // Rest day Monday
      if (dow === 0) {
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

      // Quality session #1: Tuesday (dow === 1)
      if (dow === 1) {
        let intervals;
        let label;
        if (weekIndex === 0) {
          intervals = [
            {
              duration_min: 20,
              target_pct_ftp_min: 88,
              target_pct_ftp_max: 92,
              recovery_min: 5,
              repeats: 2,
              notes: 'Sweet spot anchor',
            },
          ];
          label = '2x 20 min @ 88–92% FTP. Sweet spot anchor.';
        } else if (weekIndex === 1) {
          intervals = [
            {
              duration_min: 15,
              target_pct_ftp_min: 90,
              target_pct_ftp_max: 95,
              recovery_min: 5,
              repeats: 3,
              notes: 'Upper sweet spot',
            },
          ];
          label = '3x 15 min @ 90–95% FTP. Upper sweet spot.';
        } else {
          intervals = [
            {
              duration_min: 10,
              target_pct_ftp_min: 95,
              target_pct_ftp_max: 102,
              recovery_min: 5,
              repeats: 4,
              notes: 'True threshold',
            },
          ];
          label = '4x 10 min @ 95–102% FTP. True threshold.';
        }
        return {
          date,
          session_type: 'threshold',
          target_rss: 95,
          target_duration_min: 75,
          prescribed_intervals: intervals,
          long_ride_flag: false,
          notes: label,
        };
      }

      // Spacing-aware quality #2 (Thursday for 48h, Wednesday for 36h)
      const secondQualityDay = spacing === 48 ? 3 : 2;
      if (dow === secondQualityDay) {
        const intervals =
          weekIndex === 0
            ? [
                {
                  duration_min: 12,
                  target_pct_ftp_min: 92,
                  target_pct_ftp_max: 95,
                  recovery_min: 4,
                  repeats: 3,
                  notes: 'Mid sweet spot',
                },
              ]
            : weekIndex === 1
            ? [
                {
                  duration_min: 20,
                  target_pct_ftp_min: 92,
                  target_pct_ftp_max: 95,
                  recovery_min: 5,
                  repeats: 2,
                  notes: 'Extended sweet spot',
                },
              ]
            : [
                {
                  duration_min: 8,
                  target_pct_ftp_min: 92,
                  target_pct_ftp_max: 105,
                  recovery_min: 4,
                  repeats: 4,
                  notes: 'Over-unders 1 min @ 105% / 1 min @ 92%',
                },
              ];
        return {
          date,
          session_type: 'threshold',
          target_rss: 90,
          target_duration_min: 75,
          prescribed_intervals: intervals,
          long_ride_flag: false,
          notes: 'Threshold quality #2.',
        };
      }

      // Long ride (Saturday, maintained not progressed)
      if (dow === 5) {
        return {
          date,
          session_type: 'z2',
          target_rss: 100,
          target_duration_min: 165,
          prescribed_intervals: null,
          long_ride_flag: true,
          notes: 'Long Z2 ride — maintained, not progressed.',
        };
      }

      // Z1/Z2 fill day
      return {
        date,
        session_type: 'z2',
        target_rss: 50,
        target_duration_min: 60,
        prescribed_intervals: null,
        long_ride_flag: false,
        notes: 'Z2 fill (65–75% FTP).',
      };
    });
  },

  progression_rule: (base, ctx, _dayIndex) => {
    const snap = latestSnapshot(ctx);
    if (!snap) return base;

    // Two consecutive quality sessions with >3% power decline → trim 20%
    if (afiTfiRatio(ctx) > ctx.coefficients.afi_tfi_gate + 0.05) {
      if (base.session_type === 'threshold' || base.session_type === 'tempo') {
        return {
          ...base,
          target_rss: Math.round(base.target_rss * 0.80),
          notes: base.notes + ' [trimmed 20% — fatigue ratio elevated]',
        };
      }
    }
    return base;
  },
};
