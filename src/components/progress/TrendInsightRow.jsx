import { Group, Text, Box } from '@mantine/core';

const DOT_COLORS = {
  positive: 'var(--color-teal)',
  neutral: 'var(--color-gold)',
  attention: 'var(--color-orange)',
  urgent: 'var(--color-coral, #9E5A3C)',
};

function TrendInsightRow({ title, detail, sentiment }) {
  const dotColor = DOT_COLORS[sentiment] || DOT_COLORS.neutral;

  return (
    <Group gap="sm" wrap="nowrap" align="flex-start" py={6}>
      <Box
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
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
