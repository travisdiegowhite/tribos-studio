import React, { useState, useEffect, useCallback } from 'react';
import { Stack, Text, Card, Button, Loader, Alert, Group, Box, Code, Collapse } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconRefresh, IconAlertCircle, IconBug } from '@tabler/icons-react';
import type { CheckInDecisionType, PersonaId } from '../../types/checkIn';
import { useCoachCheckIn } from '../../hooks/useCoachCheckIn';
import { IntakeInterview } from './IntakeInterview';
import { CheckInNarrative } from './CheckInNarrative';
import { CheckInWeekBar } from './CheckInWeekBar';
import { CheckInRecommendation } from './CheckInRecommendation';
import { CheckInAcknowledgment } from './CheckInAcknowledgment';

interface CheckInPageProps {
  userId: string | null;
}

export function CheckInPage({ userId }: CheckInPageProps) {
  const {
    checkIn,
    loading,
    generating,
    error,
    persona,
    hasPersona,
    needsGeneration,
    generateCheckIn,
    regenerateCheckIn,
    submitDecision,
    classifyPersona,
    setPersonaManual,
    loadCheckIn,
    latestActivityId,
    debugContext,
  } = useCoachCheckIn({ userId });

  const [decided, setDecided] = useState(false);
  const [debugOpen, { toggle: toggleDebug }] = useDisclosure(false);
  const [lastDecision, setLastDecision] = useState<CheckInDecisionType | null>(null);
  const [weekSchedule, setWeekSchedule] = useState<any[]>([]);
  const [blockPurpose, setBlockPurpose] = useState<string | null>(null);

  // Auto-generate when a new activity is detected
  useEffect(() => {
    if (needsGeneration && hasPersona && !generating && !loading) {
      generateCheckIn(latestActivityId || undefined);
    }
  }, [needsGeneration, hasPersona, generating, loading, generateCheckIn, latestActivityId]);

  // Load week schedule context for the bar chart
  useEffect(() => {
    if (!checkIn || !userId) return;

    const loadWeekContext = async () => {
      try {
        const { supabase } = await import('../../lib/supabase');

        // Get active plan
        const { data: plan } = await supabase
          .from('training_plans')
          .select('id, current_week, started_at, duration_weeks, template_id')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (plan) {
          // Calculate current week dynamically (same as planner does).
          // The DB's current_week is set to 1 at activation and never updated.
          const diffDays = Math.floor(
            (Date.now() - new Date(plan.started_at).getTime()) / 86400000
          );
          const calculatedWeek = Math.max(1, Math.min(
            Math.floor(diffDays / 7) + 1,
            plan.duration_weeks || 1
          ));

          const { data: workouts } = await supabase
            .from('planned_workouts')
            .select('day_of_week, workout_type, target_tss, actual_tss, completed, scheduled_date, activity_id')
            .eq('plan_id', plan.id)
            .eq('week_number', calculatedWeek)
            .order('day_of_week', { ascending: true });

          let schedule = workouts || [];

          // Cross-reference activities table for real TSS values.
          // STRICT: Only trust `completed` if backed by a real activity.
          const activityIds = schedule
            .filter((w: any) => w.activity_id)
            .map((w: any) => w.activity_id);

          const activityTssMap: Record<string, number | null> = {};
          if (activityIds.length > 0) {
            const { data: realActivities } = await supabase
              .from('activities')
              .select('id, tss')
              .in('id', activityIds);

            for (const a of (realActivities || [])) {
              activityTssMap[a.id] = a.tss;
            }
          }

          // Single pass: only trust completion if backed by a real activity
          schedule = schedule.map((w: any) => {
            if (w.activity_id && activityTssMap[w.activity_id] !== undefined) {
              return { ...w, actual_tss: activityTssMap[w.activity_id], completed: true };
            }
            if (w.completed || w.actual_tss) {
              return { ...w, actual_tss: null, completed: false, activity_id: null };
            }
            return w;
          });

          // Date guard: strip future-dated completion data
          const today = new Date().toISOString().split('T')[0];
          schedule = schedule.map((w: any) => {
            if (w.scheduled_date && w.scheduled_date > today) {
              return { ...w, completed: false, actual_tss: null, activity_id: null };
            }
            return w;
          });

          setWeekSchedule(schedule);
        }
      } catch {
        // Non-critical
      }
    };

    loadWeekContext();
  }, [checkIn, userId]);

  const handleAccept = useCallback(async () => {
    if (!checkIn?.recommendation || !checkIn.id) return;

    const success = await submitDecision({
      user_id: userId!,
      check_in_id: checkIn.id,
      decision: 'accept',
      recommendation_summary: checkIn.recommendation.action + ': ' + checkIn.recommendation.detail,
    });

    if (success) {
      setDecided(true);
      setLastDecision('accept');
    }
  }, [checkIn, userId, submitDecision]);

  const handleDismiss = useCallback(async () => {
    if (!checkIn?.recommendation || !checkIn.id) return;

    const success = await submitDecision({
      user_id: userId!,
      check_in_id: checkIn.id,
      decision: 'dismiss',
      recommendation_summary: checkIn.recommendation.action + ': ' + checkIn.recommendation.detail,
    });

    if (success) {
      setDecided(true);
      setLastDecision('dismiss');
    }
  }, [checkIn, userId, submitDecision]);

  const handleSkipIntake = useCallback(() => {
    setPersonaManual('pragmatist');
  }, [setPersonaManual]);

  // Loading state
  if (loading) {
    return (
      <Stack align="center" py="xl">
        <Loader size="md" color="teal" />
        <Text size="sm" c="dimmed">Loading check-in...</Text>
      </Stack>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />} style={{ borderRadius: 0 }}>
        <Text size="sm">{error}</Text>
        <Button variant="subtle" color="red" size="xs" mt="xs" onClick={loadCheckIn}>
          Try again
        </Button>
      </Alert>
    );
  }

  // No persona set — show intake interview
  if (!hasPersona) {
    return (
      <Stack gap="md">
        <IntakeInterview
          onComplete={classifyPersona}
          onSkip={handleSkipIntake}
        />
      </Stack>
    );
  }

  // Generating state
  if (generating) {
    return (
      <Stack align="center" py="xl">
        <Loader size="md" color="teal" />
        <Text size="sm" c="dimmed">Your coach is reviewing your latest ride...</Text>
      </Stack>
    );
  }

  // No check-in yet (no activities synced)
  if (!checkIn) {
    return (
      <Card withBorder p="xl" style={{ borderRadius: 0 }}>
        <Stack align="center" gap="md" py="md">
          <Text size="sm" c="dimmed" ta="center">
            No check-in yet. Sync an activity from your device and your coach will have something to say.
          </Text>
          <Button
            variant="outline"
            color="teal"
            size="sm"
            leftSection={<IconRefresh size={14} />}
            onClick={loadCheckIn}
            style={{ borderRadius: 0 }}
          >
            Refresh
          </Button>
        </Stack>
      </Card>
    );
  }

  // Main check-in view
  return (
    <Stack gap="md">
      {/* Week bar chart */}
      {weekSchedule.length > 0 && (
        <Card withBorder p="md" style={{ borderRadius: 0 }}>
          <CheckInWeekBar weekSchedule={weekSchedule} />
        </Card>
      )}

      {/* Narrative + Regenerate */}
      <Card withBorder p="md" style={{ borderRadius: 0 }}>
        <Group justify="flex-end" mb="xs">
          <Button
            variant="subtle"
            color="dimmed"
            size="xs"
            leftSection={<IconRefresh size={14} />}
            onClick={regenerateCheckIn}
            loading={generating}
            style={{ borderRadius: 0 }}
          >
            Regenerate
          </Button>
        </Group>
        <CheckInNarrative checkIn={checkIn} blockPurpose={blockPurpose} />
      </Card>

      {/* Recommendation card */}
      {checkIn.recommendation && !decided && (
        <CheckInRecommendation
          recommendation={checkIn.recommendation}
          personaId={checkIn.persona_id}
          onAccept={handleAccept}
          onDismiss={handleDismiss}
          decided={decided}
        />
      )}

      {/* Acknowledgment after decision */}
      {decided && lastDecision && (
        <CheckInAcknowledgment
          decision={lastDecision}
          personaId={checkIn.persona_id}
        />
      )}

      {/* Debug panel — shows raw data sent to AI after Regenerate */}
      {debugContext && (
        <Card withBorder p="md" style={{ borderRadius: 0 }}>
          <Group justify="space-between" mb={debugOpen ? 'xs' : 0}>
            <Button
              variant="subtle"
              color="dimmed"
              size="xs"
              leftSection={<IconBug size={14} />}
              onClick={toggleDebug}
              style={{ borderRadius: 0 }}
            >
              {debugOpen ? 'Hide' : 'Show'} Coach Data (Debug)
            </Button>
            {debugContext.calculated_week !== debugContext.db_current_week && (
              <Text size="xs" c="red" fw={600}>
                Week mismatch: DB says {debugContext.db_current_week}, calculated {debugContext.calculated_week}
              </Text>
            )}
          </Group>
          <Collapse in={debugOpen}>
            <Code block style={{ fontSize: 11, maxHeight: 400, overflow: 'auto' }}>
              {JSON.stringify(debugContext, null, 2)}
            </Code>
          </Collapse>
        </Card>
      )}
    </Stack>
  );
}
