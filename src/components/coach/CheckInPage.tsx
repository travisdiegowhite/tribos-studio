/**
 * CheckInPage — Main coach check-in view.
 *
 * Shown as the content area on the COACH tab in TrainingDashboard.
 * Composes: narrative, week bar, recommendation card,
 * acknowledgment, and intake interview gate.
 */

import { useEffect, useState } from 'react';
import { Stack, Text, Center, Loader, Paper, Group, Button } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useCoachCheckIn } from '../../hooks/useCoachCheckIn';
import CheckInNarrative from './CheckInNarrative';
import CheckInWeekBar from './CheckInWeekBar';
import CheckInRecommendationCard from './CheckInRecommendation';
import CheckInAcknowledgment from './CheckInAcknowledgment';
import IntakeInterview from './IntakeInterview';
import type { PersonaId, DecisionType } from '../../types/checkIn';

export default function CheckInPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const {
    currentCheckIn,
    loading,
    persona,
    hasCompletedIntake,
    makeDecision,
    markSeen,
    currentDecision,
    savePersona,
    requestCheckIn,
    generating,
    generateError,
  } = useCoachCheckIn(userId);

  const [showIntake, setShowIntake] = useState(false);

  // Show intake interview if user hasn't completed it
  useEffect(() => {
    if (!loading && !hasCompletedIntake && userId) {
      setShowIntake(true);
    }
  }, [loading, hasCompletedIntake, userId]);

  // Mark check-in as seen when viewed
  useEffect(() => {
    if (currentCheckIn && !currentCheckIn.seen) {
      markSeen(currentCheckIn.id);
    }
  }, [currentCheckIn, markSeen]);

  const handleIntakeComplete = (personaId: PersonaId) => {
    savePersona(personaId, 'intake');
    setShowIntake(false);
  };

  const handleDecision = async (decision: DecisionType, summary: string) => {
    if (!currentCheckIn) return;
    await makeDecision(currentCheckIn.id, decision, summary);
  };

  if (loading) {
    return (
      <Center py="xl">
        <Loader size="sm" color="var(--color-teal)" />
      </Center>
    );
  }

  // Intake interview gate
  if (showIntake && userId) {
    return (
      <IntakeInterview
        opened={showIntake}
        onComplete={handleIntakeComplete}
        userId={userId}
      />
    );
  }

  // No check-in available
  if (!currentCheckIn) {
    return (
      <Paper
        p="xl"
        withBorder
        style={{
          borderRadius: 0,
          borderColor: 'var(--tribos-border-default)',
          textAlign: 'center',
        }}
      >
        <Stack align="center" gap="sm">
          <IconSparkles size={32} color="var(--color-teal)" style={{ opacity: 0.5 }} />
          <Text size="lg" fw={600}>No check-in yet</Text>
          <Text size="sm" c="dimmed" maw={400}>
            Your coaching check-in will appear here after your next synced activity,
            or you can request one now based on your latest ride.
          </Text>
          {generateError && (
            <Text size="sm" c="red">{generateError}</Text>
          )}
          <Button
            variant="outline"
            color="teal"
            leftSection={<IconSparkles size={16} />}
            loading={generating}
            onClick={requestCheckIn}
            style={{ borderRadius: 0 }}
          >
            Request Check-In
          </Button>
        </Stack>
      </Paper>
    );
  }

  // Extract structured week schedule from context snapshot
  const weekSchedule = currentCheckIn.context_snapshot &&
    typeof currentCheckIn.context_snapshot === 'object' &&
    'week_schedule' in currentCheckIn.context_snapshot
    ? (currentCheckIn.context_snapshot as Record<string, unknown>).week_schedule
    : [];

  return (
    <Stack gap="lg">
      {/* Header */}
      <Group justify="space-between">
        <Text size="xs" fw={700} tt="uppercase" ff="monospace" c="dimmed">
          Coach Check-In
        </Text>
        <Group gap="sm">
          <Button
            variant="subtle"
            size="xs"
            color="teal"
            leftSection={<IconSparkles size={14} />}
            loading={generating}
            onClick={requestCheckIn}
            style={{ borderRadius: 0 }}
          >
            New Check-In
          </Button>
          <Text size="xs" c="dimmed">
            {new Date(currentCheckIn.created_at).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </Text>
        </Group>
      </Group>
      {generateError && (
        <Text size="sm" c="red">{generateError}</Text>
      )}

      {/* Week bar chart */}
      <CheckInWeekBar weekSchedule={weekSchedule as any[]} />

      {/* Coaching narrative + deviation callout */}
      <CheckInNarrative
        narrative={currentCheckIn.narrative}
        deviationCallout={currentCheckIn.deviation_callout}
        nextSessionPurpose={currentCheckIn.next_session_purpose}
        personaId={currentCheckIn.persona_id as PersonaId}
      />

      {/* Recommendation card (if any) */}
      {currentCheckIn.recommendation && (
        <CheckInRecommendationCard
          recommendation={currentCheckIn.recommendation}
          onDecision={handleDecision}
          existingDecision={currentDecision?.decision as DecisionType | null ?? null}
        />
      )}

      {/* Acknowledgment (after decision) */}
      {currentDecision && (
        <CheckInAcknowledgment
          personaId={currentCheckIn.persona_id as PersonaId}
          decision={currentDecision.decision as DecisionType}
        />
      )}
    </Stack>
  );
}
