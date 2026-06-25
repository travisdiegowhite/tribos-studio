/**
 * TodayGlance — the routing-first Today. One no-scroll overview that answers
 * four questions and nothing else: what am I doing today / can I trust it / am
 * I cleared / go. The prescribed workout renders as a matched route on the map
 * (the route IS the workout).
 *
 * Built as a parallel view gated on the Route Builder 2.0 beta cohort (see
 * TodayEntry.tsx); the live Today (src/views/today) is untouched. Binds
 * entirely to one getToday() state via useToday(); the hero map streams in via
 * <Suspense> while the shell paints immediately.
 */

import { Suspense, useMemo } from 'react';
import { Box, Group, Skeleton, Stack, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useNavigate } from 'react-router-dom';
import AppShell from '../../components/AppShell.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useUserPreferences } from '../../contexts/UserPreferencesContext.jsx';
import { useToday } from './useToday';
import { HeroMap } from './HeroMap';
import { GlanceRail } from './GlanceRail';
import { SuggestedRail } from './SuggestedRail';
import { GlanceFooter } from './GlanceFooter';
import { GlanceCoach } from './GlanceCoach';
import { ConsistencyRibbon } from './ConsistencyRibbon';
import { ClearanceBand } from './ClearanceBand';
import { FitnessRow } from './FitnessRow';
import { C, FONT } from './tokens';
import type { UnitsPreference } from './units';
import type { Today, TodayRoute } from './types';
import type { RecentRide } from '../today/shared/recentRides';
import { fixtureRecentRides } from './fixtures/todayFixture';

const HERO_HEIGHT = 380;
const HERO_HEIGHT_MOBILE = 260;

interface TodayGlanceProps {
  /** Static-wiring / test override. When set, skips the live useToday() read. */
  fixture?: Today;
}

function HeroSkeleton({ height }: { height: number }) {
  return (
    <Box style={{ height, position: 'relative', border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      <Skeleton height={height} radius={0} />
      <Box
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.text3, letterSpacing: '1px' }}>
          SHAPING TODAY’S ROUTE…
        </Text>
      </Box>
    </Box>
  );
}

function ContextLine({ today }: { today: Today }) {
  const dateLabel = useMemo(() => {
    const d = new Date(`${today.date}T00:00:00`);
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }, [today.date]);

  return (
    <Group justify="space-between" align="center">
      <Text style={{ fontFamily: FONT.mono, fontSize: 12, letterSpacing: '1px', color: C.text3 }}>
        {dateLabel.toUpperCase()}
      </Text>
      {today.planContext.chipLabel && (
        <Box style={{ border: `1px solid ${C.border}`, padding: '3px 8px', backgroundColor: C.card }}>
          <Text style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, color: C.teal, letterSpacing: '0.5px' }}>
            {today.planContext.chipLabel}
          </Text>
        </Box>
      )}
    </Group>
  );
}

/** Thin forward-looking line ("where you're going") under the context chip. */
function OutlookLine({ today }: { today: Today }) {
  if (!today.outlook.line) return null;
  return (
    <Text
      style={{
        fontFamily: FONT.mono,
        fontSize: 12,
        letterSpacing: '0.5px',
        color: C.text2,
      }}
    >
      → {today.outlook.line}
    </Text>
  );
}

/** Rest day: no map. Clearance + coach line + a "log how you feel" nudge. */
function RestCard({ today, units }: { today: Today; units: UnitsPreference }) {
  const navigate = useNavigate();
  return (
    <Box style={{ border: `1px solid ${C.border}`, background: C.card, padding: 20 }}>
      <Text style={{ fontFamily: FONT.heading, fontSize: 28, fontWeight: 700, color: C.text }}>
        Rest day
      </Text>
      <Text style={{ fontFamily: FONT.body, fontSize: 14, color: C.text2, marginTop: 6, marginBottom: 16 }}>
        {today.coach.oneLineTake ?? 'Recovery is the session. Keep it easy and refuel.'}
      </Text>
      <ClearanceBand state={today.athleteState} />
      <Group mt={18}>
        <Box
          component="button"
          onClick={() => navigate('/train')}
          style={{
            fontFamily: FONT.mono,
            fontSize: 12,
            color: '#FFFFFF',
            backgroundColor: C.teal,
            border: 'none',
            padding: '8px 14px',
            cursor: 'pointer',
          }}
        >
          LOG HOW YOU FEEL
        </Box>
      </Group>
      {/* units reserved for future rest-day route suggestions */}
      <span style={{ display: 'none' }}>{units}</span>
    </Box>
  );
}

/** First-run / suggested: no plan. A prompt to generate a route to ride. */

/**
 * The fitness story + coach, as two columns: stats stacked on the left, the
 * coach conversation on the right (so you can interrogate the numbers next to
 * them). Stacks to a single column on mobile.
 */
function StatsCoachSection({ today, isMobile }: { today: Today; isMobile: boolean }) {
  if (isMobile) {
    return (
      <>
        <FitnessRow state={today.athleteState} />
        <GlanceCoach today={today} maxMessages={2} />
      </>
    );
  }
  return (
    <Box style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 16, alignItems: 'start' }}>
      <FitnessRow state={today.athleteState} orientation="column" />
      <GlanceCoach today={today} maxMessages={4} />
    </Box>
  );
}

