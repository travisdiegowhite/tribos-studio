/**
 * ThreadView — a single forum thread: original post, replies, reactions,
 * quote-reply composer, author edit/delete, and moderator pin/lock.
 */

import { useState, useEffect } from 'react';
import {
  Card,
  Text,
  Group,
  Stack,
  Badge,
  Box,
  Avatar,
  Button,
  ActionIcon,
  Textarea,
  Menu,
  Skeleton,
  Divider,
  SegmentedControl,
  Paper,
  CloseButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  ArrowLeft,
  DotsThreeVertical,
  Lock,
  LockOpen,
  PencilSimple,
  PushPin,
  PushPinSlash,
  Quotes,
  Trash,
} from '@phosphor-icons/react';
import ForumMarkdown from './ForumMarkdown';
import ReactionBar from './ReactionBar';
import { forumAuthorName } from '../../hooks/useForum';
import { timeAgo } from '../../utils/timeAgo';

function ThreadView({
  thread,
  posts,
  reactions,
  category,
  currentUserId,
  isModerator,
  loading,
  onBack,
  onCreatePost,
  onUpdatePost,
  onDeletePost,
  onEditThread,
  onDeleteThread,
  onToggleReaction,
  onSetThreadFlags,
}) {
  const [replyBody, setReplyBody] = useState('');
  const [replyMode, setReplyMode] = useState('write');
  const [quotedPost, setQuotedPost] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingPostId, setEditingPostId] = useState(null);
  const [editBody, setEditBody] = useState('');

  // Reset composer state when switching threads
  useEffect(() => {
    setReplyBody('');
    setQuotedPost(null);
    setEditingPostId(null);
  }, [thread?.id]);

  if (loading || !thread) {
    return (
      <Stack gap="sm">
        <Skeleton height={40} radius="md" />
        <Skeleton height={160} radius="md" />
        <Skeleton height={100} radius="md" />
      </Stack>
    );
  }

  const isThreadAuthor = thread.author_id === currentUserId;
  const canModerate = isModerator;
  const postsById = Object.fromEntries(posts.map(p => [p.id, p]));

  const handleReply = async () => {
    const body = replyBody.trim();
    if (!body) return;

    setSubmitting(true);
    try {
      const created = await onCreatePost(thread.id, body, quotedPost?.id);
      if (created) {
        setReplyBody('');
        setQuotedPost(null);
        setReplyMode('write');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuote = (post) => {
    setQuotedPost(post);
    // Prefill a markdown quote of the first few lines
    const quoted = post.body
      .split('\n')
      .slice(0, 4)
      .map(line => `> ${line}`)
      .join('\n');
    setReplyBody(prev => prev ? prev : `${quoted}\n\n`);
  };

  const handleSaveEdit = async () => {
    const body = editBody.trim();
    if (!body) return;
    const ok = await onUpdatePost(editingPostId, body);
    if (ok) {
      setEditingPostId(null);
      setEditBody('');
    }
  };

  const handleDeleteThread = async () => {
    if (!window.confirm('Delete this thread and all its replies? This cannot be undone.')) return;
    const ok = await onDeleteThread(thread.id);
    if (ok) {
      notifications.show({ title: 'Thread deleted', message: 'The thread has been removed.', color: 'sage' });
      onBack();
    }
  };

  const handleDeletePost = async (postId) => {
    if (!window.confirm('Delete this reply?')) return;
    await onDeletePost(postId);
  };

  return (
    <Stack gap="md">
      {/* Header row */}
      <Group justify="space-between" wrap="nowrap">
        <Button
          variant="subtle"
          size="xs"
          color="gray"
          leftSection={<ArrowLeft size={14} />}
          onClick={onBack}
        >
          All threads
        </Button>

        {(isThreadAuthor || canModerate) && (
          <Menu position="bottom-end" shadow="md">
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" aria-label="Thread actions">
                <DotsThreeVertical size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {isThreadAuthor && (
                <Menu.Item leftSection={<PencilSimple size={14} />} onClick={onEditThread}>
                  Edit thread
                </Menu.Item>
              )}
              {canModerate && (
                <>
                  <Menu.Item
                    leftSection={thread.is_pinned ? <PushPinSlash size={14} /> : <PushPin size={14} />}
                    onClick={() => onSetThreadFlags(thread.id, { is_pinned: !thread.is_pinned })}
                  >
                    {thread.is_pinned ? 'Unpin thread' : 'Pin thread'}
                  </Menu.Item>
                  <Menu.Item
                    leftSection={thread.is_locked ? <LockOpen size={14} /> : <Lock size={14} />}
                    onClick={() => onSetThreadFlags(thread.id, { is_locked: !thread.is_locked })}
                  >
                    {thread.is_locked ? 'Unlock thread' : 'Lock thread'}
                  </Menu.Item>
                </>
              )}
              {(isThreadAuthor || canModerate) && (
                <>
                  <Menu.Divider />
                  <Menu.Item color="red" leftSection={<Trash size={14} />} onClick={handleDeleteThread}>
                    Delete thread
                  </Menu.Item>
                </>
              )}
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>

      {/* Original post */}
      <Card
        padding="lg"
        radius="md"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-teal)30',
        }}
      >
        <Stack gap="sm">
          <Group gap="xs">
            {thread.is_pinned && <PushPin size={16} color="var(--color-teal)" weight="fill" />}
            {thread.is_locked && <Lock size={16} color="var(--color-text-muted)" />}
            {category && (
              <Badge size="sm" variant="light" color={category.color}>
                {category.name}
              </Badge>
            )}
          </Group>

          <Text size="lg" fw={700} style={{ color: 'var(--color-text-primary)' }}>
            {thread.title}
          </Text>

          <AuthorLine author={thread.author} timestamp={thread.created_at} edited={thread.edited_at} />

          <ForumMarkdown>{thread.body}</ForumMarkdown>

          <ReactionBar
            summary={reactions[`thread:${thread.id}`]}
            onToggle={(type) => onToggleReaction({ threadId: thread.id }, type)}
          />
        </Stack>
      </Card>

      <Divider
        label={`${thread.reply_count} ${thread.reply_count === 1 ? 'reply' : 'replies'}`}
        labelPosition="center"
      />

      {/* Replies */}
      <Stack gap="sm">
        {posts.map(post => (
          <PostCard
            key={post.id}
            post={post}
            quotedPost={post.parent_post_id ? postsById[post.parent_post_id] : null}
            isOwn={post.author_id === currentUserId}
            canModerate={canModerate}
            isLocked={thread.is_locked}
            reactionSummary={reactions[`post:${post.id}`]}
            isEditing={editingPostId === post.id}
            editBody={editBody}
            onEditBodyChange={setEditBody}
            onStartEdit={() => { setEditingPostId(post.id); setEditBody(post.body); }}
            onCancelEdit={() => setEditingPostId(null)}
            onSaveEdit={handleSaveEdit}
            onDelete={() => handleDeletePost(post.id)}
            onQuote={() => handleQuote(post)}
            onToggleReaction={(type) => onToggleReaction({ postId: post.id }, type)}
          />
        ))}
      </Stack>

      {/* Reply composer */}
      {thread.is_locked && !canModerate ? (
        <Card
          padding="md"
          radius="md"
          style={{ backgroundColor: 'var(--color-bg-secondary)', textAlign: 'center' }}
        >
          <Group justify="center" gap="xs">
            <Lock size={16} color="var(--color-text-muted)" />
            <Text size="sm" c="dimmed">This thread is locked. New replies are disabled.</Text>
          </Group>
        </Card>
      ) : (
        <Card padding="md" radius="md" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
          <Stack gap="sm">
            {quotedPost && (
              <Paper
                p="xs"
                style={{
                  backgroundColor: 'var(--color-bg-secondary)',
                  borderLeft: '3px solid var(--color-teal)',
                }}
              >
                <Group justify="space-between" wrap="nowrap">
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    Replying to {forumAuthorName(quotedPost.author)}
                  </Text>
                  <CloseButton size="xs" onClick={() => setQuotedPost(null)} aria-label="Remove quote" />
                </Group>
              </Paper>
            )}

            <Group justify="space-between">
              <Text size="sm" fw={500}>Reply</Text>
              <SegmentedControl
                size="xs"
                value={replyMode}
                onChange={setReplyMode}
                data={[
                  { value: 'write', label: 'Write' },
                  { value: 'preview', label: 'Preview' },
                ]}
              />
            </Group>

            {replyMode === 'write' ? (
              <Textarea
                placeholder="Add to the conversation… Markdown and @DisplayName mentions work."
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                minRows={3}
                autosize
                maxLength={20000}
                styles={{ input: { backgroundColor: 'var(--color-bg-secondary)' } }}
              />
            ) : (
              <Box
                p="sm"
                style={{
                  minHeight: 80,
                  backgroundColor: 'var(--color-bg-secondary)',
                  borderRadius: 4,
                }}
              >
                {replyBody.trim() ? (
                  <ForumMarkdown>{replyBody}</ForumMarkdown>
                ) : (
                  <Text size="sm" c="dimmed">Nothing to preview yet.</Text>
                )}
              </Box>
            )}

            <Group justify="flex-end">
              <Button
                size="sm"
                onClick={handleReply}
                loading={submitting}
                disabled={!replyBody.trim()}
                style={{ backgroundColor: 'var(--color-teal)', color: 'var(--color-bg)' }}
              >
                Post Reply
              </Button>
            </Group>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

function AuthorLine({ author, timestamp, edited }) {
  const name = forumAuthorName(author);
  return (
    <Group gap="xs">
      <Avatar size="sm" radius="xl" color="gray">
        {name.charAt(0).toUpperCase()}
      </Avatar>
      <Text size="sm" fw={500}>{name}</Text>
      <Text size="xs" c="dimmed">·</Text>
      <Text size="xs" c="dimmed">{timeAgo(timestamp)}</Text>
      {edited && (
        <Text size="xs" c="dimmed" fs="italic">(edited)</Text>
      )}
    </Group>
  );
}

function PostCard({
  post,
  quotedPost,
  isOwn,
  canModerate,
  isLocked,
  reactionSummary,
  isEditing,
  editBody,
  onEditBodyChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onQuote,
  onToggleReaction,
}) {
  return (
    <Card
      padding="md"
      radius="md"
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        border: `1px solid ${isOwn ? 'var(--color-teal)40' : 'var(--color-bg-secondary)'}`,
      }}
    >
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <AuthorLine author={post.author} timestamp={post.created_at} edited={post.edited_at} />

          <Group gap={4}>
            {!isLocked && (
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={onQuote}
                aria-label="Quote reply"
                title="Quote"
              >
                <Quotes size={14} />
              </ActionIcon>
            )}
            {(isOwn || canModerate) && (
              <Menu position="bottom-end" shadow="md">
                <Menu.Target>
                  <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Reply actions">
                    <DotsThreeVertical size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  {isOwn && (
                    <Menu.Item leftSection={<PencilSimple size={14} />} onClick={onStartEdit}>
                      Edit
                    </Menu.Item>
                  )}
                  <Menu.Item color="red" leftSection={<Trash size={14} />} onClick={onDelete}>
                    Delete
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
        </Group>

        {quotedPost && (
          <Paper
            p="xs"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              borderLeft: '3px solid var(--color-text-muted)',
            }}
          >
            <Text size="xs" c="dimmed" fw={500} mb={2}>
              {forumAuthorName(quotedPost.author)} wrote:
            </Text>
            <Text size="xs" c="dimmed" lineClamp={3} style={{ whiteSpace: 'pre-wrap' }}>
              {quotedPost.body}
            </Text>
          </Paper>
        )}

        {isEditing ? (
          <Stack gap="xs">
            <Textarea
              value={editBody}
              onChange={(e) => onEditBodyChange(e.target.value)}
              minRows={3}
              autosize
              maxLength={20000}
              styles={{ input: { backgroundColor: 'var(--color-bg-secondary)' } }}
            />
            <Group justify="flex-end" gap="xs">
              <Button size="xs" variant="subtle" onClick={onCancelEdit}>Cancel</Button>
              <Button
                size="xs"
                onClick={onSaveEdit}
                disabled={!editBody.trim()}
                style={{ backgroundColor: 'var(--color-teal)', color: 'var(--color-bg)' }}
              >
                Save
              </Button>
            </Group>
          </Stack>
        ) : (
          <ForumMarkdown>{post.body}</ForumMarkdown>
        )}

        <ReactionBar
          summary={reactionSummary}
          onToggle={onToggleReaction}
          size="xs"
        />
      </Stack>
    </Card>
  );
}

export default ThreadView;
