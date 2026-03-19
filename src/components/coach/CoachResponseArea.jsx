import { ArrowsClockwise, CalendarPlus, ChartLine, Eye, Path, Sparkle, WarningCircle } from '@phosphor-icons/react';
import { Stack, Group, Text, Button, Box, Alert, Paper } from '@mantine/core';

// Typing indicator with CSS animation
function TypingIndicator() {
  return (
    <>
      <style>{`
        @keyframes coachBounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
      `}</style>
      <Group gap={4} align="center">
        <Text size="sm" c="dimmed" mr="xs">
          Coach is thinking
        </Text>
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: 'var(--color-teal)',
              animation: 'coachBounce 1.4s ease-in-out infinite',
              animationDelay: `${i * 0.16}s`,
            }}
          />
        ))}
      </Group>
    </>
  );
}

// Map action types to icons
const ACTION_ICONS = {
  add_to_calendar: CalendarPlus,
  open_route: Path,
  create_plan: ChartLine,
  view_details: Eye,
  show_alternatives: Sparkle,
};

function CoachResponseArea({
  isLoading,
  response,
  actions = [],
  error = null,
  onRetry,
  onActionClick,
}) {
  if (error) {
    return (
      <Alert
        color="red"
        variant="light"
        icon={<WarningCircle size={18} />}
        title="Something went wrong"
        styles={{
          root: {
            backgroundColor: 'rgba(255, 68, 68, 0.1)',
            border: '1px solid rgba(255, 68, 68, 0.2)',
          },
        }}
      >
        <Stack gap="sm">
          <Text size="sm">{error}</Text>
          {onRetry && (
            <Button
              size="xs"
              variant="light"
              color="red"
              leftSection={<ArrowsClockwise size={14} />}
              onClick={onRetry}
            >
              Try again
            </Button>
          )}
        </Stack>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <Paper
        p="lg"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px solid var(--tribos-border)',
        }}
      >
        <TypingIndicator />
      </Paper>
    );
  }

  if (!response) {
    return null;
  }

  return (
    <Paper
      p="lg"
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        border: '1px solid var(--tribos-border)',
      }}
    >
      <Stack gap="md">
        {/* Response text */}
        <Text
          size="sm"
          style={{
            color: 'var(--color-text-primary)',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}
        >
          {response}
        </Text>

        {/* Action buttons */}
        {actions.length > 0 && (
          <Group gap="sm" wrap="wrap">
            {actions.map((action, index) => {
              const ActionIcon = ACTION_ICONS[action.actionType] || Sparkle;
              return (
                <Button
                  key={action.id || index}
                  size="xs"
                  variant={action.primary ? 'filled' : 'light'}
                  color="teal"
                  leftSection={<ActionIcon size={14} />}
                  onClick={() => onActionClick?.(action)}
                  styles={{
                    root: action.primary
                      ? {}
                      : {
                          backgroundColor: 'var(--tribos-bg-elevated)',
                          border: '1px solid var(--tribos-border)',
                        },
                  }}
                >
                  {action.label}
                </Button>
              );
            })}
          </Group>
        )}
      </Stack>
    </Paper>
  );
}

export default CoachResponseArea;
