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

import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Skeleton, Stack, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import AppShell from '../../components/AppShell.jsx';
import GetStartedGuide from '../../components/activation/GetStartedGuide.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useUserPreferences } from '../../contexts/UserPreferencesContext.jsx';
import { useTodaySpine } from './useTodaySpine';
import { SpinePanel } from './SpinePanel';
import { FitnessNode } from './FitnessNode';
import { CoachPanel } from './CoachPanel';
import { SpineEmptyState } from './SpineEmptyState';
import { ReadinessCall, useReadiness } from './ReadinessCall';
import { TodayCheckIn } from './TodayCheckIn';
import { BeatsColumn } from './beats/BeatsColumn';
import { buildNodeVM } from './nodeView';
import { C, FONT } from './tokens';
import type { UnitsPreference } from './units';
import type { SpineData } from './types';

/**
 * The map is the only thing on this page that pulls mapbox-gl (the `vendor-map`
 * chunk). Lazy so it is fetched when it is actually rendered — on mobile that
 * is only once the rider opens the numbers door, which keeps the chunk off the
 * phone's initial load entirely.
 */
const RidesMap = lazy(() => import('./RidesMap').then((m) => ({ default: m.RidesMap })));

/**
 * `compact` drops the summary sentence: on the beats page Beat 1 and Beat 3
 * already carry the page's prose, and a third standing sentence above them
 * would be the information overload the redesign exists to remove.
 */
function PageHeader({ data, compact = false }: { data: SpineData; compact?: boolean }) {
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
      {!compact && data.summaryLine && (
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
  // "Am I cleared today?" — answered by a readiness rule when one fires, and
  // by nothing at all when none does. The same request says whether the
  // athlete has checked in yet, which is what decides whether to ask.
  // Independent of the spine fetch so a slow verdict never delays the page.
  const readiness = useReadiness();

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
        <Suspense fallback={<Skeleton height={260} radius={0} />}>
          <RidesMap rides={data.recentRides} weekRollup={data.weekRollup} units={units} />
        </Suspense>
        {/* A successful coach schedule adjustment refetches the spine so the
            projected bars reflect the new calendar without a reload. */}
        <CoachPanel data={data} onScheduleChanged={retry} />
      </Box>
    );

    const nodeCard = <FitnessNode vm={vm} flipped={false} compact onSnapToday={snapToday} />;

    if (isMobile) {
      // The four-beat page (docs/today-mobile-beats-spec.md). The instrument
      // view — node, spine, map — moves behind the numbers door; the coach
      // stays in the open, because burying a working chat behind a link
      // labelled "see the numbers" would lose it.
      return (
        <Stack gap={16}>
          <PageHeader data={data} compact />
          <GetStartedGuide />
          <ReadinessCall verdict={readiness.verdict} />
          <TodayCheckIn
            checkin={readiness.checkin}
            loading={readiness.loading}
            onComplete={readiness.refresh}
          />
          <BeatsColumn
            data={data}
            units={units}
            numbers={
              <>
                {nodeCard}
                <SpinePanel
                  data={data}
                  selectedIndex={Math.min(selected, data.days.length - 1)}
                  onSelect={handleSelect}
                  vm={vm}
                  showNode={false}
                  flipped={false}
                  onToggleFlip={() => {}}
                  onSnapToday={snapToday}
                />
                <RidesMap rides={data.recentRides} weekRollup={data.weekRollup} units={units} />
              </>
            }
          />
          <CoachPanel data={data} onScheduleChanged={retry} />
        </Stack>
      );
    }

    return (
      <Stack gap={20}>
        <PageHeader data={data} />
        <GetStartedGuide />
        <ReadinessCall verdict={readiness.verdict} />
        <TodayCheckIn
          checkin={readiness.checkin}
          loading={readiness.loading}
          onComplete={readiness.refresh}
        />
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
