/**
 * TodaySpine — the Training-Arc Today (docs/today-view). Built alongside the
 * canonical routing-first glance (src/views/today-glance) and mounted at
 * /today/spine; the live /today is untouched until we choose to flip it.
 *
 * Owns the interaction state (scrub selection, node flip) and the responsive
 * layout. All truth comes from one SpineData via useTodaySpine(); zones are
 * pure renderers. The page hero is the plain-language summaryLine — the chart
 * and the node's FS chip are its citations (thesis P4).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Skeleton, Stack, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import AppShell from '../../components/AppShell.jsx';
import GetStartedGuide from '../../components/activation/GetStartedGuide.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useUserPreferences } from '../../contexts/UserPreferencesContext.jsx';
import { useTodaySpine } from './useTodaySpine';
import { SpinePanel } from './SpinePanel';
import { FitnessNode } from './FitnessNode';
import { RidesMap } from './RidesMap';
import { CoachPanel } from './CoachPanel';
import { SpineEmptyState } from './SpineEmptyState';
import { buildNodeVM } from './nodeView';
import { C, FONT } from './tokens';
import type { UnitsPreference } from './units';
import type { SpineData } from './types';

function PageHeader({ data }: { data: SpineData }) {
  const today = data.days[data.todayIndex];
  const [weekday, ...rest] = today.dateLabel.split(' ');
  const datePortion = `${weekday} ${rest.join(' ')}`;
  return (
    <Box style={{ marginBottom: 4 }}>
      <Text style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 500, letterSpacing: '3px', color: C.teal, marginBottom: 5 }}>
        DEPARTMENT OF CYCLING INTELLIGENCE
      </Text>
      <Text
        component="h1"
        style={{ margin: 0, fontFamily: FONT.heading, fontWeight: 700, fontSize: 24, letterSpacing: '.04em', textTransform: 'uppercase', color: C.text3 }}
      >
        TODAY <span style={{ fontWeight: 600 }}>— {datePortion}</span>
      </Text>
      {/* The page hero: the sentence, full-width. The chart below is its citation. */}
      {data.summaryLine && (
        <Text
          style={{
            fontFamily: FONT.body,
            fontSize: 20,
            fontWeight: 600,
            lineHeight: 1.35,
            color: C.text,
            marginTop: 6,
            maxWidth: 760,
          }}
        >
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

  const { loading, data, error, retry } = useTodaySpine(user?.id ?? null);

  const [selected, setSelected] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // Initialize selection once data lands.
  useEffect(() => {
    if (!data) return;
    setSelected(data.todayIndex);
  }, [data]);

  const handleSelect = useCallback(
    (i: number) => {
      if (!data) return;
      setSelected(i);
      setFlipped(false);
    },
    [data],
  );

  const snapToday = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!data) return;
      setSelected(data.todayIndex);
      setFlipped(false);
    },
    [data],
  );

  const vm = useMemo(
    () =>
      data
        ? buildNodeVM(data.days, Math.min(selected, data.days.length - 1), data.todayIndex, data.recoveryWeek)
        : null,
    [data, selected],
  );

  const content = () => {
    // Error first: a failed load leaves `data` null, and the skeleton branch
    // would otherwise swallow it into an infinite shimmer.
    if (error) {
      return (
        <Box style={{ border: `1px solid ${C.border}`, background: C.card, padding: 24 }}>
          <Text style={{ fontFamily: FONT.mono, fontSize: 12, letterSpacing: '1px', color: C.coral }}>
            COULDN’T LOAD YOUR TRAINING ARC. {error.toUpperCase()}
          </Text>
          <Box
            component="button"
            onClick={retry}
            style={{
              marginTop: 14,
              border: `1.5px solid ${C.navy}`,
              background: C.navy,
              color: '#fff',
              fontFamily: FONT.mono,
              fontSize: 10,
              letterSpacing: '2px',
              padding: '8px 16px',
              cursor: 'pointer',
            }}
          >
            RETRY
          </Box>
        </Box>
      );
    }

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

    // First-run: no ride history yet → an honest empty state instead of a
    // plausible-looking dashboard of zeros. Coach still works without history.
    if (!data.hasHistory) {
      return (
        <Stack gap={20}>
          <PageHeader data={data} />
          <GetStartedGuide />
          <SpineEmptyState />
          <CoachPanel data={data} onScheduleChanged={retry} />
        </Stack>
      );
    }

    const spine = (
      <SpinePanel
        data={data}
        selectedIndex={Math.min(selected, data.days.length - 1)}
        onSelect={handleSelect}
        vm={vm}
        showNode={!isMobile}
        interactive
        flipped={flipped}
        onToggleFlip={() => setFlipped((f) => !f)}
        onSnapToday={snapToday}
      />
    );

    const bottomRow = (
      <Box style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.32fr 1fr', gap: 20, alignItems: 'stretch' }}>
        <RidesMap rides={data.recentRides} weekRollup={data.weekRollup} units={units} />
        {/* A successful coach schedule adjustment refetches the spine so the
            projected bars reflect the new calendar without a reload. */}
        <CoachPanel data={data} onScheduleChanged={retry} />
      </Box>
    );

    // Mobile: node as a normal top card; tap a day on the spine below to
    // select it (per the design handoff's mobile parity note).
    const nodeCard = <FitnessNode vm={vm} flipped={false} compact onSnapToday={snapToday} />;

    if (isMobile) {
      // 01 → 02 → 03 → 04 stacked single-column.
      return (
        <Stack gap={16}>
          <PageHeader data={data} />
          <GetStartedGuide />
          {nodeCard}
          {spine}
          {bottomRow}
        </Stack>
      );
    }

    return (
      <Stack gap={20}>
        <PageHeader data={data} />
        <GetStartedGuide />
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
