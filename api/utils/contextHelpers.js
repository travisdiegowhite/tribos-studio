/**
 * Shared Context Helpers
 *
 * Common utilities used by both checkInContext.js and assembleFitnessContext.js
 * to ensure consistent data formatting across all AI coach surfaces.
 */

import { BLOCK_INFO } from './arcBuilder.js';

/**
 * Format a Date as YYYY-MM-DD in the given IANA timezone.
 * Falls back to UTC ISO date if the timezone is invalid.
 */
export function formatDateInTz(date, tz) {
  try {
    // en-CA locale yields YYYY-MM-DD format
    return date.toLocaleDateString('en-CA', { timeZone: tz });
  } catch {
    return date.toISOString().split('T')[0];
  }
}

/**
 * Get the day-of-week number (0=Sun..6=Sat) in the given IANA timezone.
 * Falls back to the server's local day if the timezone is invalid.
 */
export function getDayOfWeekInTz(date, tz) {
  try {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: tz });
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[dayName] ?? date.getDay();
  } catch {
    return date.getDay();
  }
}

/**
 * Monday-based bounds of the current week in the user's timezone.
 * weekEndStr is the NEXT Monday (exclusive upper bound for scheduled_date ranges).
 *
 * @param {Date} now
 * @param {string} tz IANA timezone
 * @returns {{ weekStartStr: string, weekEndStr: string }}
 */
