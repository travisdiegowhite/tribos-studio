/**
 * CoachPanel — Zone 04. Today's recommendation ("today's call") plus an
 * interactive chat. The conversation plumbing — POST /api/coach with a canonical
 * metric snapshot as trainingContext, persistence to coach_conversations, the
 * AI-consent gate — mirrors src/views/today-glance/GlanceCoach.tsx and the
 * command bar so the coach surfaces can't diverge. The bubble styling +
 * typing-indicator follow the spine prototype (docs/today-view).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Anchor, Box, Group, Text, TextInput } from '@mantine/core';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { supabase } from '../../lib/supabase';
import { getTodayCoach } from '../today-glance/getToday';
import { EMPTY_ATHLETE_STATE } from '../today-glance/athleteState';
import { ctlDeltaPctFromDays } from './nodeView';
import { C, FONT } from './tokens';
import type { SpineData } from './types';

interface ChatMessage {
  id: string;
  role: 'user' | 'coach';
  content: string;
}

interface CoachPanelProps {
  data: SpineData;
}

const QUICK_CHIPS: Array<{ label: string; query: string }> = [
  { label: '60 min today?', query: 'I only have 60 min today. What should I ride?' },
  { label: 'Push harder?', query: 'Should I push harder this week?' },
];

function buildContext(data: SpineData): string {
  const t = data.days[data.todayIndex];
  const parts = [
    `Canonical metrics on screen — Form Score (TSB): ${t.fs}, TFI (CTL): ${t.tfi}, AFI (ATL): ${t.afi}, readiness ${t.readiness}.`,
    `Today: ${t.activity.tag} · ${t.activity.name} · ${t.activity.meta}.`,
  ];
  if (data.event) parts.push(`Goal: ${data.event.name} in ${data.event.daysToRace} days.`);
  return parts.join(' ');
}

export function CoachPanel({ data }: CoachPanelProps) {
  const { user } = useAuth() as { user: { id: string } | null };
  const { coach } = data;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState<boolean | null>(null);
  const [consentGranting, setConsentGranting] = useState(false);
  const [take, setTake] = useState<string | null>(null);

  // Deferred persona-voiced TODAY'S CALL — the same /api/fitness-summary line
  // the glance shows. Non-blocking: the deterministic recBody renders first
  // and upgrades in place when (if) the AI line arrives.
  useEffect(() => {
    if (!data.hasHistory) return;
    let cancelled = false;
    const today = data.days[data.todayIndex];
    getTodayCoach({
      ...EMPTY_ATHLETE_STATE,
      tfi: today.tfi,
      afi: today.afi,
      fs: today.fs,
      ctlDeltaPct: ctlDeltaPctFromDays(data.days, data.todayIndex),
    }).then((line) => {
      if (!cancelled && line) setTake(line);
    });
    return () => {
      cancelled = true;
    };
  }, [data]);

  const threadRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const nextId = () => `m${(idRef.current += 1)}`;

  // Load consent + recent history.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const uid = user.id;
    (async () => {
      try {
        const { data: prof } = await supabase
          .from('user_profiles')
          .select('ai_consent_granted_at, ai_consent_withdrawn_at')
          .eq('id', uid)
          .single();
        if (!cancelled) setConsent(!!prof?.ai_consent_granted_at && !prof?.ai_consent_withdrawn_at);
      } catch {
        if (!cancelled) setConsent(false);
      }
      try {
        const { data: rows } = await supabase
          .from('coach_conversations')
          .select('id, role, message, timestamp')
          .eq('user_id', uid)
          .in('role', ['user', 'coach'])
          .order('timestamp', { ascending: false })
          .limit(10);
        if (!cancelled && rows) {
          setMessages(
            rows
              .slice()
              .reverse()
              .map((m: { id?: string; role: string; message: string }) => ({
                id: m.id || nextId(),
                role: m.role === 'coach' ? 'coach' : 'user',
                content: m.message,
              })),
          );
        }
      } catch (err) {
        console.error('spine coach history load failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages, typing]);

  const grantConsent = useCallback(async () => {
    if (!user?.id) return;
    setConsentGranting(true);
    try {
      await supabase
        .from('user_profiles')
        .update({ ai_consent_granted_at: new Date().toISOString(), ai_consent_withdrawn_at: null })
        .eq('id', user.id);
      setConsent(true);
    } catch (err) {
      console.error('grant AI consent failed', err);
    } finally {
      setConsentGranting(false);
    }
  }, [user?.id]);

  const saveTurn = useCallback(
    async (role: 'user' | 'coach', content: string) => {
      if (!user?.id) return;
      try {
        await supabase.from('coach_conversations').insert({
          user_id: user.id,
          role,
          message: content,
          message_type: 'chat',
          context_snapshot: { coach_type: 'training', surface: 'today_spine' },
          coach_type: 'strategist',
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.error('spine coach persist failed', err);
      }
    },
    [user?.id],
  );

  const send = useCallback(
    async (raw: string) => {
      const message = raw.trim();
      if (!message || typing || !user?.id || consent === false) return;
      setError(null);
      setDraft('');
      setTyping(true);

      const userMsg: ChatMessage = { id: nextId(), role: 'user', content: message };
      const conversationHistory = messages.map((m) => ({
        role: m.role === 'coach' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      }));
      setMessages((prev) => [...prev, userMsg]);

      try {
        const now = new Date();
        const userLocalDate = {
          dayOfWeek: now.getDay(),
          date: now.getDate(),
          month: now.getMonth(),
          year: now.getFullYear(),
          dateString: now.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const res = await fetch('/api/coach', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({
            message,
            conversationHistory,
            trainingContext: buildContext(data),
            userLocalDate,
            userId: user.id,
            maxTokens: 1024,
            quickMode: true,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const json = await res.json();
        setMessages((prev) => [...prev, { id: nextId(), role: 'coach', content: json.message }]);
        await saveTurn('user', message);
        await saveTurn('coach', json.message);
      } catch (err) {
        console.error('spine coach send failed', err);
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        setError(err instanceof Error ? err.message : 'Failed to reach your coach. Try again.');
      } finally {
        setTyping(false);
      }
    },
    [typing, user?.id, consent, messages, data, saveTurn],
  );

  return (
    <Box
      style={{
        background: C.card,
        border: `1.5px solid ${C.teal}`,
        boxShadow: '0 1px 3px rgba(20,16,8,.07),0 4px 12px rgba(20,16,8,.05)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style>{`@keyframes spine-tbob{0%,80%,100%{transform:translateY(0);opacity:.35}40%{transform:translateY(-4px);opacity:1}}`}</style>

      <Group justify="space-between" align="center" style={{ padding: '13px 16px 11px', borderBottom: `1px solid ${C.border}` }}>
        <Group gap={9} align="center">
          <Text style={{ fontFamily: FONT.mono, fontSize: 10, fontWeight: 500, letterSpacing: '2px', color: C.text3 }}>04</Text>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.gold, display: 'inline-block' }} />
          <Text style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 500, letterSpacing: '2px', color: C.text }}>
            COACH
          </Text>
        </Group>
        <Text style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: '1px', color: C.text3 }}>AI · LIVE</Text>
      </Group>

      {/* Recommendation */}
      <Box style={{ padding: '13px 16px 0' }}>
        <Box style={{ borderLeft: `3px solid ${C.teal}`, background: 'rgba(42,140,130,.10)', padding: '11px 13px' }}>
          <Text style={{ fontFamily: FONT.mono, fontSize: 9, fontWeight: 500, letterSpacing: '2px', color: C.teal, marginBottom: 5 }}>
            TODAY’S CALL
          </Text>
          <Text style={{ fontFamily: FONT.heading, fontWeight: 700, fontSize: 18, letterSpacing: '.03em', textTransform: 'uppercase', color: C.text }}>
            {coach.recTitle}
          </Text>
          <Text style={{ fontFamily: FONT.body, fontSize: 13, lineHeight: 1.5, color: C.text2, marginTop: 3 }}>
            {take ?? coach.oneLineTake ?? coach.recBody}
          </Text>
        </Box>
      </Box>

      {/* Thread */}
      <Box
        ref={threadRef}
        style={{ flex: 1, minHeight: 120, maxHeight: 200, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        {messages.slice(-6).map((m) => {
          const mine = m.role === 'user';
          return (
            <Box
              key={m.id}
              style={{
                alignSelf: mine ? 'flex-end' : 'flex-start',
                maxWidth: '82%',
                background: mine ? C.base : 'rgba(42,140,130,.10)',
                border: `1px solid ${mine ? C.border : 'rgba(42,140,130,.22)'}`,
                padding: '8px 11px',
              }}
            >
              <Text style={{ fontFamily: FONT.body, fontSize: 13, lineHeight: 1.45, color: C.text, whiteSpace: 'pre-wrap' }}>
                {m.content}
              </Text>
            </Box>
          );
        })}
        {typing && (
          <Box style={{ alignSelf: 'flex-start', background: 'rgba(42,140,130,.10)', border: '1px solid rgba(42,140,130,.22)', padding: '9px 12px', display: 'flex', gap: 4, alignItems: 'center' }}>
            {[0, 0.2, 0.4].map((d) => (
              <span
                key={d}
                style={{ width: 6, height: 6, borderRadius: '50%', background: C.teal, animation: `spine-tbob 1.4s ease-in-out ${d}s infinite` }}
              />
            ))}
          </Box>
        )}
      </Box>

      {error && (
        <Text style={{ fontFamily: FONT.body, fontSize: 13, color: C.coral, padding: '0 16px 8px' }}>{error}</Text>
      )}

      {/* Input / consent gate */}
      <Box style={{ padding: '10px 16px 14px', borderTop: `1px solid ${C.border}` }}>
        {consent === false ? (
          <Box style={{ borderLeft: `3px solid ${C.teal}`, background: 'rgba(42,140,130,.10)', padding: '10px 12px' }}>
            <Text style={{ fontFamily: FONT.body, fontSize: 13, color: C.text2, marginBottom: 6 }}>
              Coach reviews your training data to explain your progress.{' '}
              <Anchor component={Link} to="/privacy#ai" style={{ color: C.teal, fontSize: 13 }}>
                Privacy
              </Anchor>
              .
            </Text>
            <Box
              component="button"
              onClick={grantConsent}
              disabled={consentGranting}
              style={{ border: 'none', background: C.navy, color: '#fff', fontFamily: FONT.mono, fontSize: 10, letterSpacing: '2px', padding: '8px 14px', cursor: 'pointer' }}
            >
              {consentGranting ? 'ENABLING…' : 'ENABLE COACH'}
            </Box>
          </Box>
        ) : (
          <>
            <Group gap={7} mb={9} style={{ flexWrap: 'wrap' }}>
              {QUICK_CHIPS.map((chip) => (
                <Box
                  key={chip.label}
                  component="button"
                  onClick={() => send(chip.query)}
                  disabled={typing}
                  style={{ border: `1px solid ${C.border}`, background: C.base, padding: '5px 9px', fontFamily: FONT.body, fontSize: 11, color: C.text2, cursor: typing ? 'default' : 'pointer' }}
                >
                  {chip.label}
                </Box>
              ))}
            </Group>
            <Group gap={8} wrap="nowrap">
              <TextInput
                placeholder="Ask your coach…"
                value={draft}
                onChange={(e) => setDraft(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(draft);
                  }
                }}
                disabled={typing}
                style={{ flex: 1 }}
                styles={{ input: { borderRadius: 0, border: `1.5px solid ${C.border}`, fontFamily: FONT.body, fontSize: 13 } }}
              />
              <Box
                component="button"
                onClick={() => send(draft)}
                disabled={!draft.trim() || typing}
                style={{ border: `1.5px solid ${C.navy}`, background: C.navy, color: '#fff', padding: '0 16px', fontFamily: FONT.mono, fontSize: 10, letterSpacing: '2px', cursor: !draft.trim() || typing ? 'default' : 'pointer', minHeight: 36 }}
              >
                ASK
              </Box>
            </Group>
          </>
        )}
      </Box>
    </Box>
  );
}
