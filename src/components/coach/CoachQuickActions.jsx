import { Stack, UnstyledButton, Group, Text, Box, ThemeIcon } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';

// Default quick actions - can be made dynamic based on user context
const QUICK_ACTIONS = [
  {
    id: 'plan',
    icon: '🎯',
    label: 'Build a training plan',
    description: 'Create a periodized plan for your next race',
    query: 'Build a training plan for my next race',
  },
  {
    id: 'analyze',
    icon: '📊',
    label: 'Analyze my fitness',
    description: 'Review your current form and trends',
    query: 'Analyze my current fitness and form',
  },
  {
    id: 'today',
    icon: '💡',
    label: 'What should I do today?',
    description: 'Get a workout recommendation',
    query: 'What workout should I do today based on my current fatigue and goals?',
  },
  {
    id: 'ama',
    icon: '🔍',
    label: 'AMA about your data',
    description: 'Ask anything about your rides, commutes, routes, or stats',
    query: 'What are some interesting stats and highlights from my riding this year?',
  },
];

function CoachQuickActions({ onSelect, actions = QUICK_ACTIONS }) {
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
        Quick Actions
      </Text>

      {actions.map((action) => (
        <UnstyledButton
          key={action.id}
          onClick={() => onSelect(action.query)}
          style={{
            display: 'block',
            width: '100%',
            padding: '12px 16px',
            borderRadius: 12,
            transition: 'all 150ms ease',
          }}
          sx={(theme) => ({
            '&:hover': {
              backgroundColor: 'var(--tribos-bg-tertiary)',
              transform: 'translateX(4px)',
            },
          })}
        >
          <Group justify="space-between" wrap="nowrap">
            <Group gap="md" wrap="nowrap">
              <Box
                style={{
                  fontSize: 20,
                  width: 36,
                  height: 36,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'var(--tribos-bg-tertiary)',
                  borderRadius: 10,
                }}
              >
                {action.icon}
              </Box>
              <Box>
                <Text
                  size="sm"
                  fw={500}
                  style={{ color: 'var(--tribos-text-primary)' }}
                >
                  {action.label}
                </Text>
                <Text size="xs" c="dimmed" lineClamp={1}>
                  {action.description}
                </Text>
              </Box>
            </Group>
            <ThemeIcon
              variant="subtle"
              color="gray"
              size="sm"
              style={{ opacity: 0.5 }}
            >
              <IconChevronRight size={16} />
            </ThemeIcon>
          </Group>
        </UnstyledButton>
      ))}
    </Stack>
  );
}

export default CoachQuickActions;
export { QUICK_ACTIONS };
