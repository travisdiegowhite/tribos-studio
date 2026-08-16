/**
 * Metric Tooltips
 *
 * Returns context-aware tooltip copy for each metric based on its current value.
 * Pure functions — no API calls.
 */

/** TFI (Fitness) tooltip */
export function ctlTooltip(ctl: number): string {
  if (ctl >= 86)
    return 'Elite-level fitness (TFI, your long-term training load). Takes a long time to build and drops quickly without maintenance.';
  if (ctl >= 66)
    return 'Your fitness (TFI, long-term training load) reflects months of consistent work — the range of a competitive amateur.';
  if (ctl >= 46)
    return 'A good base of fitness (TFI, long-term training load) — enough to handle structured training and longer rides without falling apart.';
  if (ctl >= 26)
    return 'You\'re in a solid building phase. Fitness (TFI) climbs slowly — consistency over weeks is what moves this number.';
  return 'TFI (Training Fitness Index) measures long-term training load — how fit you are right now. Yours is early-stage, which is a great place to build from.';
}

/** AFI (Fatigue) tooltip — requires both AFI and TFI for ratio calculation */
export function atlTooltip(atl: number, ctl: number): string {
  const ratio = ctl > 0 ? atl / ctl : 1;
  if (ratio > 1.20)
    return 'Your recent training load is significantly outpacing your fitness. Rest days or easy rides are important now.';
  if (ratio > 1.05)
    return 'Short-term fatigue is above your fitness level. Normal during a training block — just don\'t stay here too long.';
  if (ratio >= 0.85)
    return 'Fatigue is in line with your fitness. This is the productive zone — you\'re working without digging a hole.';
  return 'AFI (Acute Fatigue Index) tracks short-term load — how tired you are from recent rides. Yours is low, meaning you\'re recovered.';
}

/** FS (Form) tooltip */
export function tsbTooltip(tsb: number): string {
  if (tsb > 15)
    return 'Your Form Score (fitness minus fatigue) says you\'re fully rested. If there\'s a race or big day coming, this is the window — fitness starts softening after a few days here.';
  if (tsb > 2)
    return 'Your Form Score (fitness minus fatigue) shows fatigue clearing while fitness holds. Good time for hard efforts, races, or key workouts.';
  if (tsb > -10)
    return 'A slightly negative Form Score (fitness minus fatigue) is ideal for training blocks. You\'re building fitness without excessive fatigue.';
  if (tsb > -20)
    return 'Your Form Score (fitness minus fatigue) shows you\'re working hard. This is where training happens — but recovery soon will unlock the adaptation.';
  return 'Form Score = yesterday\'s Fitness (TFI) minus yesterday\'s Fatigue (AFI). You\'re deep in a fatigue hole — hard efforts will feel tough and results won\'t reflect your fitness.';
}

/** Convenience object for importing all tooltips at once */
export const METRIC_TOOLTIPS = {
  ctl: ctlTooltip,
  atl: atlTooltip,
  tsb: tsbTooltip,
} as const;
