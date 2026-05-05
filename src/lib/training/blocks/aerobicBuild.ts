/**
 * Aerobic Build / Re-emphasis block (spec §2.3).
 *
 * Restore or extend aerobic floor when EFI shows decoupling. Mid-season this
 * is typically a 2-week re-emphasis, not a full base build.
 */

import type { BlockDefinition, GeneratedSession } from './types';
import { afiTfiRatio, enumerateDates, latestSnapshot } from './types';

const HARD_MIN_DAYS = 14;
const HARD_MAX_DAYS = 28;

export const aerobicBuild: BlockDefinition = {
  type: 'aerobic_build',

  entry_conditions: (ctx) => {
    const snap = latestSnapshot(ctx);
    if (!snap) return false;

    if (snap.form_score < 0) return false;
    if (afiTfiRatio(ctx) > 1.10) return false;

    // EFI decoupling >5% on long Z2 OR ≥6 weeks since last aerobic emphasis
    const decoupling = ctx.recent_activity.recent_efi_decoupling;
    if (decoupling !== null && decoupling > 0.05) return true;

    // Without an EFI signal, allow entry if the rider just finished
    // reactivation or recovery (spec: "Reactivation complete OR base block transition")
    return (
      ctx.current_block?.block_type === 'reactivation' ||
      ctx.current_block?.block_type === 'recovery'
    );
  },

  exit_conditions: (ctx) => {
    const snap = latestSnapshot(ctx);
    if (!snap) return false;

    const ratioOK = afiTfiRatio(ctx) <= 1.10;
    const decoupling = ctx.recent_activity.recent_efi_decoupling;
    const decouplingOK = decoupling === null || decoupling <= 0.05;
    return ratioOK && decouplingOK;
  },

  duration_range: [HARD_MIN_DAYS, HARD_MAX_DAYS],

  default_duration: (ctx) => {
    // 2–4 weeks for in-season re-emphasis. Default 14.
    // If EFI decoupling severe, push to 21.
    const decoupling = ctx.recent_activity.recent_efi_decoupling;
    if (decoupling !== null && decoupling > 0.10) return 21;
    return 14;
  },

  generate_sessions: (start, end, _ctx) => {
    const dates = enumerateDates(start, end);

    return dates.map((date, idx): GeneratedSession => {
      const dow = idx % 7;

      // Rest day: Monday (idx % 7 === 0)
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

      // Tempo session: Wednesday (dow === 2)
      if (dow === 2) {
        return {
          date,
          session_type: 'tempo',
          target_rss: 70,
          target_duration_min: 75,
          prescribed_intervals: [
            {
              duration_min: 18,
              target_pct_ftp_min: 76,
              target_pct_ftp_max: 87,
              recovery_min: 5,
              repeats: 2,
              notes: 'Tempo blocks @ 76–87% FTP',
            },
          ],
          long_ride_flag: false,
          notes: '2x 18 min @ 76–87% FTP. Aerobic plus a touch.',
        };
      }

      // Optional top-end maintenance: Friday (dow === 4)
      if (dow === 4) {
        return {
          date,
          session_type: 'tempo',
          target_rss: 65,
          target_duration_min: 75,
          prescribed_intervals: [
            {
              duration_min: 3,
              target_pct_ftp_min: 90,
              target_pct_ftp_max: 95,
              recovery_min: 3,
              repeats: 5,
              notes: 'Top-end maintenance — short and punchy',
            },
          ],
          long_ride_flag: false,
          notes: '5x 3 min @ 90–95% FTP. Top-end maintenance.',
        };
      }

      // Long Z2 ride: Saturday (dow === 5)
      if (dow === 5) {
        return {
          date,
          session_type: 'z2',
          target_rss: 110,
          target_duration_min: 180,
          prescribed_intervals: null,
          long_ride_flag: true,
          notes: 'Long Z2 (≤75% FTP). Build the aerobic floor.',
        };
      }

      // Default: easy Z2 fill day
      return {
        date,
        session_type: 'z2',
        target_rss: 55,
        target_duration_min: 75,
        prescribed_intervals: null,
        long_ride_flag: false,
        notes: 'Z2 base (65–75% FTP).',
      };
    });
  },

  progression_rule: (base, ctx, _dayIndex) => {
    const snap = latestSnapshot(ctx);
    if (!snap) return base;

    // If AFI growth >coefficient ceiling, hold volume by trimming intervals
    if (afiTfiRatio(ctx) > 1.15) {
      if (base.session_type === 'tempo') {
        return {
          ...base,
          target_rss: Math.round(base.target_rss * 0.75),
          notes: base.notes + ' [trimmed 25% — fatigue elevated]',
        };
      }
    }
    return base;
  },
};
