/**
 * DiscussionThread
 * Shows a single discussion with its replies
 */

import { useState } from 'react';
import {
  Card,
  Text,
  Group,
  Stack,
  Badge,
  Box,
  Avatar,
  Button,
  Textarea,
  ActionIcon,
  Tooltip,
  Divider,
  Menu,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconThumbUp,
  IconMessageCircle,
  IconDotsVertical,
  IconEdit,
  IconTrash,
  IconPin,
  IconLock,
  IconChartBar,
} from '@tabler/icons-react';
import { tokens } from '../../theme';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '../../hooks/useDiscussions';

function DiscussionThread({
  discussion,
  replies,
  currentUserId,
  onBack,
  onCreateReply,
  onMarkHelpful,
  onUnmarkHelpful,
  onDeleteReply,
  loading,
}) {
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmitReply = async () => {
    if (!replyText.trim() || submitting) return;

    setSubmitting(true);
    try {
      await onCreateReply({ body: replyText.trim() });
      setReplyText('');
    } finally {
      setSubmitting(false);
    }
  };

  const authorName =
    discussion.author?.community_display_name ||
    discussion.author?.display_name ||
    'Anonymous';

  return (
    <Stack gap="md">
      {/* Back button and header */}
      <Group gap="sm">
        <ActionIcon
          variant="subtle"
          onClick={onBack}
          style={{ color: tokens.colors.textSecondary }}
        >
          <IconArrowLeft size={18} />
        </ActionIcon>
        <Text size="sm" c="dimmed">
          Back to discussions
        </Text>
      </Group>

      {/* Main discussion */}
      <Card
        padding="md"
        radius="md"
        style={{
          backgroundColor: tokens.colors.bgSecondary,
          border: `1px solid ${tokens.colors.bgTertiary}`,
        }}
      >
        <Stack gap="sm">
          {/* Header */}
          <Group justify="space-between" align="flex-start">
            <Group gap="xs">
              {discussion.is_pinned && (
                <Badge size="xs" variant="light" color="lime" leftSection={<IconPin size={10} />}>
                  Pinned
                </Badge>
              )}
              <Badge
                size="xs"
                variant="light"
                color={CATEGORY_COLORS[discussion.category]}
              >
                {CATEGORY_LABELS[discussion.category]}
              </Badge>
              {discussion.include_training_context && (
                <Tooltip label="Includes training context">
                  <Badge size="xs" variant="light" color="blue" leftSection={<IconChartBar size={10} />}>
                    Context
                  </Badge>
                </Tooltip>
              )}
            </Group>
            {discussion.is_locked && (
              <Badge size="xs" variant="light" color="gray" leftSection={<IconLock size={10} />}>
                Locked
              </Badge>
            )}
          </Group>

          {/* Title */}
          <Text size="lg" fw={600} style={{ color: tokens.colors.textPrimary }}>
            {discussion.title}
          </Text>

          {/* Author info */}
          <Group gap="sm">
            <Avatar size="sm" radius="xl" color="gray">
              {authorName.charAt(0).toUpperCase()}
            </Avatar>
            <Box>
              <Text size="sm" fw={500}>{authorName}</Text>
              <Text size="xs" c="dimmed">
                {new Date(discussion.created_at).toLocaleDateString()} at{' '}
                {new Date(discussion.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </Box>
          </Group>

          {/* Training context */}
          {discussion.include_training_context && discussion.training_context && (
            <Card
              padding="xs"
              radius="sm"
              style={{
                backgroundColor: tokens.colors.bgTertiary,
              }}
            >
              <Group gap="lg">
                {discussion.training_context.ctl && (
                  <Box>
                    <Text size="xs" c="dimmed">CTL</Text>
                    <Text size="sm" fw={500}>{discussion.training_context.ctl}</Text>
                  </Box>
                )}
                {discussion.training_context.atl && (
                  <Box>
                    <Text size="xs" c="dimmed">ATL</Text>
                    <Text size="sm" fw={500}>{discussion.training_context.atl}</Text>
                  </Box>
                )}
                {discussion.training_context.tsb && (
                  <Box>
                    <Text size="xs" c="dimmed">TSB</Text>
                    <Text size="sm" fw={500}>{discussion.training_context.tsb}</Text>
                  </Box>
                )}
                {discussion.training_context.weekly_hours && (
                  <Box>
                    <Text size="xs" c="dimmed">Weekly Hours</Text>
                    <Text size="sm" fw={500}>{discussion.training_context.weekly_hours}h</Text>
                  </Box>
                )}
              </Group>
            </Card>
          )}

          {/* Body */}
          <Text
            size="sm"
            style={{
              color: tokens.colors.textSecondary,
              whiteSpace: 'pre-wrap',
            }}
          >
            {discussion.body}
          </Text>
        </Stack>
      </Card>

      {/* Replies section */}
      <Divider
        label={`${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
        labelPosition="center"
      />

      {/* Reply list */}
      <Stack gap="sm">
        {replies.map(reply => (
          <ReplyCard
            key={reply.id}
            reply={reply}
            isOwn={reply.author_id === currentUserId}
            onMarkHelpful={() => onMarkHelpful(reply.id)}
            onUnmarkHelpful={() => onUnmarkHelpful(reply.id)}
            onDelete={() => onDeleteReply(reply.id)}
          />
        ))}
      </Stack>

      {/* Reply input */}
      {!discussion.is_locked && (
        <Card
          padding="md"
          radius="md"
          style={{
            backgroundColor: tokens.colors.bgSecondary,
            border: `1px solid ${tokens.colors.bgTertiary}`,
          }}
        >
          <Stack gap="sm">
            <Textarea
              placeholder="Add a reply..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              minRows={2}
              maxRows={6}
              styles={{
                input: {
                  backgroundColor: tokens.colors.bgTertiary,
                  border: `1px solid ${tokens.colors.bgTertiary}`,
                  color: tokens.colors.textPrimary,
                  '&::placeholder': {
                    color: tokens.colors.textMuted,
                  },
                  '&:focus': {
                    borderColor: tokens.colors.electricLime,
                  },
                },
              }}
            />
            <Group justify="flex-end">
              <Button
                size="sm"
                onClick={handleSubmitReply}
                loading={submitting}
                disabled={!replyText.trim()}
                style={{
                  backgroundColor: tokens.colors.electricLime,
                  color: tokens.colors.bgPrimary,
                }}
              >
                Reply
              </Button>
            </Group>
          </Stack>
        </Card>
      )}

      {discussion.is_locked && (
        <Card
          padding="md"
          radius="md"
          style={{
            backgroundColor: tokens.colors.bgSecondary,
            border: `1px solid ${tokens.colors.bgTertiary}`,
            textAlign: 'center',
          }}
        >
          <Group gap="xs" justify="center">
            <IconLock size={16} color={tokens.colors.textMuted} />
            <Text size="sm" c="dimmed">
              This discussion is locked
            </Text>
          </Group>
        </Card>
      )}
    </Stack>
  );
}

function ReplyCard({ reply, isOwn, onMarkHelpful, onUnmarkHelpful, onDelete }) {
  const authorName =
    reply.author?.community_display_name ||
    reply.author?.display_name ||
    'Anonymous';

  return (
    <Card
      padding="sm"
      radius="md"
      style={{
        backgroundColor: tokens.colors.bgSecondary,
        border: `1px solid ${isOwn ? tokens.colors.electricLime + '30' : tokens.colors.bgTertiary}`,
      }}
    >
      <Stack gap="xs">
        {/* Header */}
        <Group justify="space-between">
          <Group gap="sm">
            <Avatar size="sm" radius="xl" color="gray">
              {authorName.charAt(0).toUpperCase()}
            </Avatar>
            <Box>
              <Text size="sm" fw={500}>{authorName}</Text>
              <Text size="xs" c="dimmed">
                {new Date(reply.created_at).toLocaleDateString()} at{' '}
                {new Date(reply.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </Box>
          </Group>

          {isOwn && (
            <Menu shadow="md" width={120}>
              <Menu.Target>
                <ActionIcon variant="subtle" size="sm" color="gray">
                  <IconDotsVertical size={14} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconTrash size={14} />}
                  color="red"
                  onClick={onDelete}
                >
                  Delete
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>

        {/* Training context */}
        {reply.include_training_context && reply.training_context && (
          <Card
            padding="xs"
            radius="sm"
            style={{
              backgroundColor: tokens.colors.bgTertiary,
            }}
          >
            <Group gap="md">
              {reply.training_context.ctl && (
                <Box>
                  <Text size="xs" c="dimmed">CTL</Text>
                  <Text size="xs" fw={500}>{reply.training_context.ctl}</Text>
                </Box>
              )}
              {reply.training_context.weekly_hours && (
                <Box>
                  <Text size="xs" c="dimmed">Weekly</Text>
                  <Text size="xs" fw={500}>{reply.training_context.weekly_hours}h</Text>
                </Box>
              )}
            </Group>
          </Card>
        )}

        {/* Body */}
        <Text
          size="sm"
          style={{
            color: tokens.colors.textSecondary,
            whiteSpace: 'pre-wrap',
          }}
        >
          {reply.body}
        </Text>

        {/* Actions */}
        <Group gap="xs">
          <Tooltip label={reply.has_marked_helpful ? 'Remove helpful' : 'Mark as helpful'}>
            <Button
              variant={reply.has_marked_helpful ? 'light' : 'subtle'}
              size="xs"
              color={reply.has_marked_helpful ? 'green' : 'gray'}
              leftSection={<IconThumbUp size={14} />}
              onClick={reply.has_marked_helpful ? onUnmarkHelpful : onMarkHelpful}
              disabled={isOwn}
            >
              {reply.helpful_count > 0 ? reply.helpful_count : ''} Helpful
            </Button>
          </Tooltip>
        </Group>
      </Stack>
    </Card>
  );
}

export default DiscussionThread;
