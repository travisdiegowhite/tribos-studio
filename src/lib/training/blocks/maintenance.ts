/**
 * Maintenance block (spec §2.8).
 *
 * Hold fitness across periods where build-block density isn't viable.
 * Phase 1's primary block (used for open-horizon mode by default).
 *
 * Hickson 1985: trained athletes maintain VO2max for 15 weeks at 1/3 original
 * volume IF intensity is preserved.
 */

import type { BlockDefinition, GeneratedSession } from './types';
import { enumerateDates } from './types';

const HARD_MIN_DAYS = 7;
const HARD_MAX_DAYS = 84; // can be held indefinitely; we keep 12 weeks as a sane upper bound per cycle

export const maintenance: BlockDefinition = {
  type: 'maintenance',

  // Maintenance is the always-available default block. Entry is unconditional;
  // the sequencer decides when to apply it.
  entry_conditions: (_ctx) => true,

  // No exit condition from data — exits when sequencer schedules a build block
  // (next race-prep window) or rider switches modes.
  exit_conditions: (_ctx) => false,

  duration_range: [HARD_MIN_DAYS, HARD_MAX_DAYS],

  default_duration: (_ctx) => 21, // 3 weeks per cycle (spec §6.1)

  generate_sessions: (start, end, _ctx) => {
    const dates = enumerateDates(start, end);

    return dates.map((date, idx): GeneratedSession => {
      const dow = idx % 7;

      // Monday: rest
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

      // Tuesday: threshold-flavored quality
      if (dow === 1) {
        return {
          date,
          session_type: 'threshold',
          target_rss: 75,
          target_duration_min: 65,
          prescribed_intervals: [
            {
              duration_min: 15,
              target_pct_ftp_min: 92,
              target_pct_ftp_max: 95,
              recovery_min: 5,
              repeats: 2,
              notes: 'Sweet-spot maintenance dose',
            },
          ],
          long_ride_flag: false,
          notes: '2x 15 min @ 92–95% FTP. Threshold maintenance.',
        };
      }

      // Wednesday: easy Z2
      if (dow === 2) {
        return {
          date,
          session_type: 'z2',
          target_rss: 45,
          target_duration_min: 60,
          prescribed_intervals: null,
          long_ride_flag: false,
          notes: 'Z2 base.',
        };
      }

      // Thursday: VO2-flavored quality
      if (dow === 3) {
        return {
          date,
          session_type: 'vo2',
          target_rss: 70,
          target_duration_min: 60,
          prescribed_intervals: [
            {
              duration_min: 4,
              target_pct_ftp_min: 105,
              target_pct_ftp_max: 110,
              recovery_min: 3,
              repeats: 4,
              notes: 'Classic 4-min reps — maintenance dose',
            },
          ],
          long_ride_flag: false,
          notes: '4x 4 min @ 105–110% FTP. VO2 maintenance.',
        };
      }

      // Friday: short Z2
      if (dow === 4) {
        return {
          date,
          session_type: 'z2',
          target_rss: 40,
          target_duration_min: 50,
          prescribed_intervals: null,
          long_ride_flag: false,
          notes: 'Z2 spin.',
        };
      }

      // Saturday: long ride at 80% of build-block volume
      if (dow === 5) {
        return {
          date,
          session_type: 'z2',
          target_rss: 90,
          target_duration_min: 145,
          prescribed_intervals: null,
          long_ride_flag: true,
          notes: 'Long Z2 — 80% of full-build volume. Conversational.',
        };
      }

      // Sunday: easy Z1 spin
      return {
        date,
        session_type: 'z1',
        target_rss: 30,
        target_duration_min: 50,
        prescribed_intervals: null,
        long_ride_flag: false,
        notes: 'Easy Z1 spin or active recovery.',
      };
    });
  },

  progression_rule: (base, _ctx, _dayIndex) => {
    // No progression. Block holds fitness flat by design.
    return base;
  },
};
