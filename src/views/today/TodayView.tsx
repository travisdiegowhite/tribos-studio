import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Box } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { usePostHog } from 'posthog-js/react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../../components/AppShell.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useTodayData } from './useTodayData';
import { TodaysBrief } from './TodaysBrief';
import { AthleteState } from './AthleteState';
import { PlanExecution } from './PlanExecution';
import { CoachConversation } from './CoachConversation';
import { RecentRides } from './RecentRides';

const VIEW_VERSION = 'today_v3_clusters';
const COACH_DWELL_MS = 3000;

export default function TodayView() {
  const { user } = useAuth() as { user: { id: string } | null };
  const navigate = useNavigate();
  const posthog = usePostHog();
  const isMobile = useMediaQuery('(max-width: 768px)');

  const {
    loading,
    brief,
    athleteState,
    planExecution,
    conversation,
    recentRides,
    refreshConversation,
  } = useTodayData(user?.id ?? null);

  // ── Analytics: page view ───────────────────────────────────────────────
  const openedRef = useRef(false);
  useEffect(() => {
    if (!posthog || openedRef.current) return;
    openedRef.current = true;
    posthog.capture('today_view.opened', { view_version: VIEW_VERSION });
  }, [posthog]);

  // ── Analytics: 3s dwell on coach message ───────────────────────────────
  useEffect(() => {
    if (!posthog || !brief.coachMessage) return;
    const timer = window.setTimeout(() => {
      posthog.capture('today_view.coach_message_read', {
        view_version: VIEW_VERSION,
        persona: brief.coachPersona.id,
      });
    }, COACH_DWELL_MS);
    return () => window.clearTimeout(timer);
  }, [posthog, brief.coachMessage, brief.coachPersona.id]);

  // ── Cell click handler used by both metric clusters ────────────────────
  const handleMetricClick = useCallback(
    (cluster: 'athlete' | 'plan') => (label: string) => {
      posthog?.capture('today_view.metric_expanded', {
        view_version: VIEW_VERSION,
        cluster,
        cell: label,
      });
    },
    [posthog],
  );

  const handleSendToGarmin = useCallback(() => {
    posthog?.capture('today_view.route_sent_to_garmin', {
      view_version: VIEW_VERSION,
      route_id: brief.route?.id ?? null,
      match_pct: brief.route?.matchPct ?? null,
    });
  }, [posthog, brief.route?.id, brief.route?.matchPct]);

  const handleRideToday = useCallback(() => {
    posthog?.capture('today_view.ride_today_clicked', {
      view_version: VIEW_VERSION,
      workout_id: brief.workout?.id ?? null,
    });
  }, [posthog, brief.workout?.id]);

  const handleCoachSent = useCallback(() => {
    posthog?.capture('today_view.coach_message_sent', {
      view_version: VIEW_VERSION,
      persona: brief.coachPersona.id,
    });
  }, [posthog, brief.coachPersona.id]);

  const handleRideClick = useCallback(
    (rideId: string) => {
      posthog?.capture('today_view.recent_ride_clicked', {
        view_version: VIEW_VERSION,
        ride_id: rideId,
      });
      navigate(`/history/${rideId}`);
    },
    [posthog, navigate],
  );

  // ── Training context for the coach (for trainingContext API param) ────
  const trainingContext = useMemo(() => {
    const parts: string[] = [];
    if (athleteState.fitness != null && athleteState.fatigue != null && athleteState.formScore != null) {
      parts.push(
        `TFI: ${Math.round(athleteState.fitness)}, AFI: ${Math.round(athleteState.fatigue)}, FS: ${Math.round(athleteState.formScore)}`,
      );
    }
    if (planExecution.weekRideCount.planned > 0) {
      parts.push(
        `This week: ${planExecution.weekRideCount.completed}/${planExecution.weekRideCount.planned} rides, ${planExecution.weekDistanceMi.toFixed(1)} mi`,
      );
    }
    if (brief.workout) {
      parts.push(`Today: ${brief.workout.name} (${brief.workout.durationMin} min)`);
    }
    return parts.join('. ');
  }, [
    athleteState.fitness,
    athleteState.fatigue,
    athleteState.formScore,
    planExecution.weekRideCount,
    planExecution.weekDistanceMi,
    brief.workout,
  ]);

  return (
    <AppShell>
      <Box
        style={{
          maxWidth: 1440,
          margin: '0 auto',
          padding: isMobile ? '16px' : '20px 32px 32px',
        }}
      >
        {isMobile ? (
          <Box style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <TodaysBrief
              brief={brief}
              loading={loading}
              onSendToGarmin={handleSendToGarmin}
              onRideToday={handleRideToday}
            />
            <CoachConversation
              messages={conversation.messages}
              loading={loading}
              maxMessages={2}
              trainingContext={trainingContext}
              onMessageSent={handleCoachSent}
              onConversationRefresh={refreshConversation}
            />
            <RecentRides
              data={recentRides}
              loading={loading}
              onRideClick={handleRideClick}
            />
            <AthleteState
              data={athleteState}
              cols={2}
              onCellClick={handleMetricClick('athlete')}
            />
            <PlanExecution
              data={planExecution}
              cols={2}
              onCellClick={handleMetricClick('plan')}
            />
          </Box>
        ) : (
          <Box style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Row 1 — full width */}
            <TodaysBrief
              brief={brief}
              loading={loading}
              onSendToGarmin={handleSendToGarmin}
              onRideToday={handleRideToday}
            />

            {/* Row 2 — Athlete State + Plan Execution */}
            <Box
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 14,
              }}
            >
              <AthleteState
                data={athleteState}
                onCellClick={handleMetricClick('athlete')}
              />
              <PlanExecution
                data={planExecution}
                onCellClick={handleMetricClick('plan')}
              />
            </Box>

            {/* Row 3 — Coach Conversation + Recent Rides */}
            <Box
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 14,
              }}
            >
              <CoachConversation
                messages={conversation.messages}
                loading={loading}
                trainingContext={trainingContext}
                onMessageSent={handleCoachSent}
                onConversationRefresh={refreshConversation}
              />
              <RecentRides
                data={recentRides}
                loading={loading}
                onRideClick={handleRideClick}
              />
            </Box>
          </Box>
        )}
      </Box>
    </AppShell>
  );
}
