/**
 * Sequencer block operations — JavaScript runtime for /api/sequencer-*.
 *
 * Mirrors a subset of src/lib/training/blocks/. Per the existing pattern
 * (see metricsComputation.js): we inline the runtime path in JS rather than
 * importing TypeScript from src/lib in serverless functions.
 *
 * Phase 1 actively executes only the maintenance block plus shared gating
 * rules. The other 7 blocks (recovery, reactivation, aerobic_build, threshold,
 * vo2, race_specific, taper) live in TS as the spec-of-record and run via
 * tests + future client-side projection in Phase 2+.
 *
 * If you change either side, update the other. The TS source is the canonical
 * reference (spec §2 in docs/event-anchored-training-plans.md).
 */

// ── Helpers ─────────────────────────────────────────────────────────────────

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
  const snap = ctx.daily_stats[0];
  if (!snap || snap.tfi <= 0) return Infinity;
  return snap.afi / snap.tfi;
}

function afiGrowth4d(ctx) {
  if (ctx.daily_stats.length < 5) return 0;
  const today = ctx.daily_stats[0].afi;
  const fourDaysAgo = ctx.daily_stats[4].afi;
  if (fourDaysAgo <= 0) return 0;
  return (today - fourDaysAgo) / fourDaysAgo;
}

// ── Maintenance generator (mirrors src/lib/training/blocks/maintenance.ts) ─

/**
 * Generate per-day prescriptions for a maintenance block.
 *
 * @param {string} start YYYY-MM-DD inclusive
 * @param {string} end   YYYY-MM-DD inclusive
 * @returns {Array<GeneratedSession>}
 */
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

// ── Gating rules (spec §4.4) ────────────────────────────────────────────────

/**
 * Evaluate gating against a candidate prescription. Returns either:
 *   { gated: false }    — let the prescription through unchanged
 *   { gated: true, reason, substitute } — substitute prescription server-side
 *
 * Gating is evaluated server-side so two devices see the same answer.
 */
export function evaluateGating(ctx, prescription) {
  const snap = ctx.daily_stats[0];
  const wellnessToday = (ctx.subjective || []).find(
    (s) => s.date === prescription.date
  );

  // FS ≤ -15 → no quality work; substitute Z2 60–90 min
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

  // AFI growth >ceiling in last 4d → trim quality session by 25%
  const ceiling = ctx.coefficients?.afi_growth_ceiling_4d ?? 0.25;
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
          notes: prescription.notes + ' [trimmed 25% — AFI growth ceiling breached]',
        },
      };
    }
  }

  // HRV <0.5 SD below 7-day baseline → 24h delay on quality session
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

  // Subjective wellness ≤4/10 → full rest day
  if (wellnessToday?.wellness_score !== undefined && wellnessToday.wellness_score <= 4) {
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

// ── Coefficient resolver (spec §3.3) ────────────────────────────────────────

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
