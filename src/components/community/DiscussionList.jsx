/**
 * DiscussionList
 * Shows a list of discussion threads in a cafe
 */

import {
  Card,
  Text,
  Group,
  Stack,
  Badge,
  Box,
  Avatar,
  ActionIcon,
  Skeleton,
  SegmentedControl,
} from '@mantine/core';
import { tokens } from '../../theme';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '../../hooks/useDiscussions';
import { ChatCircle, Lock, PushPin } from '@phosphor-icons/react';

function DiscussionList({
  discussions,
  loading,
  selectedCategory,
  onCategoryChange,
  onSelectDiscussion,
}) {
  const categories = [
    { value: '', label: 'All' },
    { value: 'question', label: 'Questions' },
    { value: 'training', label: 'Training' },
    { value: 'general', label: 'General' },
  ];

  if (loading) {
    return (
      <Stack gap="sm">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} height={80} radius="md" />
        ))}
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {/* Category filter */}
      <SegmentedControl
        value={selectedCategory || ''}
        onChange={onCategoryChange}
        data={categories}
        size="xs"
        styles={{
          root: {
            backgroundColor: 'var(--color-bg-secondary)',
          },
        }}
      />

      {/* Discussion list */}
      {discussions.length === 0 ? (
        <Card
          padding="xl"
          radius="md"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            border: `1px dashed ${'var(--color-bg-secondary)'}`,
            textAlign: 'center',
          }}
        >
          <Text size="sm" c="dimmed">
            No discussions yet. Start a conversation with your cafe.
          </Text>
        </Card>
      ) : (
        <Stack gap="xs">
          {discussions.map(discussion => (
            <DiscussionCard
              key={discussion.id}
              discussion={discussion}
              onClick={() => onSelectDiscussion(discussion)}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function DiscussionCard({ discussion, onClick }) {
  const authorName =
    discussion.author?.community_display_name ||
    discussion.author?.display_name ||
    'Anonymous';

  const timeAgo = getTimeAgo(discussion.last_reply_at || discussion.created_at);

  return (
    <Card
      padding="sm"
      radius="md"
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        border: `1px solid ${'var(--color-bg-secondary)'}`,
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onClick={onClick}
      className="tribos-discussion-item"
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group gap="xs" mb={4}>
            {discussion.is_pinned && (
              <PushPin size={14} color={'var(--color-teal)'} />
            )}
            {discussion.is_locked && (
              <Lock size={14} color={'var(--color-text-muted)'} />
            )}
            <Badge
              size="xs"
              variant="light"
              color={CATEGORY_COLORS[discussion.category]}
            >
              {CATEGORY_LABELS[discussion.category]}
            </Badge>
          </Group>

          <Text
            size="sm"
            fw={500}
            lineClamp={1}
            style={{ color: 'var(--color-text-primary)' }}
          >
            {discussion.title}
          </Text>

          <Group gap="xs" mt={4}>
            <Avatar size="xs" radius="xl" color="gray">
              {authorName.charAt(0).toUpperCase()}
            </Avatar>
            <Text size="xs" c="dimmed">
              {authorName}
            </Text>
            <Text size="xs" c="dimmed">·</Text>
            <Text size="xs" c="dimmed">
              {timeAgo}
            </Text>
          </Group>
        </Box>

        <Group gap={4} align="center">
          <ChatCircle size={14} color={'var(--color-text-muted)'} />
          <Text size="xs" c="dimmed">
            {discussion.reply_count}
          </Text>
        </Group>
      </Group>
    </Card>
  );
}

function getTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return date.toLocaleDateString();
}

export default DiscussionList;
