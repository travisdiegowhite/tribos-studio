import { useState } from 'react';
import { Box, Button, Group, Modal } from '@mantine/core';
import { CalendarPlus } from '@phosphor-icons/react';
import { CoachMarkdown } from './CoachMarkdown';
import TrainingPlanPreview from './TrainingPlanPreview';
import AnchoredPlanPreview from './AnchoredPlanPreview';

/**
 * Single shared renderer for the AI coach's structured response. Every coach surface
 * (Today's CoachConversation, CoachCard, CoachCommandBar) renders workout-add cards and
 * the training-plan preview through THIS component, so the surfaces can never diverge
 * again (the divergence is what let the Today panel silently drop the structured output).
 *
 * Renders, in order, whatever non-null pieces it is given:
 *   1. the coach message text (skip with showMessage={false} when the caller renders its
 *      own message bubble — CoachCard/CommandBar do),
 *   2. "Add {workout}" buttons for each workout recommendation,
 *   3. the training plan, either inline (planDisplay="inline") or as a compact
 *      "Review & activate" button that opens the full preview in a modal (planDisplay="cta",
 *      used on the compact Today card).
 *
 * @param {object}   props
 * @param {string}   [props.message]
 * @param {boolean}  [props.showMessage=true]
 * @param {Array}    [props.workoutRecommendations]
 * @param {object}   [props.trainingPlanPreview]
 * @param {object}   [props.anchoredPlanPreview]
 * @param {'inline'|'cta'} [props.planDisplay='inline']
 * @param {(rec:object)=>void}        [props.onAddWorkout]
 * @param {(plan:object)=>Promise}    [props.onActivatePlan]
 * @param {()=>void}                  [props.onDismissPlan]
 * @param {()=>void}                  [props.onDismissAnchored]
 */
export function CoachReply({
  message,
  showMessage = true,
  workoutRecommendations,
  trainingPlanPreview,
  anchoredPlanPreview,
  planDisplay = 'inline',
  onAddWorkout,
  onActivatePlan,
  onDismissPlan,
  onDismissAnchored,
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [anchorOpen, setAnchorOpen] = useState(false);

  const hasWorkouts = Array.isArray(workoutRecommendations) && workoutRecommendations.length > 0;
  const hasPlan = !!trainingPlanPreview && !trainingPlanPreview.error;
  const hasAnchored = !!anchoredPlanPreview && anchoredPlanPreview.ok !== false;

  return (
    <>
      {showMessage && message ? (
        <CoachMarkdown size="xs" color="var(--color-text-primary)">
          {message}
        </CoachMarkdown>
      ) : null}

      {hasWorkouts && (
        <Group gap={4} mt={4}>
          {workoutRecommendations.map((rec, idx) => (
            <Button
              key={rec.id || rec.workout_id || idx}
              size="compact-xs"
              variant="light"
              color="teal"
              leftSection={<CalendarPlus size={12} />}
              onClick={() => onAddWorkout?.(rec)}
            >
              Add {rec.name || rec.workout_id}
            </Button>
          ))}
        </Group>
      )}

      {hasPlan && planDisplay === 'inline' && (
        <Box mt="xs">
          <TrainingPlanPreview
            plan={trainingPlanPreview}
            onActivate={onActivatePlan}
            onDismiss={onDismissPlan}
            compact
          />
        </Box>
      )}

      {hasPlan && planDisplay === 'cta' && (
        <>
          <Group gap={6} mt={6}>
            <Button
              size="compact-xs"
              variant="light"
              color="terracotta"
              leftSection={<CalendarPlus size={12} />}
              onClick={() => setReviewOpen(true)}
            >
              Review &amp; activate{trainingPlanPreview.name ? ` — ${trainingPlanPreview.name}` : ''}
            </Button>
          </Group>
          <Modal
            opened={reviewOpen}
            onClose={() => setReviewOpen(false)}
            title="Review training plan"
            size="lg"
            centered
            styles={{ content: { borderRadius: 0 } }}
          >
            <TrainingPlanPreview
              plan={trainingPlanPreview}
              onActivate={async (plan) => {
                await onActivatePlan?.(plan);
                setReviewOpen(false);
              }}
              onDismiss={() => {
                onDismissPlan?.();
                setReviewOpen(false);
              }}
            />
          </Modal>
        </>
      )}

      {hasAnchored && planDisplay === 'inline' && (
        <AnchoredPlanPreview preview={anchoredPlanPreview} onDismiss={onDismissAnchored} compact />
      )}

      {hasAnchored && planDisplay === 'cta' && (
        <>
          <Group gap={6} mt={6}>
            <Button
              size="compact-xs"
              variant="light"
              color="terracotta"
              leftSection={<CalendarPlus size={12} />}
              onClick={() => setAnchorOpen(true)}
            >
              Review &amp; anchor{anchoredPlanPreview.horizon_event?.name ? ` — ${anchoredPlanPreview.horizon_event.name}` : ''}
            </Button>
          </Group>
          <Modal
            opened={anchorOpen}
            onClose={() => setAnchorOpen(false)}
            title="Review race plan"
            size="lg"
            centered
            styles={{ content: { borderRadius: 0 } }}
          >
            <AnchoredPlanPreview
              preview={anchoredPlanPreview}
              onDismiss={() => {
                onDismissAnchored?.();
                setAnchorOpen(false);
              }}
            />
          </Modal>
        </>
      )}
    </>
  );
}

export default CoachReply;
