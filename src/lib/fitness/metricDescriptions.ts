/**
 * Metric descriptions for acronym-labeling compliance (bible §9).
 *
 * Every acronym must appear with its full name on first mention per screen
 * and have a tooltip available on all subsequent uses.
 *
 * `full`       — the spelled-out metric name (used in headers, tooltips)
 * `definition` — one sentence, plain language, for tooltip body
 */
export const METRIC_DESCRIPTIONS = {
  RSS: {
    full: 'Ride Stress Score',
    definition: 'How hard a ride was, accounting for intensity and duration.',
  },
  TFI: {
    full: 'Training Fitness Index',
    definition: 'Your long-term training load — how fit you are right now.',
  },
  AFI: {
    full: 'Acute Fatigue Index',
    definition: 'Your short-term training load — how tired you are right now.',
  },
  FS: {
    full: 'Form Score',
    definition: 'Your readiness to perform. Positive = fresh, negative = fatigued.',
  },
  EP: {
    full: 'Effective Power',
    definition: 'The physiologically-representative power for a ride, accounting for surges.',
  },
  RI: {
    full: 'Ride Intensity',
    definition: 'How hard a ride was relative to your threshold.',
  },
  EFI: {
    full: 'Execution Fidelity Index',
    definition: 'How closely you executed your prescribed training.',
  },
  TWL: {
    full: 'Terrain-Weighted Load',
    definition: 'Training load adjusted for terrain difficulty.',
  },
  TCAS: {
    full: 'Training Capacity Acquisition Score',
    definition: 'How efficiently you\'re training for the hours you\'re putting in.',
  },
  FAR: {
    full: 'Fitness Acquisition Rate',
    definition: 'How fast you\'re building fitness, relative to a sustainable pace.',
  },
} as const;

export type MetricAcronym = keyof typeof METRIC_DESCRIPTIONS;
