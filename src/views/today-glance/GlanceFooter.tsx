/**
 * GlanceFooter — thin DM Mono links that deep-link to the surfaces that
 * absorbed the old Today's heavy modules: Adjust route → Builder, Full
 * workout → terrain/interval detail, Talk to coach → the coach command bar.
 */

import { Group, UnstyledButton, Text } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { useCoachCommandBar } from '../../components/coach';
import { C, FONT } from './tokens';

interface GlanceFooterProps {
  /** routeId of today's matched route, to preload the builder when available. */
  routeId?: string | null;
}

function FooterLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <UnstyledButton onClick={onClick}>
      <Text
        style={{
          fontFamily: FONT.mono,
          fontSize: 11,
          letterSpacing: '0.5px',
          color: C.text3,
          textDecoration: 'underline',
          textUnderlineOffset: 3,
        }}
      >
        {label}
      </Text>
    </UnstyledButton>
  );
}

export function GlanceFooter({ routeId }: GlanceFooterProps) {
  const navigate = useNavigate();
  // useCoachCommandBar is defined in a .jsx module, so its return is untyped
  // here; narrow to the one method we use.
  const { open } = useCoachCommandBar() as { open: (query?: string | null) => void };

  return (
    <Group gap={20} mt={4}>
      <FooterLink
        label="Adjust route →"
        onClick={() => navigate(routeId ? `/ride/${routeId}` : '/ride/new')}
      />
      <FooterLink label="Full workout →" onClick={() => navigate('/train')} />
      <FooterLink label="Talk to coach →" onClick={() => open()} />
    </Group>
  );
}
