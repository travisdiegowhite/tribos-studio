/**
 * Floating stat card over the plot: NP / Avg / Max (+ W' min when the
 * W'Balance overlay is on), recomputed live for the zoomed window.
 */

import { Group, Paper, Stack, Text } from '@mantine/core';

export interface StatEntry {
  label: string;
  value: string;
  unit?: string;
}

interface SelectionStatCardProps {
  entries: StatEntry[];
  caption?: string | null;
}

export function SelectionStatCard({ entries, caption }: SelectionStatCardProps) {
  if (entries.length === 0) return null;
  return (
    <Paper
      p="xs"
      style={{
        position: 'absolute',
        top: 8,
        left: 8,
        backgroundColor: 'color-mix(in srgb, var(--color-card) 82%, transparent)',
        border: '1px solid var(--color-border)',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      <Stack gap={2}>
        <Group gap="md" wrap="nowrap">
          {entries.map((entry) => (
            <Stack key={entry.label} gap={0}>
              <Text size="xs" c="var(--color-text-muted)" tt="uppercase" style={{ letterSpacing: '0.04em', fontSize: 10 }}>
                {entry.label}
              </Text>
              <Group gap={3} align="baseline" wrap="nowrap">
                <Text size="sm" fw={700} ff="monospace">
                  {entry.value}
                </Text>
                {entry.unit && (
                  <Text size="xs" c="var(--color-text-muted)" style={{ fontSize: 10 }}>
                    {entry.unit}
                  </Text>
                )}
              </Group>
            </Stack>
          ))}
        </Group>
        {caption && (
          <Text size="xs" c="var(--color-text-muted)" style={{ fontSize: 10 }}>
            {caption}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
