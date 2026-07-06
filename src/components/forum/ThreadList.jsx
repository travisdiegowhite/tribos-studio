/**
 * ThreadList — the forum's thread index: rows with unread dots, category
 * badges, reply/reaction counts, and last-activity times.
 */

import { Card, Text, Group, Stack, Badge, Box, Avatar, Skeleton, Pagination, Center } from '@mantine/core';
import { ChatCircle, Lock, PushPin, ThumbsUp } from '@phosphor-icons/react';
import { forumAuthorName, THREADS_PER_PAGE } from '../../hooks/useForum';
import { timeAgo } from '../../utils/timeAgo';

function ThreadList({
  threads,
  categoriesById,
  total,
  page,
  onPageChange,
  loading,
  onSelectThread,
  emptyMessage = 'No threads yet. Start the first conversation.',
}) {
  if (loading) {
    return (
      <Stack gap="xs">
        {[1, 2, 3, 4, 5].map(i => (
          <Skeleton key={i} height={72} radius="md" />
        ))}
      </Stack>
    );
  }

  if (threads.length === 0) {
    return (
      <Card
        padding="xl"
        radius="md"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px dashed var(--color-bg-secondary)',
          textAlign: 'center',
        }}
      >
        <Text size="sm" c="dimmed">{emptyMessage}</Text>
      </Card>
    );
  }

  const totalPages = Math.ceil(total / THREADS_PER_PAGE);

  return (
    <Stack gap="xs">
      {threads.map(thread => (
        <ThreadRow
          key={thread.id}
          thread={thread}
          category={categoriesById[thread.category_id]}
          onClick={() => onSelectThread(thread)}
        />
      ))}

      {totalPages > 1 && (
        <Center mt="sm">
          <Pagination
            total={totalPages}
            value={page + 1}
            onChange={(p) => onPageChange(p - 1)}
            size="sm"
            color="teal"
          />
        </Center>
      )}
    </Stack>
  );
}

function ThreadRow({ thread, category, onClick }) {
  const authorName = forumAuthorName(thread.author);
  const activityTime = timeAgo(thread.last_activity_at || thread.created_at);

  return (
    <Card
      padding="sm"
      radius="md"
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-bg-secondary)',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onClick={onClick}
      className="tribos-discussion-item"
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          {/* Unread dot */}
          <Box
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              flexShrink: 0,
              marginTop: 8,
              backgroundColor: thread.is_unread ? 'var(--color-teal)' : 'transparent',
            }}
            aria-label={thread.is_unread ? 'Unread' : undefined}
          />

          <Box style={{ flex: 1, minWidth: 0 }}>
            <Group gap="xs" mb={4} wrap="nowrap">
              {thread.is_pinned && <PushPin size={14} color="var(--color-teal)" weight="fill" />}
              {thread.is_locked && <Lock size={14} color="var(--color-text-muted)" />}
              {category && (
                <Badge size="xs" variant="light" color={category.color}>
                  {category.name}
                </Badge>
              )}
            </Group>

            <Text
              size="sm"
              fw={thread.is_unread ? 700 : 500}
              lineClamp={1}
              style={{ color: 'var(--color-text-primary)' }}
            >
              {thread.title}
            </Text>

            <Group gap="xs" mt={4}>
              <Avatar size="xs" radius="xl" color="gray">
                {authorName.charAt(0).toUpperCase()}
              </Avatar>
              <Text size="xs" c="dimmed">{authorName}</Text>
              <Text size="xs" c="dimmed">·</Text>
              <Text size="xs" c="dimmed">{activityTime}</Text>
            </Group>
          </Box>
        </Group>

        <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
          <Group gap={4} align="center">
            <ChatCircle size={14} color="var(--color-text-muted)" />
            <Text size="xs" c="dimmed">{thread.reply_count}</Text>
          </Group>
          {thread.reaction_count > 0 && (
            <Group gap={4} align="center">
              <ThumbsUp size={14} color="var(--color-text-muted)" />
              <Text size="xs" c="dimmed">{thread.reaction_count}</Text>
            </Group>
          )}
        </Stack>
      </Group>
    </Card>
  );
}

export default ThreadList;
