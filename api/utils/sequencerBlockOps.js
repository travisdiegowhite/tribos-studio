/**
 * Sequencer block operations — JavaScript runtime for /api/sequencer-*.
 *
 * Mirrors src/lib/training/blocks/. Per the existing pattern (see
 * metricsComputation.js): we inline the runtime path in JS rather than
 * importing TypeScript from src/lib in serverless functions.
 *
 * Phase 2 brings parity with the TS spec across all 8 generators; the TS source
 * remains the canonical reference. If you change either side, update the other.
 */

// ── Shared helpers ──────────────────────────────────────────────────────────

function enumerateDates(start, end) {
  const out = [];
  const startDate = new Date(start + 'T00:00:00Z');
  const endDate = new Date(end + 'T00:00:00Z');
  for (
    let d = new Date(startDate);
    d <= endDate;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function afiTfiRatio(ctx) {
  const snap = ctx?.daily_stats?.[0];
  if (!snap || snap.tfi <= 0) return Infinity;
  return snap.afi / snap.tfi;
}

function afiGrowth4d(ctx) {
  if (!ctx?.daily_stats || ctx.daily_stats.length < 5) return 0;
  const today = ctx.daily_stats[0].afi;
  const fourDaysAgo = ctx.daily_stats[4].afi;
  if (fourDaysAgo <= 0) return 0;
  return (today - fourDaysAgo) / fourDaysAgo;
}

// ── Maintenance generator (mirrors src/lib/training/blocks/maintenance.ts) ──

export function generateMaintenanceSessions(start, end) {
  const dates = enumerateDates(start, end);

  return dates.map((date, idx) => {
    const dow = idx % 7;

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
}

// ── Recovery generator (mirrors src/lib/training/blocks/recovery.ts) ───────

export function generateRecoverySessions(start, end) {
  const dates = enumerateDates(start, end);
  return dates.map((date, idx) => {
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
}

// ── Reactivation generator (mirrors reactivation.ts) ───────────────────────

export function generateReactivationSessions(start, end) {
  const dates = enumerateDates(start, end);
  const totalDays = dates.length;

  return dates.map((date, idx) => {
    const ratio = idx / Math.max(1, totalDays - 1);

    const isRestDay = idx % 3 === 2;
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
}

// ── Aerobic Build generator (mirrors aerobicBuild.ts) ──────────────────────

export function generateAerobicBuildSessions(start, end) {
  const dates = enumerateDates(start, end);

  return dates.map((date, idx) => {
    const dow = idx % 7;

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
}

// ── Threshold generator (mirrors threshold.ts) ─────────────────────────────

export function generateThresholdSessions(start, end, ctx) {
  const dates = enumerateDates(start, end);
  const spacing = ctx?.coefficients?.hit_spacing_hours ?? 36;

  return dates.map((date, idx) => {
    const dow = idx % 7;
    const weekIndex = Math.floor(idx / 7);

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
}

// ── VO2 generator (mirrors vo2.ts) ─────────────────────────────────────────

export function generateVo2Sessions(start, end, ctx) {
  const dates = enumerateDates(start, end);
  const spacingHours = ctx?.coefficients?.hit_spacing_hours ?? 36;
  const stackEveryOther = spacingHours === 36;

  return dates.map((date, idx) => {
    const weekIdx = Math.floor(idx / 7);

    if (weekIdx === 0) {
      const isHitDay = stackEveryOther ? idx % 2 === 1 : idx % 3 === 1;
      if (isHitDay) {
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
          notes: 'VO2 quality (week 1, dense block).',
        };
      }
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
}

// ── Race-Specific generator (mirrors raceSpecific.ts) ──────────────────────

export function generateRaceSpecificSessions(start, end, ctx) {
  const dates = enumerateDates(start, end);
  const totalDays = dates.length;

  const raceType = (ctx?.upcoming_events?.[0]?.name ?? '').toLowerCase();
  const isCrit = raceType.includes('crit');
  const isGravel = raceType.includes('gravel');

  return dates.map((date, idx) => {
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
        return {
          date,
          session_type: 'race_sim',
          target_rss: 130,
          target_duration_min: 165,
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
      return {
        date,
        session_type: 'race_sim',
        target_rss: 120,
        target_duration_min: 150,
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

    return {
      date,
      session_type: 'z1',
      target_rss: 35,
      target_duration_min: 45,
      prescribed_intervals: null,
      long_ride_flag: false,
      notes: 'Easy Z1 — taper begins. Stay loose.',
    };
  });
}

// ── Taper generator (mirrors taper.ts) ─────────────────────────────────────

export function generateTaperSessions(start, end, ctx) {
  const dates = enumerateDates(start, end);
  const totalDays = dates.length;
  const tier = ctx?.upcoming_events?.[0]?.tier ?? ctx?.event_tier ?? 'B';

  return dates.map((date, idx) => {
    const daysToRace = totalDays - idx;
    let volumeFactor;
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
}

// ── Block-type dispatch ────────────────────────────────────────────────────

/**
 * Dispatch generator by block_type. `ctx` is optional but recommended for
 * ctx-aware blocks (threshold, vo2, race_specific, taper).
 *
 * @param {string} blockType
 * @param {string} start YYYY-MM-DD inclusive
 * @param {string} end   YYYY-MM-DD inclusive
 * @param {object} [ctx] sequencer context (optional for ctx-free blocks)
 * @returns {Array<GeneratedSession>}
 */
export function generateSessionsForBlock(blockType, start, end, ctx) {
  switch (blockType) {
    case 'maintenance':
      return generateMaintenanceSessions(start, end);
    case 'recovery':
      return generateRecoverySessions(start, end);
    case 'reactivation':
      return generateReactivationSessions(start, end);
    case 'aerobic_build':
      return generateAerobicBuildSessions(start, end);
    case 'threshold':
      return generateThresholdSessions(start, end, ctx);
    case 'vo2':
      return generateVo2Sessions(start, end, ctx);
    case 'race_specific':
      return generateRaceSpecificSessions(start, end, ctx);
    case 'taper':
      return generateTaperSessions(start, end, ctx);
    default:
      throw new Error(`Unknown block_type: ${blockType}`);
  }
}

// ── Gating rules (spec §4.4) ───────────────────────────────────────────────

export function evaluateGating(ctx, prescription) {
  const snap = ctx?.daily_stats?.[0];
  const wellnessToday = (ctx?.subjective || []).find(
    (s) => s.date === prescription.date
  );

  if (snap && snap.form_score <= -15) {
    if (
      prescription.session_type === 'threshold' ||
      prescription.session_type === 'vo2' ||
      prescription.session_type === 'tempo'
    ) {
      return {
        gated: true,
        reason: 'FS ≤ -15: no quality work today. Substituting Z2.',
        substitute: {
          ...prescription,
          session_type: 'z2',
          target_rss: 55,
          target_duration_min: 75,
          prescribed_intervals: null,
          notes: 'Auto-swapped to Z2 — Form Score below -15.',
        },
      };
    }
  }

  const ceiling = ctx?.coefficients?.afi_growth_ceiling_4d ?? 0.25;
  if (afiGrowth4d(ctx) > ceiling) {
    if (
      prescription.session_type === 'threshold' ||
      prescription.session_type === 'vo2' ||
      prescription.session_type === 'tempo'
    ) {
      return {
        gated: true,
        reason: `AFI growth >${Math.round(ceiling * 100)}% in last 4 days. Reducing interval volume 25%.`,
        substitute: {
          ...prescription,
          target_rss: Math.round(prescription.target_rss * 0.75),
          notes:
            prescription.notes +
            ' [trimmed 25% — AFI growth ceiling breached]',
        },
      };
    }
  }

  if (
    wellnessToday?.hrv_baseline_sd !== undefined &&
    wellnessToday.hrv_baseline_sd < -0.5 &&
    (prescription.session_type === 'threshold' ||
      prescription.session_type === 'vo2')
  ) {
    return {
      gated: true,
      reason: 'HRV >0.5 SD below baseline. Pushing quality session by 24h.',
      substitute: {
        ...prescription,
        session_type: 'z1',
        target_rss: 30,
        target_duration_min: 45,
        prescribed_intervals: null,
        notes: 'HRV-gated: easy Z1 today, quality pushed.',
      },
    };
  }

  if (
    wellnessToday?.wellness_score !== undefined &&
    wellnessToday.wellness_score <= 4
  ) {
    return {
      gated: true,
      reason: 'Wellness score ≤4/10. Taking a full rest day.',
      substitute: {
        ...prescription,
        session_type: 'rest',
        target_rss: 0,
        target_duration_min: 0,
        prescribed_intervals: null,
        notes: 'Wellness flag — full rest day.',
      },
    };
  }

  return { gated: false };
}

// ── Upward progression (Phase 2) ───────────────────────────────────────────
//
// Sibling to evaluateGating: proposes making a session HARDER when the athlete
// is demonstrably fresh or fitter than the plan assumes. Suggest-and-confirm —
// callers turn the substitute into a block_modifications proposal, never an
// auto-write. evaluateGating always wins (callers run it first and skip
// progression on any day it would ease).
//
// Requires ctx.current_block.block_type to reflect the *prescription's* block
// (the proposer sets this per block), and ctx.progression.ftp_rise_pct for the
// FTP-gain signal.

const FRESH_FS_THRESHOLD = 20;       // FS > +20 = too fresh (losing fitness)
const FTP_RISE_THRESHOLD = 0.05;     // estimated FTP up >5%
const AHEAD_TFI_THRESHOLD = 0.03;    // actual TFI >3% above plan's projected TFI
const RACE_LOCKOUT_DAYS = 10;        // don't add load inside the taper window
const PROGRESSION_BLOCKS = new Set(['aerobic_build', 'threshold', 'vo2', 'maintenance']);
const PROGRESSION_LADDER = { z2: 'tempo', tempo: 'threshold', threshold: 'vo2' };
const PROGRESSION_RSS_BUMP = 1.12;
const PROGRESSION_RSS_CAP = 130;

function daysBetweenIso(fromDate, toDate) {
  const a = new Date(fromDate + 'T00:00:00Z');
  const b = new Date(toDate + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

export function evaluateProgression(ctx, prescription) {
  const snap = ctx?.daily_stats?.[0];
  const fresh = !!snap && snap.form_score > FRESH_FS_THRESHOLD;
  const ftpRisePct = ctx?.progression?.ftp_rise_pct ?? 0;
  const ftpRise = ftpRisePct > FTP_RISE_THRESHOLD;
  const aheadPct = ctx?.progression?.tfi_ahead_pct ?? 0;
  const ahead = aheadPct > AHEAD_TFI_THRESHOLD;
  if (!fresh && !ftpRise && !ahead) return { upgraded: false };

  // Only escalate inside build-type blocks (never taper/recovery/race_specific).
  const blockType = ctx?.current_block?.block_type;
  if (!PROGRESSION_BLOCKS.has(blockType)) return { upgraded: false };

  // Never add load inside the taper window of an A race.
  const aRace = (ctx?.upcoming_events || []).find(
    (e) => e.tier === 'A' && e.status === 'upcoming'
  );
  if (aRace && prescription?.date) {
    const d = daysBetweenIso(prescription.date, aRace.date);
    if (d >= 0 && d <= RACE_LOCKOUT_DAYS) return { upgraded: false };
  }

  // Only when the athlete is genuinely recovering — not already ramping fatigue.
  if (afiGrowth4d(ctx) > 0) return { upgraded: false };

  // Eligible days: bump endurance/tempo; step threshold up only on a real FTP gain.
  const eligible =
    prescription.session_type === 'z2' ||
    prescription.session_type === 'tempo' ||
    (prescription.session_type === 'threshold' && (ftpRise || ahead));
  const nextType = eligible ? PROGRESSION_LADDER[prescription.session_type] : null;
  if (!nextType) return { upgraded: false };

  const baseRss = prescription.target_rss || 0;
  const target_rss = Math.min(
    PROGRESSION_RSS_CAP,
    Math.max(Math.round(baseRss * PROGRESSION_RSS_BUMP), baseRss + 5)
  );

  const reason = fresh
    ? `Form Score +${Math.round(snap.form_score)} — you're carrying freshness to spare; nudging this session up.`
    : ahead
      ? `You're ~${Math.round(aheadPct * 100)}% ahead of your plan's projected fitness — adding a bit more.`
      : `Recent power suggests ~${Math.round(ftpRisePct * 100)}% more FTP — bumping load (consider updating your FTP in settings).`;

  return {
    upgraded: true,
    reason,
    substitute: {
      ...prescription,
      session_type: nextType,
      target_rss,
      notes: `${prescription.notes ? prescription.notes + ' ' : ''}[progression: ${prescription.session_type}→${nextType}]`,
    },
  };
}

// ── Coefficient resolver (spec §3.3) ───────────────────────────────────────

const STANDARD_FACTOR = {
  recovery_block_days_added: 0,
  hit_spacing_hours: 36,
  afi_growth_ceiling_4d: 0.25,
  afi_tfi_gate: 1.10,
  fs_recovery_target: -5,
};
const CONSERVATIVE_FACTOR = {
  recovery_block_days_added: 1,
  hit_spacing_hours: 48,
  afi_growth_ceiling_4d: 0.20,
  afi_tfi_gate: 1.10,
  fs_recovery_target: -7,
};
const ADAPTIVE_FACTOR = {
  recovery_block_days_added: 0,
  hit_spacing_hours: 36,
  afi_growth_ceiling_4d: 0.20,
  afi_tfi_gate: 1.05,
  fs_recovery_target: -3,
};

export function coefficientsForMode(mode) {
  if (mode === 'conservative') return CONSERVATIVE_FACTOR;
  if (mode === 'adaptive') return ADAPTIVE_FACTOR;
  return STANDARD_FACTOR;
}
