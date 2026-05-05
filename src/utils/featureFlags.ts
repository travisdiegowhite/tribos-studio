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

/**
 * Returns true if the named flag is set truthy on the profile.
 * Accepts either a boolean true or the string "true" for compatibility with
 * Postgres JSONB string values (e.g. when toggled via SQL).
 */
export function hasFlag(
  profile: ProfileLike | null | undefined,
  flag: FeatureFlagName
): boolean {
  if (!profile?.feature_flags) return false;
  const value = profile.feature_flags[flag];
  return value === true || value === 'true';
}
