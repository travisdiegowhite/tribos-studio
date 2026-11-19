/**
 * FTP, weight and units for the coach's charts. One profile read per user per
 * page load, shared by every visual in the conversation.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext.jsx';
import { useUserPreferences } from '../../../contexts/UserPreferencesContext.jsx';

export interface AthleteBasics {
  userId: string | null;
  ftp: number | null;
  weight_kg: number | null;
  isImperial: boolean;
}

const cache = new Map<string, Promise<{ ftp: number | null; weight_kg: number | null }>>();

function loadProfile(userId: string) {
  let pending = cache.get(userId);
  if (!pending) {
    pending = Promise.resolve(
      supabase.from('user_profiles').select('ftp, weight_kg').eq('id', userId).maybeSingle(),
    ).then(({ data }) => ({ ftp: data?.ftp ?? null, weight_kg: data?.weight_kg ?? null }));
    pending.catch(() => cache.delete(userId));
    cache.set(userId, pending);
  }
  return pending;
}

export function useAthleteBasics(): AthleteBasics {
  const { user } = useAuth() as { user: { id: string } | null };
  const { unitsPreference } = useUserPreferences() as { unitsPreference: string };
  const [profile, setProfile] = useState<{ ftp: number | null; weight_kg: number | null }>({
    ftp: null,
    weight_kg: null,
  });

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    loadProfile(user.id)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return { userId: user?.id ?? null, ...profile, isImperial: unitsPreference === 'imperial' };
}
