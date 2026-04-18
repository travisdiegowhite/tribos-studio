import { Box, Button, Collapse, Group, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { CaretDown, CaretUp } from '@phosphor-icons/react';

/**
 * Collapsed container for the full metric bars (StatusBar +
 * ProprietaryMetricsBar). The dashboard hides these by default now that
 * the TodayHero paragraph leads the page; riders who want the numbers
 * expand the drawer with one click.
 *
 * Children are passed in rather than imported here so the parent keeps
 * full control over data hydration.
 */
export default function FullMetricsDrawer({ children, defaultOpen = false }) {
  const [opened, { toggle }] = useDisclosure(defaultOpen);

  return (
    <Box
      style={{
        border: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-card)',
      }}
    >
      <Group
        justify="space-between"
        style={{
          padding: '12px 16px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={toggle}
      >
        <Text
          fw={600}
          style={{
            fontFamily: "'Barlow Condensed', 'Barlow', sans-serif",
            fontSize: 12,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--color-text-muted)',
          }}
        >
          Full metrics
        </Text>
        <Button
          variant="subtle"
          size="compact-xs"
          rightSection={opened ? <CaretUp size={14} /> : <CaretDown size={14} />}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
        >
          {opened ? 'Hide' : 'Show'}
        </Button>
      </Group>
      <Collapse in={opened}>
        <Stack gap={10} p={10}>
          {children}
        </Stack>
      </Collapse>
    </Box>
  );
}