export default function TodayGlance({ fixture }: TodayGlanceProps) {
  const { user } = useAuth() as { user: { id: string } | null };
  const { unitsPreference } = useUserPreferences() as { unitsPreference: UnitsPreference };
  const isMobile = useMediaQuery('(max-width: 768px)');

  const live = useToday(fixture ? null : user?.id ?? null);
  const today = fixture ?? live.today;
  // use() requires a stable promise reference across renders — memoize the
  // fixture path so we don't hand it a fresh Promise.resolve() each render.
  const routePromise = useMemo<Promise<TodayRoute | null>>(
    () => (fixture ? Promise.resolve(fixture.route) : live.routePromise),
    [fixture, live.routePromise],
  );
  const coachPromise = useMemo<Promise<string | null>>(
    () => (fixture ? Promise.resolve(fixture.coach.oneLineTake) : live.coachPromise),
    [fixture, live.coachPromise],
  );
  const recentRoutesPromise = useMemo<Promise<RecentRide[]>>(
    () => (fixture ? Promise.resolve(fixtureRecentRides) : live.recentRoutesPromise),
    [fixture, live.recentRoutesPromise],
  );
  const loading = fixture ? false : live.loading;

  const heroHeight = isMobile ? HERO_HEIGHT_MOBILE : HERO_HEIGHT;
  const units: UnitsPreference = unitsPreference === 'metric' ? 'metric' : 'imperial';

  const content = () => {
    if (loading || !today) {
      return (
        <Stack gap={14}>
          <Skeleton height={20} width="40%" radius={0} />
          <Skeleton height={heroHeight} radius={0} />
        </Stack>
      );
    }

    const state = today.heroState;

    // Rest / first-run / suggested have no matched-route hero.
    if (state === 'rest') {
      return (
        <Stack gap={14}>
          <ContextLine today={today} />
          <OutlookLine today={today} />
          <RestCard today={today} units={units} />
          <StatsCoachSection today={today} isMobile={!!isMobile} />
          <GlanceFooter routeId={null} />
          <ConsistencyRibbon days={today.ribbon} />
        </Stack>
      );
    }
    if (state === 'first-run' || state === 'suggested') {
      // Same rich two-column layout as the normal state: the hero shows recent
      // rides (route is null → HeroMap falls back to HeroRecentRides), and the
      // rail leads with a generate CTA instead of a workout card.
      const suggestedHero = (
        <Suspense fallback={<HeroSkeleton height={heroHeight} />}>
          <HeroMap
            routePromise={routePromise}
            recentRoutesPromise={recentRoutesPromise}
            units={units}
            height={heroHeight}
          />
        </Suspense>
      );
      const suggestedRail = <SuggestedRail today={today} coachPromise={coachPromise} />;
      return (
        <Stack gap={14}>
          <ContextLine today={today} />
          <OutlookLine today={today} />
          {isMobile ? (
            <Stack gap={14}>
              {suggestedHero}
              {suggestedRail}
            </Stack>
          ) : (
            <Box style={{ display: 'grid', gridTemplateColumns: '58fr 42fr', gap: 16, alignItems: 'stretch' }}>
              {suggestedHero}
              <Box style={{ background: C.card, border: `1px solid ${C.border}`, padding: 16 }}>
                {suggestedRail}
              </Box>
            </Box>
          )}
          <StatsCoachSection today={today} isMobile={!!isMobile} />
          <GlanceFooter routeId={null} />
          <ConsistencyRibbon days={today.ribbon} />
        </Stack>
      );
    }

    // Normal: matched / generated / generating.
    const hero = (
      <Suspense fallback={<HeroSkeleton height={heroHeight} />}>
        <HeroMap
          routePromise={routePromise}
          recentRoutesPromise={recentRoutesPromise}
          units={units}
          height={heroHeight}
        />
      </Suspense>
    );
    const rail = (
      <GlanceRail
        today={today}
        routePromise={routePromise}
        coachPromise={coachPromise}
        units={units}
      />
    );

    return (
      <Stack gap={14}>
        <ContextLine today={today} />
        <OutlookLine today={today} />
        {isMobile ? (
          <Stack gap={14}>
            {hero}
            {rail}
          </Stack>
        ) : (
          <Box style={{ display: 'grid', gridTemplateColumns: '58fr 42fr', gap: 16, alignItems: 'stretch' }}>
            {hero}
            <Box style={{ background: C.card, border: `1px solid ${C.border}`, padding: 16 }}>{rail}</Box>
          </Box>
        )}
        {/* The fitness story + coach: where you are, and a place to ask why. */}
        <StatsCoachSection today={today} isMobile={!!isMobile} />
        <GlanceFooter routeId={today.route?.id ?? null} />
        <ConsistencyRibbon days={today.ribbon} />
      </Stack>
    );
  };

  return (
    <AppShell>
      <Box style={{ maxWidth: 1440, margin: '0 auto', padding: isMobile ? '16px' : '20px 32px 32px' }}>
        {content()}
      </Box>
    </AppShell>
  );
}
