/**
 * TodayView — the front door for authenticated Tribos users
 *
 * Reads from useTodaySnapshot and dispatches to the small set of
 * presentational components in src/views/today/.
 *
 * Routing notes (see src/App.jsx): /today is the primary tab and the
 * default landing route after auth. /dashboard now redirects to /today.
 */

import { useEffect, useMemo } from 'react';
import { Container, Stack } from '@mantine/core';
import AppShell from '../../components/AppShell';
import PageHeader from '../../components/PageHeader';
// AuthContext is JS — narrow the shape we use.
import { useAuth as useAuthRaw } from '../../contexts/AuthContext';

interface AuthLike {
  user: { id: string; email?: string; user_metadata?: { display_name?: string } } | null;
}
function useAuth(): AuthLike {
  return useAuthRaw() as AuthLike;
}
import { useTodaySnapshot } from '../../hooks/useTodaySnapshot';
import { trackPageView } from '../../utils/activityTracking';
import HeroRoute from './HeroRoute';
import RouteSuggestionPicker from './RouteSuggestionPicker';
import ReadinessChip from './ReadinessChip';
import StateStrip from './StateStrip';
import CoachCard from './CoachCard';
import WorkoutBlocks from './WorkoutBlocks';

const VIEW_VERSION = 'today_v1';

function captureEvent(name: string, props: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  const ph = (window as unknown as { posthog?: { capture: (e: string, p?: object) => void } }).posthog;
  ph?.capture(name, { view_version: VIEW_VERSION, ...props });
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Up early';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function TodayView() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const snapshot = useTodaySnapshot(userId);

  // PostHog: view-open event
  useEffect(() => {
    if (!userId) return;
    captureEvent('today_view.opened');
    trackPageView('/today', 'Today');
  }, [userId]);

  // PostHog: instrument coach paragraph "read" — fired on a 3-second dwell
  // after the paragraph becomes available (audit suggests scroll-depth or
  // 3+ second dwell as the read signal).
  useEffect(() => {
    if (!snapshot.coachParagraph) return;
    const t = setTimeout(() => {
      captureEvent('today_view.coach_paragraph_read');
    }, 3000);
    return () => clearTimeout(t);
  }, [snapshot.coachParagraph]);

  const handleSelectRoute = useMemo(
    () => (routeId: string) => {
      snapshot.selectRoute(routeId);
      captureEvent('today_view.route_selected', { route_id: routeId });
    },
    [snapshot],
  );

  const wrappedLogReadiness = useMemo(
    () => async (input: Parameters<typeof snapshot.logReadiness>[0]) => {
      await snapshot.logReadiness(input);
    },
    [snapshot],
  );

  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Rider';

  return (
    <AppShell>
      <Container size="xl" py="lg" px={20}>
        <Stack gap={14}>
          <PageHeader
            greeting={`${getGreeting()},`}
            title={displayName}
            titleOrder={2}
          />

          <ReadinessChip
            loggedToday={snapshot.readinessLoggedToday}
            checkin={snapshot.readinessCheckin}
            onLog={wrappedLogReadiness}
          />

          <StateStrip
            freshnessWord={snapshot.freshnessWord}
            formScore={snapshot.formScore}
            phase={snapshot.phase}
            weekInPhase={snapshot.weekInPhase}
            weeksInPhase={snapshot.weeksInPhase}
            conditionsWord={snapshot.conditionsWord}
            weather={snapshot.weather}
          />

          <HeroRoute route={snapshot.selectedRoute} />

          <RouteSuggestionPicker
            suggestions={snapshot.suggestedRoutes}
            selectedRouteId={snapshot.selectedRouteId}
            onSelect={handleSelectRoute}
          />

          <CoachCard
            personaId={snapshot.persona}
            paragraph={snapshot.coachParagraph}
            state={snapshot.paragraphState}
          />

          <WorkoutBlocks workout={snapshot.workout} />
        </Stack>
      </Container>
    </AppShell>
  );
}

export default TodayView;
