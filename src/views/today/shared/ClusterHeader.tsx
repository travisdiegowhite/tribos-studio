import { Box, Text } from '@mantine/core';

interface ClusterHeaderProps {
  title: string;
  subtitle: string;
}

export function ClusterHeader({ title, subtitle }: ClusterHeaderProps) {
  return (
    <Box mb={12}>
      <Text
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '2px',
          textTransform: 'uppercase',
          color: '#2A8C82',
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
          color: '#7A7970',
          marginTop: 2,
        }}
      >
        {subtitle}
      </Text>
    </Box>
  );
}
