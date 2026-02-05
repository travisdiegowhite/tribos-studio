import { Stack, UnstyledButton, Group, Text, Box, ThemeIcon, Loader } from '@mantine/core';
import { IconHistory, IconChevronRight } from '@tabler/icons-react';

function formatRelativeTime(timestamp) {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function CoachRecentQuestions({
  questions = [],
  onSelect,
  maxItems = 5,
  loading = false,
}) {
  const displayQuestions = questions.slice(0, maxItems);

  if (loading) {
    return (
      <Stack gap="xs">
        <Text
          size="xs"
          fw={600}
          c="dimmed"
          tt="uppercase"
          style={{ letterSpacing: '0.05em' }}
        >
          Recent
        </Text>
        <Box style={{ textAlign: 'center', padding: '16px' }}>
          <Loader size="sm" color="gray" />
        </Box>
      </Stack>
    );
  }

  if (displayQuestions.length === 0) {
    return null;
  }

  return (
    <Stack gap={0}>
      <Text
        size="xs"
        fw={600}
        c="dimmed"
        tt="uppercase"
        mb="xs"
        style={{ letterSpacing: '0.05em' }}
      >
        Recent
      </Text>

      {displayQuestions.map((question) => (
        <UnstyledButton
          key={question.id}
          onClick={() => onSelect(question.query)}
          style={{
            display: 'block',
            width: '100%',
            padding: '10px 16px',
            borderRadius: 10,
            transition: 'all 150ms ease',
          }}
          sx={(theme) => ({
            '&:hover': {
              backgroundColor: 'var(--tribos-bg-tertiary)',
            },
          })}
        >
          <Group justify="space-between" wrap="nowrap" gap="md">
            <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
              <ThemeIcon
                variant="subtle"
                color="gray"
                size="sm"
                style={{ flexShrink: 0 }}
              >
                <IconHistory size={14} />
              </ThemeIcon>
              <Text
                size="sm"
                style={{
                  color: 'var(--tribos-text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {question.query}
              </Text>
            </Group>
            <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
              {formatRelativeTime(question.timestamp)}
            </Text>
          </Group>
        </UnstyledButton>
      ))}
    </Stack>
  );
}

export default CoachRecentQuestions;
