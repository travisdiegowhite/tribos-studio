/**
 * One turn in the /coach conversation. Coach turns render markdown plus any
 * structured extras: workout chips and a plan preview (through the shared
 * CoachReply, so this page can't drift from the other coach surfaces) and the
 * visuals the coach chose to show.
 */

import { Box, Text } from '@mantine/core';
import { CoachMarkdown } from '../../components/coach/CoachMarkdown';
import { CoachReply } from '../../components/coach/CoachReply';
import type { ChatMessage } from './useCoachChat';
import type { CoachFocus, WorkoutRecommendation } from './coachApi';
import { VisualCard } from './visuals/VisualCard';

interface MessageBubbleProps {
  message: ChatMessage;
  onAddWorkout: (rec: WorkoutRecommendation) => void;
  onActivatePlan: (messageId: string, plan: Record<string, unknown>) => Promise<void>;
  onFocus: (focus: CoachFocus) => void;
}

export function MessageBubble({ message, onAddWorkout, onActivatePlan, onFocus }: MessageBubbleProps) {
  if (message.role === 'user') {
    return (
      <Box style={{ alignSelf: 'flex-end', maxWidth: 'min(80%, 560px)' }}>
        {message.focusLabel && (
          <Text
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--color-text-muted)',
              textAlign: 'right',
              marginBottom: 2,
            }}
          >
            ↳ {message.focusLabel}
          </Text>
        )}
        <Box
          style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            padding: '9px 13px',
          }}
        >
          <Text style={{ fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {message.content}
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box style={{ alignSelf: 'stretch', maxWidth: 760 }}>
      <Box
        style={{
          borderLeft: '3px solid var(--color-highlight)',
          padding: '2px 0 2px 14px',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <CoachMarkdown size="md" color="var(--color-text-primary)">
          {message.content}
        </CoachMarkdown>
        <CoachReply
          showMessage={false}
          workoutRecommendations={message.workoutRecommendations ?? undefined}
          trainingPlanPreview={message.trainingPlanPreview ?? undefined}
          planActivated={message.planActivated}
          planDisplay="cta"
          onAddWorkout={(rec: object) => onAddWorkout(rec as WorkoutRecommendation)}
          onActivatePlan={(plan: object) => onActivatePlan(message.id, plan as Record<string, unknown>)}
        />
      </Box>
      {message.visuals?.map((spec, idx) => (
        <Box key={`${message.id}-v${idx}`} mt="sm">
          <VisualCard spec={spec} onFocus={onFocus} />
        </Box>
      ))}
    </Box>
  );
}
