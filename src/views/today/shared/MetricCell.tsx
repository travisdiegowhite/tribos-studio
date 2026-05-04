import { Box, Text } from '@mantine/core';
import type { ReactNode } from 'react';

interface MetricCellProps {
  label: string;
  visual: ReactNode;
  word: string;
  wordColor: string;
  subtitle?: string | null;
  onClick?: () => void;
}

export function MetricCell({
  label,
  visual,
  word,
  wordColor,
  subtitle,
  onClick,
}: MetricCellProps) {
  return (
    <Box
      onClick={onClick}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <Text
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
          color: '#7A7970',
        }}
      >
        {label}
      </Text>
      <Box style={{ minHeight: 28 }}>{visual}</Box>
      <Text
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: wordColor,
        }}
      >
        {word}
      </Text>
      {subtitle && (
        <Text
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 10,
            color: '#7A7970',
          }}
        >
          {subtitle}
        </Text>
      )}
    </Box>
  );
}
