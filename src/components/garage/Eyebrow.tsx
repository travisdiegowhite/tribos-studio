import { Group, Text } from '@mantine/core';
import { FONT } from './garageTokens';

/** The 5×5 swatch + mono label that heads every Garage card (BeatCard's eyebrow). */
export function Eyebrow({ label, accent }: { label: string; accent: string }) {
  return (
    <Group gap={9} align="center" style={{ marginBottom: 10 }}>
      <span style={{ width: 5, height: 5, background: accent, display: 'inline-block' }} />
      <Text style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 500, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--color-text-primary)' }}>
        {label}
      </Text>
    </Group>
  );
}
