/**
 * ReactionBar — emoji reaction toggles for a thread or post.
 * Shows all reaction types with counts; the current user's picks are
 * highlighted. Zero-count reactions render only in the "add" popover.
 */

import { Group, ActionIcon, Popover, Text, UnstyledButton, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Smiley } from '@phosphor-icons/react';
import { REACTION_EMOJI } from '../../hooks/useForum';

const REACTION_LABELS = {
  thumbs_up: 'Thumbs up',
  heart: 'Heart',
  fire: 'Fire',
  flex: 'Strong',
  laugh: 'Laugh',
};

function ReactionBar({ summary, onToggle, size = 'sm' }) {
  const [pickerOpened, { toggle: togglePicker, close: closePicker }] = useDisclosure(false);
  const counts = summary?.counts || {};
  const mine = summary?.mine || [];

  const visible = Object.keys(REACTION_EMOJI).filter(type => (counts[type] || 0) > 0);

  const handleToggle = (type) => {
    onToggle(type);
    closePicker();
  };

  return (
    <Group gap={6} wrap="wrap">
      {visible.map(type => {
        const isMine = mine.includes(type);
        return (
          <UnstyledButton
            key={type}
            onClick={() => handleToggle(type)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: size === 'xs' ? '1px 6px' : '2px 8px',
              borderRadius: 12,
              fontSize: size === 'xs' ? 12 : 13,
              border: `1px solid ${isMine ? 'var(--color-teal)' : 'var(--color-bg-secondary)'}`,
              backgroundColor: isMine ? 'var(--color-teal)' + '20' : 'var(--color-bg-secondary)',
              cursor: 'pointer',
            }}
            aria-label={`${REACTION_LABELS[type]} (${counts[type]})`}
          >
            <span>{REACTION_EMOJI[type]}</span>
            <Text size="xs" span c={isMine ? undefined : 'dimmed'} fw={isMine ? 600 : 400}>
              {counts[type]}
            </Text>
          </UnstyledButton>
        );
      })}

      <Popover opened={pickerOpened} onChange={closePicker} position="top" shadow="md" withArrow>
        <Popover.Target>
          <Tooltip label="Add reaction">
            <ActionIcon
              variant="subtle"
              color="gray"
              size={size === 'xs' ? 'sm' : 'md'}
              onClick={togglePicker}
              aria-label="Add reaction"
            >
              <Smiley size={size === 'xs' ? 14 : 16} />
            </ActionIcon>
          </Tooltip>
        </Popover.Target>
        <Popover.Dropdown p={6} style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
          <Group gap={4}>
            {Object.keys(REACTION_EMOJI).map(type => (
              <ActionIcon
                key={type}
                variant={mine.includes(type) ? 'light' : 'subtle'}
                color={mine.includes(type) ? 'teal' : 'gray'}
                onClick={() => handleToggle(type)}
                aria-label={REACTION_LABELS[type]}
              >
                <span style={{ fontSize: 16 }}>{REACTION_EMOJI[type]}</span>
              </ActionIcon>
            ))}
          </Group>
        </Popover.Dropdown>
      </Popover>
    </Group>
  );
}

export default ReactionBar;
