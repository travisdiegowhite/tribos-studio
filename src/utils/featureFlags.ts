/**
 * Feature flag utilities.
 *
 * Reads flags from user_profiles.feature_flags (JSONB). Phase 1 ships one flag:
 *   - event_anchored_planner: gates the new block-based planner UI
 *
 * Falls back to false when flags are missing or malformed. Always safe to call.
 */

export type FeatureFlagName = 'event_anchored_planner';

interface ProfileLike {
  feature_flags?: Record<string, unknown> | null;
}

// Per-flag defaults applied when the JSONB key is absent on the profile.
// An explicit value in user_profiles.feature_flags still wins (kill switch / opt-in).
//
// event_anchored_planner defaults to FALSE as of the calendar redesign (Phase 0): the
// event-anchored sequencer projected onto a phantom plan the (now single-plan) calendar
// could never display, so plans built there were invisible. With the flag off, the coach
// uses the static generator (the visible path) and the sequencer UI/cron stay dormant.
// A user who has explicitly opted in (feature_flags.event_anchored_planner === true) still
// gets it.
const FLAG_DEFAULTS: Record<FeatureFlagName, boolean> = {
  event_anchored_planner: false,
};

/**
 * Returns true if the named flag is set truthy on the profile.
 * Accepts either a boolean true or the string "true" for compatibility with
 * Postgres JSONB string values (e.g. when toggled via SQL).
 *
 * If the flag is missing entirely, falls back to FLAG_DEFAULTS.
 */
export function hasFlag(
  profile: ProfileLike | null | undefined,
  flag: FeatureFlagName
): boolean {
  const flags = profile?.feature_flags;
  if (flags && flag in flags) {
    const value = flags[flag];
    return value === true || value === 'true';
  }
  return FLAG_DEFAULTS[flag] ?? false;
}
