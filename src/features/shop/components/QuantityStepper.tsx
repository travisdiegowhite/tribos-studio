import { ActionIcon, Group, Text } from '@mantine/core';
import { Minus, Plus } from '@phosphor-icons/react';

interface Props {
  value: number;
  onChange: (delta: number) => void;
  busy?: boolean;
  low?: boolean;
}

/** Big +/− buttons for counting at the bench. */
export function QuantityStepper({ value, onChange, busy, low }: Props) {
  return (
    <Group gap="sm" wrap="nowrap">
      <ActionIcon size={44} variant="default" aria-label="One fewer" disabled={busy || value <= 0} onClick={() => onChange(-1)}>
        <Minus size={20} />
      </ActionIcon>
      <Text
        ff="'Courier Prime', monospace"
        fw={700}
        fz={28}
        miw={48}
        ta="center"
        style={{ color: low ? 'var(--color-signal-text)' : undefined }}
        aria-live="polite"
      >
        {value}
      </Text>
      <ActionIcon size={44} variant="default" aria-label="One more" disabled={busy} onClick={() => onChange(1)}>
        <Plus size={20} />
      </ActionIcon>
    </Group>
  );
}
