/**
 * Reads the user's selected coaching persona from `user_coach_settings`.
 * Falls back to `'pragmatist'` when the row is missing or still set to
 * `'pending'` (the default from migration 051 before the user picks).
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export type PersonaId =
  | 'hammer'
  | 'scientist'
  | 'encourager'
  | 'pragmatist'
  | 'competitor';

const PERSONA_LABELS: Record<PersonaId, string> = {
  hammer: 'The Hammer',
  scientist: 'The Scientist',
  encourager: 'The Encourager',
  pragmatist: 'The Pragmatist',
  competitor: 'The Competitor',
};

export interface CoachPersona {
  id: PersonaId;
  name: string;
}

const DEFAULT_PERSONA: CoachPersona = {
  id: 'pragmatist',
  name: PERSONA_LABELS.pragmatist,
};

const VALID_IDS = new Set<PersonaId>([
  'hammer',
  'scientist',
  'encourager',
  'pragmatist',
  'competitor',
]);

export function useCoachPersona(userId: string | null | undefined): {
  persona: CoachPersona;
  loading: boolean;
} {
  const [persona, setPersona] = useState<CoachPersona>(DEFAULT_PERSONA);
  const [loading, setLoading] = useState<boolean>(Boolean(userId));

  useEffect(() => {
    if (!userId) {
      setPersona(DEFAULT_PERSONA);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data } = await supabase
        .from('user_coach_settings')
        .select('coaching_persona')
        .eq('user_id', userId)
        .maybeSingle();

      if (cancelled) return;
      const raw = (data as { coaching_persona: string | null } | null)
        ?.coaching_persona;
      if (raw && raw !== 'pending' && VALID_IDS.has(raw as PersonaId)) {
        const id = raw as PersonaId;
        setPersona({ id, name: PERSONA_LABELS[id] });
      } else {
        setPersona(DEFAULT_PERSONA);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { persona, loading };
}
