import { Box } from '@mantine/core';

interface DotRowProps {
  total: number;
  completed: number;
  activeColor?: string;
  inactiveColor?: string;
  size?: number;
}

export function DotRow({
  total,
  completed,
  activeColor = '#2A8C82',
  inactiveColor = '#DDDDD8',
  size = 10,
}: DotRowProps) {
  return (
    <Box style={{ display: 'flex', gap: 6, alignItems: 'center', height: 16 }}>
      {Array.from({ length: Math.max(total, 1) }).map((_, idx) => (
        <Box
          key={idx}
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            backgroundColor: idx < completed ? activeColor : inactiveColor,
          }}
        />
      ))}
    </Box>
  );
}