export function weekBoundsInTz(now, tz) {
  const dayOfWeek = getDayOfWeekInTz(now, tz);
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - mondayOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return {
    weekStartStr: formatDateInTz(weekStart, tz),
    weekEndStr: formatDateInTz(weekEnd, tz),
  };
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The plan's REAL current week, derived from its start date — never trust
 * training_plans.current_week, which is written as 1 at creation and (until
 * the arc-refill sync shipped alongside this helper) was never advanced.
 *
 * @param {{ start_date?: string|null, started_at?: string|null, duration_weeks?: number|null }} plan
 * @param {string} todayStr user-local YYYY-MM-DD
 * @returns {number} 1-based week, clamped to [1, duration_weeks]
 */
export function deriveCurrentWeek(plan, todayStr) {
  const start = String(plan?.started_at || plan?.start_date || '').slice(0, 10);
  if (!YMD_RE.test(start) || !YMD_RE.test(String(todayStr))) return 1;
  const days = Math.round(
    (new Date(todayStr + 'T00:00:00Z') - new Date(start + 'T00:00:00Z')) / 86400000
  );
  let week = Math.floor(days / 7) + 1;
  if (week < 1) week = 1;
  const totalWeeks = Number(plan?.duration_weeks) || 0;
  if (totalWeeks > 0 && week > totalWeeks) week = totalWeeks;
  return week;
}

/**
 * Phase from an arc plan's `blocks` JSONB by calendar date — the authoritative
 * source when present (the ratio heuristic in derivePhase can't know that an
 * arc front-loads maintenance/reactivation filler). Returns null when blocks
 * are absent/invalid so callers can fall back to derivePhase.
 *
 * Dates outside the arc resolve to the nearest block (before → first,
 * after → last); a gap between blocks resolves to the next upcoming block.
 *
 * @param {Array<{block_type: string, start_date: string, end_date: string}>|null} blocks
 * @param {string} todayStr user-local YYYY-MM-DD
 * @returns {{ blockType: string, blockName: string, blockPurpose: string }|null}
 */
export function derivePhaseFromBlocks(blocks, todayStr) {
  if (!Array.isArray(blocks) || !YMD_RE.test(String(todayStr))) return null;
  const valid = blocks.filter(
    (b) => b && b.block_type && YMD_RE.test(String(b.start_date)) && YMD_RE.test(String(b.end_date))
  );
  if (valid.length === 0) return null;

  const sorted = [...valid].sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
  let block = sorted.find((b) => b.start_date <= todayStr && todayStr <= b.end_date);
  if (!block) {
    if (todayStr < sorted[0].start_date) {
      block = sorted[0];
    } else if (todayStr > sorted[sorted.length - 1].end_date) {
      block = sorted[sorted.length - 1];
    } else {
      // Gap between blocks — attribute to the next upcoming block.
      block = sorted.find((b) => b.start_date > todayStr) || sorted[sorted.length - 1];
    }
  }

  const info = BLOCK_INFO[block.block_type];
  const purpose = info?.why ? info.why.charAt(0).toUpperCase() + info.why.slice(1) + '.' : '';
  return {
    blockType: block.block_type,
    blockName: info?.label || block.block_type,
    blockPurpose: purpose,
  };
}

/**
 * Derive training phase/block from current week position and methodology.
 */
export function derivePhase(currentWeek, totalWeeks, methodology) {
  if (!currentWeek || !totalWeeks) {
    return { blockName: 'General Training', blockPurpose: 'Build overall fitness and consistency.' };
  }

  const ratio = currentWeek / totalWeeks;
  const methodPrefix = methodology || 'general';

  if (ratio <= 0.33) {
    const purposes = {
      polarized: 'Develop aerobic foundation through high-volume low-intensity work with occasional high-intensity touches.',
      sweet_spot: 'Build aerobic base with sustainable sub-threshold efforts to maximize training efficiency.',
      pyramidal: 'Establish a wide aerobic base with gradually increasing intensity distribution.',
      threshold: 'Develop aerobic capacity to support upcoming threshold-focused work.',
      endurance: 'Build deep aerobic foundation and movement efficiency through steady volume.',
    };
    return {
      blockName: 'Base Building',
      blockPurpose: purposes[methodPrefix] || 'Develop aerobic foundation and movement efficiency.',
    };
  }

  if (ratio <= 0.66) {
    const purposes = {
      polarized: 'Increase high-intensity stimulus while maintaining aerobic volume.',
      sweet_spot: 'Progress sweet spot duration and frequency to push FTP ceiling higher.',
      pyramidal: 'Shift intensity distribution toward more tempo and threshold work.',
      threshold: 'Extend time at threshold to drive FTP adaptation.',
      endurance: 'Add targeted intensity to the aerobic base for race-specific fitness.',
    };
    return {
      blockName: 'Build',
      blockPurpose: purposes[methodPrefix] || 'Increase intensity and sport-specific fitness.',
    };
  }

  if (ratio <= 0.85) {
    return {
      blockName: 'Peak',
      blockPurpose: 'Sharpen race-specific efforts at target intensity. Maintain volume, maximize quality.',
    };
  }

  return {
    blockName: 'Taper',
    blockPurpose: 'Reduce volume while maintaining intensity. Arrive at race day fresh and sharp.',
  };
}

/**
 * Format the week schedule as structured data for both the AI prompt and UI.
 */
export function formatWeekSchedule(weekWorkouts) {
  if (!weekWorkouts || weekWorkouts.length === 0) {
    return [];
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return weekWorkouts
    .sort((a, b) => (a.day_of_week ?? 0) - (b.day_of_week ?? 0))
    .map((w) => ({
      id: w.id || null,
      day: dayNames[w.day_of_week] || `Day${w.day_of_week}`,
      day_of_week: w.day_of_week,
      scheduled_date: w.scheduled_date || null,
      name: w.name || w.workout_type || 'Workout',
      workout_type: w.workout_type || 'ride',
      target_tss: w.target_tss || 0,
      actual_tss: w.actual_tss || 0,
      completed: !!w.completed,
      has_activity: !!w.activity_id,
    }));
}

/**
 * Serialize week schedule to text for the AI system prompt.
 * @param {Array} weekSchedule - Formatted week schedule
 * @param {Map<string, string>} [coachAnnotations] - Map of workout_id → annotation string
 */
export function weekScheduleToText(weekSchedule, coachAnnotations) {
  if (!weekSchedule || weekSchedule.length === 0) {
    return 'No planned workouts this week.';
  }

  return weekSchedule
    .map((w) => {
      const status = w.completed ? 'DONE' : w.has_activity ? 'PARTIAL' : 'PLANNED';
      const tssInfo = w.target_tss
        ? `planned=${w.target_tss}${w.actual_tss ? ` actual=${w.actual_tss}` : ''}`
        : '';
      const dateLabel = w.scheduled_date ? ` (${w.scheduled_date})` : '';
      const annotation = (coachAnnotations && w.id && coachAnnotations.has(w.id))
        ? ` ${coachAnnotations.get(w.id)}`
        : '';
      return `${w.day}${dateLabel}: ${w.name} [${status}] ${tssInfo}${annotation}`.trim();
    })
    .join('\n');
}

/**
 * Format health metrics as a compact string for AI prompts.
 */
export function formatHealth(health) {
  if (!health) return 'No health data available.';
  const parts = [
    health.resting_hr ? `RHR: ${health.resting_hr}bpm` : null,
    health.hrv_ms ? `HRV: ${health.hrv_ms}ms` : null,
    health.sleep_hours ? `Sleep: ${health.sleep_hours}h` : null,
    health.sleep_quality ? `Sleep quality: ${health.sleep_quality}/5` : null,
    health.energy_level ? `Energy: ${health.energy_level}/5` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' | ') : 'No health data available.';
}

/**
 * Format proprietary metrics (EFI/TWL/TCAS) as a text block for AI prompts.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @returns {Promise<string|null>} Formatted metrics text or null if none available
 */
export async function fetchProprietaryMetrics(supabase, userId) {
  try {
    const [efiRow, twlRow, tcasRow] = await Promise.all([
      supabase
        .from('activity_efi')
        .select('efi, efi_28d, vf, ifs, cf')
        .eq('user_id', userId)
        .order('computed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('activity_twl')
        .select('twl, base_tss, m_terrain')
        .eq('user_id', userId)
        .order('computed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('weekly_tcas')
        .select('tcas, he, aq, taa')
        .eq('user_id', userId)
        .order('week_ending', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const efi = efiRow.data;
    const twl = twlRow.data;
    const tcas = tcasRow.data;

    if (!efi && !twl && !tcas) return null;

    const sections = [];
    if (efi) {
      sections.push(`EFI (Execution Fidelity): ${efi.efi_28d ?? efi.efi}/100 (28-day rolling)`);
      sections.push(`  Volume Fidelity: ${pctFmt(efi.vf)}, Intensity Fidelity: ${pctFmt(efi.ifs)}, Consistency: ${pctFmt(efi.cf)}`);
    }
    if (twl) {
      sections.push(`TWL (Terrain-Weighted Load, last ride): ${twl.twl} (base TSS: ${twl.base_tss}, multiplier: ${twl.m_terrain?.toFixed(3)}x)`);
    }
    if (tcas) {
      sections.push(`TCAS (Time-Constrained Adaptation): ${tcas.tcas}/100`);
      sections.push(`  Hours Efficiency: ${tcas.he?.toFixed(2)}, Adaptation Quality: ${tcas.aq?.toFixed(2)}, Training Age Adj: ${tcas.taa?.toFixed(2)}x`);
    }
    return sections.join('\n');
  } catch (err) {
    console.warn('[fetchProprietaryMetrics] Non-critical fetch failed:', err.message);
    return null;
  }
}

function pctFmt(v) {
  if (v == null) return 'N/A';
  return `${(v * 100).toFixed(0)}%`;
}
