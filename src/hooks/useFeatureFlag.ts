/**
 * useFeatureFlag — read a single feature flag from user_profiles.feature_flags.
 *
 * Lazily loads the user's profile once on mount. Returns false until the
 * lookup resolves so gated UI never flashes for unflagged users.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { hasFlag, type FeatureFlagName } from '../utils/featureFlags';

export function useFeatureFlag(flag: FeatureFlagName): boolean {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user?.id) {
      setEnabled(false);
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('feature_flags')
        .eq('id', user.id)
        .maybeSingle();

      if (!active) return;
      if (error) {
        setEnabled(false);
        return;
      }
      setEnabled(hasFlag(data, flag));
    })();

    return () => {
      active = false;
    };
  }, [user?.id, flag]);

  return enabled;
}
