/**
 * GuestSaveModal — the conversion prompt for guests in the route builder.
 *
 * Opens when a guest hits a gated action: clicking Save (trigger 'save')
 * or exhausting the daily generation allowance (trigger 'gen_cap'). It
 * does NOT embed a signup form — it stashes a return-to-builder path and
 * sends the guest through the normal /auth flow. The in-progress route
 * survives in the localStorage-persisted builder store.
 */
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Modal, Text, Button, Stack, Group } from '@mantine/core';
import { RB2, RB2_FONT } from './brand';
import { trackRb2 } from '../telemetry/trackRb2';
import { stashReturnTo } from '../../../utils/returnTo';

export interface GuestSaveModalProps {
  opened: boolean;
  onClose: () => void;
  trigger: 'save' | 'gen_cap';
}

const COPY: Record<GuestSaveModalProps['trigger'], { title: string; body: string }> = {
  save: {
    title: 'Save this route',
    body: "Create a free account to save this route. It's safe right here — you'll come straight back after signing up.",
  },
  gen_cap: {
    title: "You've used today's free generations",
    body: 'Create a free account to keep generating routes. Anything you built stays right here.',
  },
};

export function GuestSaveModal({ opened, onClose, trigger }: GuestSaveModalProps) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (opened) trackRb2('signup_modal_shown', { trigger });
  }, [opened, trigger]);

  const goToAuth = () => {
    // Come back to the builder (not /today) once the session exists; the
    // persisted store rehydrates the in-progress route.
    stashReturnTo(location.pathname || '/ride/new');
    navigate('/auth');
  };

  const copy = COPY[trigger];

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={copy.title}
      radius={0}
      data-testid="rb2-guest-save-modal"
    >
      <Stack>
        <Text style={{ fontFamily: RB2_FONT.body, fontSize: 14, color: RB2.textSecondary }}>
          {copy.body}
        </Text>
        <Group justify="flex-end" gap={6}>
          <Button
            variant="outline"
            onClick={onClose}
            data-testid="rb2-guest-modal-dismiss"
            styles={{
              root: {
                borderRadius: 0,
                borderColor: RB2.border,
                color: RB2.textSecondary,
                fontFamily: RB2_FONT.heading,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontSize: 12,
                height: 32,
              },
            }}
          >
            Not now
          </Button>
          <Button
            onClick={goToAuth}
            data-testid="rb2-guest-modal-signup"
            styles={{
              root: {
                borderRadius: 0,
                backgroundColor: RB2.teal,
                fontFamily: RB2_FONT.heading,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontSize: 12,
                height: 32,
              },
            }}
          >
            Create Free Account
          </Button>
        </Group>
        <Text
          size="xs"
          style={{ fontFamily: RB2_FONT.body, color: RB2.textTertiary, textAlign: 'right' }}
        >
          Already have an account?{' '}
          <Text
            component="span"
            onClick={goToAuth}
            style={{ color: RB2.teal, cursor: 'pointer', textDecoration: 'underline' }}
          >
            Log in
          </Text>
        </Text>
      </Stack>
    </Modal>
  );
}

export default GuestSaveModal;
