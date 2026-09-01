/**
 * ReadinessCall — the answer to "am I cleared today?".
 *
 * Renders at the top of Today whenever the coaching rules engine fires a
 * readiness rule (Phase 3 of docs/coaching-bible/). Position is the point: a
 * readiness call outranks every prescription, so an athlete told to rest must
 * not have to scroll past today's planned intervals to find that out.
 *
 * The verdict comes from the server (GET /api/fatigue-checkin), computed by
 * the same pure engine that feeds the coach's prompt. Nothing is decided here
 * — this component renders a line the engine already wrote, in the athlete's
 * persona voice, and shows nothing at all when no rule fires.
 *
 * The same request answers "has this athlete checked in yet today?", which is
 * what decides whether Today prompts for one — so both come from one call.
 */

import { useCallback, useEffect, useState } from 'react';
import { Box, Text } from '@mantine/core';
import { supabase } from '../../lib/supabase';
import { C, FONT } from './tokens';

export interface ReadinessVerdict {
  id: string;
  claim: string;
  confidence: 'settled' | 'leaning' | 'contested';
  personaLine: string;
}

/** Rule id → the word on the card. The engine decides; this only labels. */
const HEADINGS: Record<string, string> = {
  'RDY-3-skip': "TODAY'S CALL — REST",
  'RDY-3-modify': "TODAY'S CALL — GO SHORTER",
  'RDY-3-cut': "TODAY'S CALL — START AND SEE",
  'RDY-4-trust-rider': "TODAY'S CALL — EASY",
  'RDY-2-hrv-band': "TODAY'S CALL — EASY",
};

/**
 * Honest about confidence, per behaviour-floor rule 8. A settled rule says
 * nothing extra; a leaning or contested one says so in plain words rather
 * than asserting certainty the research does not have.
 */
const CONFIDENCE_NOTE: Record<string, string> = {
  leaning: 'The research leans this way rather than settling it.',
  contested: 'The research is split on this one.',
};

export interface TodayCheckIn {
  date: string;
  sleep: number | null;
  leg_feel: number | null;
  motivation: number | null;
  illness: boolean | null;
}

export interface ReadinessState {
  verdict: ReadinessVerdict | null;
  /** Today's check-in row, or null when the athlete has not filled one in. */
  checkin: TodayCheckIn | null;
  /** True until the first response lands — callers render nothing meanwhile. */
  loading: boolean;
  /** Re-fetch, e.g. after the athlete submits a check-in. */
  refresh: () => void;
}

/**
 * One request behind both the readiness call and the check-in prompt.
 *
 * Deliberately independent of the spine fetch: a slow or failed verdict must
 * never delay the page, and Today rendered fine before either existed.
 */
export function useReadiness(): ReadinessState {
  const [verdict, setVerdict] = useState<ReadinessVerdict | null>(null);
  const [checkin, setCheckin] = useState<TodayCheckIn | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch('/api/fatigue-checkin', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const body = await res.json();
        if (cancelled) return;
        setVerdict(body?.readiness ?? null);
        setCheckin(body?.checkin ?? null);
      } catch {
        // Most days no rule fires and this is the normal, quiet path. Failing
        // silently renders the page exactly as it did before.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [nonce]);

  return { verdict, checkin, loading, refresh };
}

export function ReadinessCall({ verdict }: { verdict: ReadinessVerdict | null }) {
  if (!verdict) return null;

  const heading = HEADINGS[verdict.id] || "TODAY'S CALL";
  const note = CONFIDENCE_NOTE[verdict.confidence];

  return (
    <Box
      style={{
        border: `1px solid ${C.orange}`,
        borderLeftWidth: 3,
        background: C.card,
        padding: '14px 16px',
      }}
    >
      <Text
        style={{
          fontFamily: FONT.mono,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '2px',
          color: C.orange,
          marginBottom: 6,
        }}
      >
        {heading}
      </Text>
      <Text style={{ fontSize: 15, lineHeight: 1.5, color: C.text }}>{verdict.personaLine}</Text>
      {note && (
        <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.text3, marginTop: 8 }}>
          {note}
        </Text>
      )}
    </Box>
  );
}
