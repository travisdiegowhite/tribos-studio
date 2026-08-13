/**
 * Race-Specific block (spec §2.6).
 *
 * Rehearse event demands, finalize equipment + fueling, transition into taper.
 * Largely coaching consensus (acknowledged in-product per spec brand voice).
 */

import type { BlockDefinition, GeneratedSession } from './types';
import { afiTfiRatio, enumerateDates } from './types';
import { longRideTargetMin, volumeScale, z2RssForDuration } from './raceDemand';

const HARD_MIN_DAYS = 7;
const HARD_MAX_DAYS = 14;

export const raceSpecific: BlockDefinition = {
  type: 'race_specific',

  entry_conditions: (ctx) => {
    if (afiTfiRatio(ctx) > 1.10) return false;

    // 7–14 days from goal event
    const nextEvent = ctx.upcoming_events[0];
    if (!nextEvent) return false;
    const today = new Date(ctx.today + 'T00:00:00Z');
    const eventDate = new Date(nextEvent.date + 'T00:00:00Z');
    const daysUntil = Math.round(
      (eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysUntil >= 7 && daysUntil <= 14;
  },

  exit_conditions: (ctx) => {
    const nextEvent = ctx.upcoming_events[0];
    if (!nextEvent) return false;
    const today = new Date(ctx.today + 'T00:00:00Z');
    const eventDate = new Date(nextEvent.date + 'T00:00:00Z');
    const daysUntil = Math.round(
      (eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysUntil <= 2;
  },

  duration_range: [HARD_MIN_DAYS, HARD_MAX_DAYS],

  default_duration: (ctx) => {
    const nextEvent = ctx.upcoming_events[0];
    if (!nextEvent) return 7;
    const today = new Date(ctx.today + 'T00:00:00Z');
    const eventDate = new Date(nextEvent.date + 'T00:00:00Z');
    const daysUntil = Math.round(
      (eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    return Math.max(7, Math.min(14, daysUntil - 2));
  },

  generate_sessions: (start, end, ctx) => {
    const dates = enumerateDates(start, end);
    const totalDays = dates.length;

    // Race type drives the simulation session contents. Prefer the structured
    // race_type from race_demand; the name sniff stays as a fallback.
    const raceDemand = ctx?.race_demand ?? null;
    const fillScale = volumeScale(raceDemand);
    const structuredType = raceDemand?.race_type ?? '';
    const raceType = ctx.upcoming_events[0]?.name?.toLowerCase() ?? '';
    const isCrit = structuredType === 'criterium' || raceType.includes('crit');
    const isGravel = structuredType === 'gravel' || raceType.includes('gravel');
    // Long races need endurance rehearsal inside the race-specific block, not
    // just openers and spins.
    const isLongRace = !!raceDemand && raceDemand.goal_duration_min >= 240;

    return dates.map((date, idx): GeneratedSession => {
      // Race simulation early in block
      if (idx === 1) {
        if (isCrit) {
          return {
            date,
            session_type: 'race_sim',
            target_rss: 110,
            target_duration_min: 75,
            prescribed_intervals: [
              {
                duration_min: 0.75,
                target_pct_ftp_min: 110,
                target_pct_ftp_max: 130,
                recovery_min: 1.25,
                repeats: 10,
                notes: 'Crit-style 30–60s repeats',
              },
              {
                duration_min: 1.5,
                target_pct_ftp_min: 105,
                target_pct_ftp_max: 115,
                recovery_min: 3,
                repeats: 3,
                notes: 'Mid-race surges',
              },
            ],
            long_ride_flag: false,
            notes: 'Crit simulation: short repeats + mid-race surges.',
          };
        }
        if (isGravel) {
          const simMin = raceDemand
            ? Math.max(165, longRideTargetMin(raceDemand, date, 165))
            : 165;
          return {
            date,
            session_type: 'race_sim',
            target_rss: raceDemand ? Math.round(simMin * 0.75) : 130,
            target_duration_min: simMin,
            prescribed_intervals: [
              {
                duration_min: 30,
                target_pct_ftp_min: 85,
                target_pct_ftp_max: 95,
                recovery_min: 5,
                repeats: 3,
                notes: 'Sub-threshold blocks (90 min total)',
              },
              {
                duration_min: 4,
                target_pct_ftp_min: 100,
                target_pct_ftp_max: 110,
                recovery_min: 4,
                repeats: 5,
                notes: 'Hard surges within ride',
              },
            ],
            long_ride_flag: true,
            notes:
              'Gravel race simulation: 90 min sub-threshold + 5x 4 min surges. Rehearse fueling.',
          };
        }
        // Default: granfondo/road race
        const defaultSimMin = raceDemand
          ? Math.max(150, longRideTargetMin(raceDemand, date, 150))
          : 150;
        return {
          date,
          session_type: 'race_sim',
          target_rss: raceDemand ? Math.round(defaultSimMin * 0.8) : 120,
          target_duration_min: defaultSimMin,
          prescribed_intervals: [
            {
              duration_min: 35,
              target_pct_ftp_min: 80,
              target_pct_ftp_max: 87,
              recovery_min: 5,
              repeats: 1,
              notes: 'Sustained tempo',
            },
            {
              duration_min: 5,
              target_pct_ftp_min: 100,
              target_pct_ftp_max: 105,
              recovery_min: 5,
              repeats: 4,
              notes: '4x 5 min @ 100–105% on event-similar terrain',
            },
          ],
          long_ride_flag: true,
          notes:
            'Race simulation: 35 min tempo + 4x 5 min @ 100–105%. Lock equipment + fueling.',
        };
      }

      // Opener 2–3 days before race (last 2 days)
      if (idx === totalDays - 2) {
        return {
          date,
          session_type: 'opener',
          target_rss: 35,
          target_duration_min: 60,
          prescribed_intervals: [
            {
              duration_min: 1,
              target_pct_ftp_min: 100,
              target_pct_ftp_max: 110,
              recovery_min: 2,
              repeats: 4,
              notes: '4x 1 min openers',
            },
            {
              duration_min: 0.25,
              target_pct_ftp_min: 110,
              target_pct_ftp_max: 130,
              recovery_min: 1.75,
              repeats: 4,
              notes: '15s standing accelerations',
            },
          ],
          long_ride_flag: false,
          notes:
            'Opener: 60 min easy + 4x 1 min @ 100–110% + 4x 15s standing accelerations.',
        };
      }

      // Otherwise reduced Z1/Z2 with rest days
      const dow = idx % 7;
      if (dow === 0 || idx === totalDays - 1) {
        return {
          date,
          session_type: 'rest',
          target_rss: 0,
          target_duration_min: 0,
          prescribed_intervals: null,
          long_ride_flag: false,
          notes: 'Rest. Final taper.',
        };
      }

      // Long races: one more substantial endurance day mid-block (idx 4 —
      // safely clear of the race-sim at 1, the opener at totalDays-2, and the
      // final-taper rest days), at 60% of goal duration capped by the ramp.
      if (isLongRace && idx === 4 && idx < totalDays - 5) {
        const enduranceMin = Math.min(
          Math.round((raceDemand!.goal_duration_min * 0.6) / 5) * 5,
          longRideTargetMin(raceDemand, date, 150)
        );
        return {
          date,
          session_type: 'z2',
          target_rss: z2RssForDuration(enduranceMin),
          target_duration_min: enduranceMin,
          prescribed_intervals: null,
          long_ride_flag: true,
          notes: 'Final long Z2 before the taper-in. Rehearse race-day fueling.',
        };
      }

      // Long races earn slightly longer easy spins early in the block; the
      // final 5 days before race day keep the historical 45-min taper-in.
      const spinMin = isLongRace && idx < totalDays - 5 ? Math.round(45 * fillScale) : 45;
      return {
        date,
        session_type: 'z1',
        target_rss: spinMin === 45 ? 35 : Math.round(35 * (spinMin / 45)),
        target_duration_min: spinMin,
        prescribed_intervals: null,
        long_ride_flag: false,
        notes: 'Easy Z1 — taper begins. Stay loose.',
      };
    });
  },

  progression_rule: (base, _ctx, _dayIndex) => {
    // No progression in race-specific block. Bad sessions are noted, not chased.
    return base;
  },
};
