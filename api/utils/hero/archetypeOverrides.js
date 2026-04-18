/**
 * Archetype overrides for the Today Hero paragraph.
 *
 * Per-persona config for tone palette, Form-Score classification thresholds,
 * race anchor cutoff, slot templates, and deterministic fallback phrases used
 * when Haiku output fails validation.
 *
 * The fallback strings here are placeholders. They satisfy the assembler
 * contract (word-count + no-digit + no-proper-noun rules) but are not
 * voice-bible-approved copy. They will be replaced upstream before launch.
 */

const DEFAULT_FS_THRESHOLDS = Object.freeze({
  fresh: 5,
  fatigued: -5,
  deeply_fatigued: -15,
});

// Default: how many days before a priority race the "next anchor" slot
// switches from "next workout" to "upcoming race". Rough gut value per
// Today Hero spec; per-archetype overrides allowed below.
const DEFAULT_RACE_ANCHOR_CUTOFF_DAYS = 42;

const DEFAULT_TONE_PALETTE = Object.freeze(['positive', 'neutral', 'caution', 'warning']);

const ARCHETYPE_OVERRIDES = {
  hammer: {
    tonePalette: DEFAULT_TONE_PALETTE,
    fsThresholds: DEFAULT_FS_THRESHOLDS,
    raceAnchorCutoff: 35,
    slotTemplates: {
      ridePrefix: 'Yesterday',
      blockPrefix: 'Block',
      weekPrefix: 'This week',
      anchorPrefix: 'Next up',
    },
    // TODO: replace with voice-bible-approved copy before launch.
    fallbacks: {
      opener: 'Time to work.',
      rideDescriptor: 'solid effort',
      intensityModifier: 'sharp',
      blockInterpretation: 'the block is still asking for sharp efforts',
      coldStart: 'Pick a plan and start this week.',
    },
  },

  scientist: {
    tonePalette: DEFAULT_TONE_PALETTE,
    fsThresholds: DEFAULT_FS_THRESHOLDS,
    raceAnchorCutoff: DEFAULT_RACE_ANCHOR_CUTOFF_DAYS,
    slotTemplates: {
      ridePrefix: 'Yesterday',
      blockPrefix: 'Phase',
      weekPrefix: 'This week',
      anchorPrefix: 'Next',
    },
    // TODO: replace with voice-bible-approved copy before launch.
    fallbacks: {
      opener: 'Here is where the data stands.',
      rideDescriptor: 'aerobic session',
      intensityModifier: 'targeted',
      blockInterpretation: 'the current phase is accumulating aerobic stimulus',
      coldStart: 'Set a plan so the data has a purpose.',
    },
  },

  encourager: {
    tonePalette: DEFAULT_TONE_PALETTE,
    fsThresholds: DEFAULT_FS_THRESHOLDS,
    raceAnchorCutoff: DEFAULT_RACE_ANCHOR_CUTOFF_DAYS,
    slotTemplates: {
      ridePrefix: 'Yesterday',
      blockPrefix: 'Block',
      weekPrefix: 'This week',
      anchorPrefix: 'Coming up',
    },
    // TODO: replace with voice-bible-approved copy before launch.
    fallbacks: {
      opener: 'Good to see you back.',
      rideDescriptor: 'honest effort',
      intensityModifier: 'steady',
      blockInterpretation: 'the block is building quiet strength',
      coldStart: 'Pick any plan and start showing up.',
    },
  },

  pragmatist: {
    tonePalette: DEFAULT_TONE_PALETTE,
    fsThresholds: DEFAULT_FS_THRESHOLDS,
    raceAnchorCutoff: DEFAULT_RACE_ANCHOR_CUTOFF_DAYS,
    slotTemplates: {
      ridePrefix: 'Yesterday',
      blockPrefix: 'Block',
      weekPrefix: 'This week',
      anchorPrefix: 'Next',
    },
    // TODO: replace with voice-bible-approved copy before launch.
    fallbacks: {
      opener: 'Here is where things sit.',
      rideDescriptor: 'useful ride',
      intensityModifier: 'practical',
      blockInterpretation: 'the block is working within the hours you have',
      coldStart: 'Pick a plan you can actually follow and start.',
    },
  },

  competitor: {
    tonePalette: DEFAULT_TONE_PALETTE,
    fsThresholds: DEFAULT_FS_THRESHOLDS,
    raceAnchorCutoff: DEFAULT_RACE_ANCHOR_CUTOFF_DAYS,
    slotTemplates: {
      ridePrefix: 'Yesterday',
      blockPrefix: 'Block',
      weekPrefix: 'This week',
      anchorPrefix: 'Next anchor',
    },
    // TODO: replace with voice-bible-approved copy before launch.
    fallbacks: {
      opener: 'Stay on the race trajectory.',
      rideDescriptor: 'race-useful ride',
      intensityModifier: 'race-specific',
      blockInterpretation: 'the block is shaping race-day fitness',
      coldStart: 'Set a goal event and start the plan.',
    },
  },
};

export const DEFAULT_ARCHETYPE = 'pragmatist';

/**
 * Look up overrides for an archetype id. Unknown ids fall back to the default.
 */
export function getArchetypeOverrides(archetypeId) {
  return ARCHETYPE_OVERRIDES[archetypeId] || ARCHETYPE_OVERRIDES[DEFAULT_ARCHETYPE];
}

export { ARCHETYPE_OVERRIDES, DEFAULT_FS_THRESHOLDS, DEFAULT_RACE_ANCHOR_CUTOFF_DAYS };
