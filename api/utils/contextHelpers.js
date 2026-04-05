/**
 * Shared Context Helpers
 *
 * Common utilities used by both checkInContext.js and assembleFitnessContext.js
 * to ensure consistent data formatting across all AI coach surfaces.
 */

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
