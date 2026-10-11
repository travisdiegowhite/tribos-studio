import { Group, Text, Box } from '@mantine/core';

// Role colours: good news in ink, neutral muted, attention and urgent in signal.
const DOT_COLORS = {
  positive: 'var(--color-ink)',
  neutral: 'var(--color-text-muted)',
  attention: 'var(--color-signal)',
  urgent: 'var(--color-signal-text)',
};

function TrendInsightRow({ title, detail, sentiment }) {
  const dotColor = DOT_COLORS[sentiment] || DOT_COLORS.neutral;

  return (
    <Group gap="sm" wrap="nowrap" align="flex-start" py={6}>
      <Box
        style={{
          width: 8,
          height: 8,
          backgroundColor: dotColor,
          flexShrink: 0,
          marginTop: 5,
        }}
      />
      <Box style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            marginBottom: 2,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: 'var(--color-text-secondary)',
            lineHeight: 1.4,
          }}
        >
          {detail}
        </Text>
      </Box>
    </Group>
  );
}

export default TrendInsightRow;
