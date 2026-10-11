/**
 * Feature flag utilities.
 *
 * Reads flags from user_profiles.feature_flags (JSONB):
 *   - season_planner: gates the Season tab on /train
 *
 * Falls back to false when flags are missing or malformed. Always safe to call.
 */

export type FeatureFlagName = 'season_planner';

interface ProfileLike {
  feature_flags?: Record<string, unknown> | null;
}

// Per-flag defaults applied when the JSONB key is absent on the profile.
// An explicit value in user_profiles.feature_flags still wins (kill switch / opt-in).
//
// season_planner gates the Season tab on /train (docs/season-planner-build-plan.md).
// Off by default; opt in with feature_flags.season_planner = true.
const FLAG_DEFAULTS: Record<FeatureFlagName, boolean> = {
  season_planner: false,
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
