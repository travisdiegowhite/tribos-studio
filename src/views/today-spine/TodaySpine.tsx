/**
 * TodaySpine — the Training-Arc Today (docs/today-view). Built alongside the
 * canonical routing-first glance (src/views/today-glance) and mounted at
 * /today/spine; the live /today is untouched until we choose to flip it.
 *
 * Owns the interaction state (scrub selection, node flip, readiness popover, the
 * TSB/readiness count-up) and the responsive layout. All truth comes from one
 * SpineData via useTodaySpine(); zones are pure renderers.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Skeleton, Stack, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import AppShell from '../../components/AppShell.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useUserPreferences } from '../../contexts/UserPreferencesContext.jsx';
import { useTodaySpine } from './useTodaySpine';
import { SpinePanel } from './SpinePanel';
import { FitnessNode } from './FitnessNode';
import { RidesMap } from './RidesMap';
import { CoachPanel } from './CoachPanel';
import { buildNodeVM } from './nodeView';
import { C, FONT } from './tokens';
import type { UnitsPreference } from './units';
import type { SpineData } from './types';

const COUNT_UP_MS = 750;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function PageHeader({ data }: { data: SpineData }) {
  const today = data.days[data.todayIndex];
  const [weekday, ...rest] = today.dateLabel.split(' ');
  const datePortion = `${weekday} ${rest.join(' ')}`;
  return (
    <Box
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
        marginBottom: 4,
      }}
    >
      <Box>
        <Text style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 500, letterSpacing: '3px', color: C.teal, marginBottom: 5 }}>
          DEPARTMENT OF CYCLING INTELLIGENCE
        </Text>
        <Text
          component="h1"
          style={{ margin: 0, fontFamily: FONT.heading, fontWeight: 700, fontSize: 34, letterSpacing: '.04em', textTransform: 'uppercase', color: C.text }}
        >
          TODAY <span style={{ color: C.text3, fontWeight: 600 }}>— {datePortion}</span>
        </Text>
      </Box>
      {data.summaryLine && (
        <Text style={{ fontFamily: FONT.body, fontSize: 13, lineHeight: 1.5, color: C.text2, maxWidth: 300, textAlign: 'right' }}>
          {data.summaryLine}
        </Text>
      )}
    </Box>
  );
}

export default function TodaySpine() {
  const { user } = useAuth() as { user: { id: string } | null };
  const { unitsPreference } = useUserPreferences() as { unitsPreference: UnitsPreference };
  const isMobile = useMediaQuery('(max-width: 768px)');
  const units: UnitsPreference = unitsPreference === 'metric' ? 'metric' : 'imperial';

  const { loading, data, error } = useTodaySpine(user?.id ?? null);

  const [selected, setSelected] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [ringHover, setRingHover] = useState(false);
  const [dispTSB, setDispTSB] = useState(0);
  const [dispReady, setDispReady] = useState(0);
  const rafRef = useRef<number | null>(null);

  const stopAnim = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const animate = useCallback(
    (tsb: number, ready: number) => {
      stopAnim();
      if (prefersReducedMotion()) {
        setDispTSB(tsb);
        setDispReady(ready);
        return;
      }
      const t0 = performance.now();
      const ease = (x: number) => 1 - Math.pow(1 - x, 3);
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / COUNT_UP_MS);
        setDispTSB(tsb * ease(p));
        setDispReady(ready * ease(p));
        if (p < 1) rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
    },
    [stopAnim],
  );

  // Initialize selection + count-up once data lands.
  useEffect(() => {
    if (!data) return;
    setSelected(data.todayIndex);
    const t = data.days[data.todayIndex];
    setDispTSB(0);
    setDispReady(0);
    animate(t.fs, t.readiness);
    return stopAnim;
  }, [data, animate, stopAnim]);

  const handleSelect = useCallback(
    (i: number) => {
      if (!data) return;
      stopAnim();
      setSelected(i);
      setFlipped(false);
      setRingHover(false);
      const d = data.days[i];
      setDispTSB(d.fs); // scrubbing shows values immediately, no count-up
      setDispReady(d.readiness);
    },
    [data, stopAnim],
  );

  const snapToday = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!data) return;
      setSelected(data.todayIndex);
      setFlipped(false);
      setRingHover(false);
      setDispTSB(0);
      setDispReady(0);
      const t = data.days[data.todayIndex];
      animate(t.fs, t.readiness);
    },
    [data, animate],
  );

  const vm = useMemo(
    () => (data ? buildNodeVM(data.days, Math.min(selected, data.todayIndex), data.todayIndex) : null),
    [data, selected],
  );

  const content = () => {
    if (loading || !data || !vm) {
      return (
        <Stack gap={16}>
          <Skeleton height={24} width="45%" radius={0} />
          <Skeleton height={240} radius={0} />
          <Box style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.32fr 1fr', gap: 20 }}>
            <Skeleton height={260} radius={0} />
            <Skeleton height={260} radius={0} />
          </Box>
        </Stack>
      );
    }

    if (error) {
      return (
        <Box style={{ border: `1px solid ${C.border}`, background: C.card, padding: 24 }}>
          <Text style={{ fontFamily: FONT.mono, fontSize: 12, letterSpacing: '1px', color: C.coral }}>
            COULDN’T LOAD YOUR TRAINING ARC. {error.toUpperCase()}
          </Text>
        </Box>
      );
    }

    const spine = (
      <SpinePanel
        data={data}
        selectedIndex={Math.min(selected, data.todayIndex)}
        onSelect={handleSelect}
        vm={vm}
        showNode={!isMobile}
        dispTSB={dispTSB}
        dispReady={dispReady}
        flipped={flipped}
        ringHover={ringHover}
        onToggleFlip={() => {
          setFlipped((f) => !f);
          setRingHover(false);
        }}
        onSnapToday={snapToday}
        onRingEnter={() => setRingHover(true)}
        onRingLeave={() => setRingHover(false)}
      />
    );

    const bottomRow = (
      <Box style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.32fr 1fr', gap: 20, alignItems: 'stretch' }}>
        <RidesMap rides={data.recentRides} weekRollup={data.weekRollup} units={units} />
        <CoachPanel data={data} />
      </Box>
    );

    if (isMobile) {
      // 01 → 02 → 03 → 04: node as a normal top card, spine read-only below it.
      return (
        <Stack gap={16}>
          <PageHeader data={data} />
          <FitnessNode vm={vm} dispTSB={dispTSB} dispReady={dispReady} flipped={false} ringHover={false} compact />
          {spine}
          {bottomRow}
        </Stack>
      );
    }

    return (
      <Stack gap={20}>
        <PageHeader data={data} />
        {spine}
        {bottomRow}
      </Stack>
    );
  };

  return (
    <AppShell>
      <Box style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? '16px' : '24px 30px 32px' }}>{content()}</Box>
    </AppShell>
  );
}
