import { Button, ActionIcon, Group, Kbd, Text, Box, Tooltip } from '@mantine/core';
import { IconSparkles, IconMessageCircle } from '@tabler/icons-react';
import { useCoachCommandBar } from './CoachCommandBarContext';

function CoachCommandBarTrigger({
  variant = 'primary',
  showShortcut = true,
  className,
  prefillQuery,
}) {
  const { open } = useCoachCommandBar();

  const handleClick = () => {
    open(prefillQuery);
  };

  // Minimal variant - just an icon button
  if (variant === 'minimal') {
    return (
      <Tooltip label="Ask AI Coach (Ctrl+K)" position="bottom">
        <ActionIcon
          size="lg"
          variant="light"
          color="terracotta"
          onClick={handleClick}
          className={className}
        >
          <IconSparkles size={18} />
        </ActionIcon>
      </Tooltip>
    );
  }

  // Floating variant - fixed position button
  if (variant === 'floating') {
    return (
      <Tooltip label="Ask AI Coach (Ctrl+K)" position="left">
        <ActionIcon
          size={56}
          radius="xl"
          variant="filled"
          color="terracotta"
          onClick={handleClick}
          className={className}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 100,
            boxShadow:
              '0 8px 32px rgba(158, 90, 60, 0.35), 0 4px 12px rgba(0,0,0,0.4)',
            transition: 'all 200ms ease',
          }}
          sx={{
            '&:hover': {
              transform: 'translateY(-2px) scale(1.05)',
              boxShadow:
                '0 12px 40px rgba(158, 90, 60, 0.45), 0 6px 16px rgba(0,0,0,0.5)',
            },
          }}
        >
          <IconSparkles size={24} />
        </ActionIcon>
      </Tooltip>
    );
  }

  // Primary variant - full button with text and shortcut
  return (
    <Button
      variant="light"
      color="terracotta"
      onClick={handleClick}
      className={className}
      leftSection={<IconSparkles size={18} />}
      rightSection={
        showShortcut && (
          <Kbd
            size="xs"
            style={{
              backgroundColor: 'var(--tribos-bg-elevated)',
              border: '1px solid var(--tribos-border)',
              fontSize: 10,
              padding: '2px 6px',
            }}
          >
            ⌘K
          </Kbd>
        )
      }
      styles={{
        root: {
          transition: 'all 200ms ease',
          '&:hover': {
            transform: 'translateY(-1px)',
            boxShadow: '0 4px 16px rgba(158, 90, 60, 0.3)',
          },
        },
        section: {
          '&[data-position="right"]': {
            marginLeft: 8,
          },
        },
      }}
    >
      Ask AI Coach
    </Button>
  );
}

export default CoachCommandBarTrigger;
