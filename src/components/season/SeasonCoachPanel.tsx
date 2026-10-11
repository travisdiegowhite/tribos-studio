/**
 * The season coach (Season tab, Phase 5).
 *
 * Asked only on request, never on a move. Shows what changed since the last
 * conversation (from the engine's diff, no AI involved), lets the athlete ask
 * a question, and prints the reply in the coach's voice. Reset puts races back
 * to the version last discussed. See docs/season-planner-build-plan.md.
 */

import { useMemo, useState, type CSSProperties } from 'react';
import { Box, Button, Group, Stack, Text, Textarea } from '@mantine/core';
import type { CoachState, SeasonActions } from '../../hooks/useSeasonPlan';
import type { SeasonPlan } from '../../lib/season/engine';
import { MAX_QUESTION_CHARS, athleteChanges, changesSince, type DiscussedSnapshot } from '../../lib/season/coachPayload';

const mono: CSSProperties = { fontFamily: 'var(--font-mono)' };
const label: CSSProperties = { ...mono, letterSpacing: '0.08em', textTransform: 'uppercase' };

export default function SeasonCoachPanel({
  plan,
  discussed,
  coach,
  actions,
}: {
  plan: SeasonPlan;
  discussed: DiscussedSnapshot | null;
  coach: CoachState;
  actions: Pick<SeasonActions, 'askCoach' | 'resetToDiscussed'>;
}) {
  const [question, setQuestion] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  // The same sentences the coach is sent (minus knock-on effects), so the athlete sees what it's commenting on.
  const headline = useMemo(() => (discussed ? athleteChanges(changesSince(discussed.plan, plan)) : []), [plan, discussed]);
  const asking = coach.status === 'asking';

  return (
    <Box style={{ border: '1px solid var(--color-border)', padding: 16 }}>
      <Text size="xs" c="var(--color-text-muted)" style={label}>
        {coach.personaName ?? 'Your coach'}
      </Text>

      <Box mt={8}>
        {discussed === null ? (
          <Text size="sm" c="var(--color-text-secondary)">
            You haven&apos;t talked this season through yet. Ask for a read on it.
          </Text>
        ) : headline.length === 0 ? (
          <Text size="sm" c="var(--color-text-secondary)">
            Nothing has changed since you last talked.
          </Text>
        ) : (
          <>
            <Text size="sm" fw={700}>
              Since you last talked: {headline.length} change{headline.length === 1 ? '' : 's'}
            </Text>
            <Stack gap={2} mt={4} component="ul" style={{ margin: 0, paddingLeft: 18 }}>
              {headline.map((c, i) => (
                <Text key={i} component="li" size="xs" c="var(--color-text-secondary)">
                  {c.text}
                </Text>
              ))}
            </Stack>
          </>
        )}
      </Box>

      {coach.message && (
        <Text mt="md" style={{ ...mono, fontSize: 15, whiteSpace: 'pre-wrap' }} aria-live="polite">
          {coach.message}
        </Text>
      )}

      <Textarea
        mt="md"
        radius={0}
        size="sm"
        autosize
        minRows={1}
        maxRows={4}
        maxLength={MAX_QUESTION_CHARS}
        placeholder="Ask something (optional): Can I fit a gravel race in June?"
        aria-label="Question for the coach"
        value={question}
        onChange={(e) => setQuestion(e.currentTarget.value)}
        disabled={asking}
      />
      <Group mt="sm" gap="xs" justify="space-between" wrap="wrap">
        <Button
          radius={0}
          size="sm"
          loading={asking}
          onClick={() => {
            void actions.askCoach(question).then(() => setQuestion(''));
          }}
        >
          Ask the coach
        </Button>
        {discussed !== null && headline.length > 0 &&
          (confirmReset ? (
            <Group gap="xs">
              <Button
                radius={0}
                size="xs"
               
                onClick={() => {
                  actions.resetToDiscussed();
                  setConfirmReset(false);
                }}
              >
                Put races back
              </Button>
              <Button radius={0} size="xs" variant="subtle" onClick={() => setConfirmReset(false)}>
                Cancel
              </Button>
            </Group>
          ) : (
            <Button radius={0} size="xs" variant="subtle" disabled={asking} onClick={() => setConfirmReset(true)}>
              Reset to what we discussed
            </Button>
          ))}
      </Group>

      {coach.status === 'error' && coach.error && (
        <Text size="xs" mt="sm" c="var(--color-signal-text)" role="alert">
          {coach.error}
        </Text>
      )}
    </Box>
  );
}
