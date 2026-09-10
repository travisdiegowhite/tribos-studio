import { Box, Stack, Text } from '@mantine/core';
import type { ServiceLogRow } from '../../hooks/useBikeHistory';
import { FONT } from './garageTokens';

/** Read-only list of what has happened to a bike. Replacing a part writes a row. */
export function ServiceLog({ rows, compact }: { rows: ServiceLogRow[]; compact: boolean }) {
  if (rows.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Nothing logged yet. Replacing a part records one here, and soon you&rsquo;ll be able to tell the coach &ldquo;swapped the chain yesterday.&rdquo;
      </Text>
    );
  }
  return (
    <Stack gap={0}>
      {rows.map((r) => (
        <Box key={r.id} style={{ display: 'flex', gap: compact ? 10 : 16, alignItems: 'baseline', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
          <span style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '1px', color: 'var(--color-text-muted)', flex: `0 0 ${compact ? 78 : 88}px` }}>{r.occurred_on}</span>
          <span style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: '1px', textTransform: 'uppercase', color: r.kind === 'issue' && !r.resolved_by_id ? 'var(--color-coral)' : 'var(--color-text-secondary)', flex: `0 0 ${compact ? 56 : 64}px` }}>{r.kind}</span>
          <span style={{ fontFamily: FONT.body, fontSize: 14, color: 'var(--color-text-primary)', lineHeight: 1.35 }}>{r.summary}</span>
        </Box>
      ))}
    </Stack>
  );
}
