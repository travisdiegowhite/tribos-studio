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
// An explicit `false` in user_profiles.feature_flags still wins (kill switch).
const FLAG_DEFAULTS: Record<FeatureFlagName, boolean> = {
  event_anchored_planner: true,
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
