import { Box } from '@mantine/core';
import type { ReactNode } from 'react';

interface ClusterCardProps {
  children: ReactNode;
  /** When true, removes the inner padding so the action bar can flush-mount. */
  flush?: boolean;
}

/**
 * Flat surface, sharp 1px border, no shadow. Matches the brand system.
 * Padding is intentional — 14px vertical / 16px horizontal — except for
 * full-width clusters that need flush content (the action bar in
 * TODAY'S BRIEF), which pass `flush`.
 */
export function ClusterCard({ children, flush = false }: ClusterCardProps) {
  return (
    <Box
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #DDDDD8',
        padding: flush ? 0 : '14px 16px',
      }}
    >
      {children}
    </Box>
  );
}
