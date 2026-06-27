import { useEffect, useState } from 'react';
import { Box, Button, Group, Modal, Text } from '@mantine/core';
import { CalendarCheck, CalendarPlus } from '@phosphor-icons/react';
import { CoachMarkdown } from './CoachMarkdown';
import TrainingPlanPreview from './TrainingPlanPreview';
import AnchoredPlanPreview from './AnchoredPlanPreview';

// Format a 'YYYY-MM-DD' scheduled date as e.g. "Tue, Jun 30" for the added-workout chip.
function formatScheduledDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || '';
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

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
 * @param {boolean}  [props.planActivated=false]
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
  planActivated = false,
  onAddWorkout,
  onActivatePlan,
  onDismissPlan,
  onDismissAnchored,
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [anchorOpen, setAnchorOpen] = useState(false);

  const recs = Array.isArray(workoutRecommendations) ? workoutRecommendations : [];
  const hasWorkouts = recs.length > 0;
  // Workouts the coach already persisted server-side (recommend_workout auto-add).
  // These render as confirmations, not "Add" buttons, and trigger a calendar refresh.
  const addedRecs = recs.filter((r) => r && r.added);
  const pendingRecs = recs.filter((r) => !r || !r.added);
  const hasPlan = !!trainingPlanPreview && !trainingPlanPreview.error;
  const hasAnchored = !!anchoredPlanPreview && anchoredPlanPreview.ok !== false;

  // When the server reports added workouts OR an auto-activated plan, refresh the
  // calendar/planner surfaces once.
  const addedKey = addedRecs.map((r) => r.id || r.workout_id).join(',');
  useEffect(() => {
    if (addedKey) {
      window.dispatchEvent(new CustomEvent('training-plan-updated'));
    }
  }, [addedKey]);
  useEffect(() => {
    if (planActivated && hasPlan) {
      window.dispatchEvent(new CustomEvent('training-plan-activated'));
    }
  }, [planActivated, hasPlan]);

  return (
    <>
      {showMessage && message ? (
        <CoachMarkdown size="xs" color="var(--color-text-primary)">
          {message}
        </CoachMarkdown>
      ) : null}

      {hasWorkouts && (
        <Group gap={6} mt={4}>
          {addedRecs.map((rec, idx) => (
            <Group key={rec.id || rec.workout_id || `added-${idx}`} gap={4} wrap="nowrap">
              <CalendarCheck size={12} color="var(--color-sage, #6B8E6B)" weight="fill" />
              <Text size="xs" c="dimmed">
                Added {rec.name || rec.workout_id}
                {rec.scheduledDate ? ` · ${formatScheduledDate(rec.scheduledDate)}` : ''}
              </Text>
            </Group>
          ))}
          {pendingRecs.map((rec, idx) => (
            <Button
              key={rec.id || rec.workout_id || `pending-${idx}`}
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
            activated={planActivated}
            compact
          />
        </Box>
      )}

      {hasPlan && planDisplay === 'cta' && (
        <>
          <Group gap={6} mt={6} align="center">
            {planActivated && (
              <Group gap={4} wrap="nowrap">
                <CalendarCheck size={12} color="var(--color-sage, #6B8E6B)" weight="fill" />
                <Text size="xs" c="dimmed">Added to your calendar</Text>
              </Group>
            )}
            <Button
              size="compact-xs"
              variant="light"
              color="terracotta"
              leftSection={<CalendarPlus size={12} />}
              onClick={() => setReviewOpen(true)}
            >
              {planActivated ? 'View plan' : 'Review & activate'}{trainingPlanPreview.name ? ` — ${trainingPlanPreview.name}` : ''}
            </Button>
          </Group>
          <Modal
            opened={reviewOpen}
            onClose={() => setReviewOpen(false)}
            title={planActivated ? 'Training plan' : 'Review training plan'}
            size="lg"
            centered
            styles={{ content: { borderRadius: 0 } }}
          >
            <TrainingPlanPreview
              plan={trainingPlanPreview}
              activated={planActivated}
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
