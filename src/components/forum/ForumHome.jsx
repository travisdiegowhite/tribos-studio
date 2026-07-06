/**
 * ForumHome — the community forum: board chips, sort tabs, search,
 * paginated thread list, thread view, composer, and notifications.
 *
 * Thread deep-links use the ?thread=<id> query param so notification
 * clicks and shared URLs open the right thread.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Stack,
  Group,
  Button,
  TextInput,
  SegmentedControl,
  Badge,
  Text,
  Card,
  Box,
  CloseButton,
  ScrollArea,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications as mantineNotifications } from '@mantine/notifications';
import { MagnifyingGlass, Plus } from '@phosphor-icons/react';
import { useForum } from '../../hooks/useForum';
import { useForumNotifications } from '../../hooks/useForumNotifications';
import { trackFeature, trackInteraction, EventType } from '../../utils/activityTracking';
import ThreadList from './ThreadList';
import ThreadView from './ThreadView';
import ThreadComposerModal from './ThreadComposerModal';
import ForumNotificationsButton from './ForumNotificationsButton';
import { timeAgo } from '../../utils/timeAgo';

const SORT_OPTIONS = [
  { value: 'latest', label: 'Latest' },
  { value: 'top', label: 'Top' },
  { value: 'new', label: 'New' },
  { value: 'unanswered', label: 'Unanswered' },
];

function ForumHome({ userId }) {
  const forum = useForum({ userId });
  const forumNotifications = useForumNotifications({ userId });

  const [searchParams, setSearchParams] = useSearchParams();
  const activeThreadId = searchParams.get('thread');

  const [categoryId, setCategoryId] = useState(null);
  const [sort, setSort] = useState('latest');
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState(null); // null = not searching
  const [searchLoading, setSearchLoading] = useState(false);
  const [composerOpened, { open: openComposer, close: closeComposer }] = useDisclosure(false);
  const [editingThread, setEditingThread] = useState(null);

  const categoriesById = useMemo(
    () => Object.fromEntries(forum.categories.map(c => [c.id, c])),
    [forum.categories]
  );

  // Load the thread list whenever filters change (and when not in a thread)
  useEffect(() => {
    if (!activeThreadId) {
      forum.loadThreads({ categoryId, sort, page });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, sort, page, activeThreadId, forum.loadThreads]);

  // Load the active thread from the URL param
  useEffect(() => {
    if (activeThreadId) {
      forum.loadThread(activeThreadId);
    } else {
      forum.clearActiveThread();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId, forum.loadThread, forum.clearActiveThread]);

  const openThread = useCallback((threadId) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('thread', threadId);
      return next;
    });
  }, [setSearchParams]);

  const closeThread = useCallback(() => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('thread');
      return next;
    });
  }, [setSearchParams]);

  const handleSearch = async () => {
    const query = searchInput.trim();
    if (query.length < 2) return;

    setSearchLoading(true);
    try {
      const results = await forum.searchForum(query);
      setSearchResults(results);
    } finally {
      setSearchLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearchResults(null);
  };

  const handleCreateThread = async (data) => {
    const created = await forum.createThread(data);
    if (created) {
      trackFeature(EventType.DISCUSSION_CREATE, { forum: true, categoryId: data.category_id });
      mantineNotifications.show({
        title: 'Thread posted',
        message: 'Your thread is live in the forum.',
        color: 'sage',
      });
      openThread(created.id);
      return true;
    }
    return false;
  };

  const handleEditThread = async (data) => {
    if (!editingThread) return false;
    const ok = await forum.updateThread(editingThread.id, data);
    if (ok) {
      mantineNotifications.show({ title: 'Thread updated', message: 'Your changes are saved.', color: 'sage' });
      setEditingThread(null);
      return true;
    }
    return false;
  };

  const handleCreatePost = async (threadId, body, parentPostId) => {
    const created = await forum.createPost(threadId, body, parentPostId);
    if (created) {
      trackInteraction(EventType.DISCUSSION_REPLY, { forum: true, threadId });
    }
    return created;
  };

  // ----- Thread view -----
  if (activeThreadId) {
    return (
      <>
        <ThreadView
          thread={forum.activeThread}
          posts={forum.posts}
          reactions={forum.reactions}
          category={forum.activeThread ? categoriesById[forum.activeThread.category_id] : null}
          currentUserId={userId}
          isModerator={forum.isModerator}
          loading={forum.threadLoading}
          onBack={closeThread}
          onCreatePost={handleCreatePost}
          onUpdatePost={forum.updatePost}
          onDeletePost={forum.deletePost}
          onEditThread={() => setEditingThread(forum.activeThread)}
          onDeleteThread={forum.deleteThread}
          onToggleReaction={forum.toggleReaction}
          onSetThreadFlags={forum.setThreadFlags}
        />

        <ThreadComposerModal
          opened={!!editingThread}
          onClose={() => setEditingThread(null)}
          categories={forum.categories}
          onSubmit={handleEditThread}
          initialThread={editingThread}
        />
      </>
    );
  }

  // ----- List / search view -----
  return (
    <Stack gap="md">
      {/* Toolbar: search, notifications, new thread */}
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <TextInput
          placeholder="Search the forum…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          leftSection={<MagnifyingGlass size={16} />}
          rightSection={
            (searchInput || searchResults) && (
              <CloseButton size="sm" onClick={clearSearch} aria-label="Clear search" />
            )
          }
          style={{ flex: 1, maxWidth: 420 }}
          styles={{ input: { backgroundColor: 'var(--color-bg-secondary)' } }}
        />

        <Group gap="xs" wrap="nowrap">
          <ForumNotificationsButton
            notifications={forumNotifications.notifications}
            unreadCount={forumNotifications.unreadCount}
            loading={forumNotifications.loading}
            onOpenList={forumNotifications.loadNotifications}
            onMarkRead={forumNotifications.markRead}
            onMarkAllRead={forumNotifications.markAllRead}
            onOpenThread={openThread}
          />
          <Button
            size="sm"
            leftSection={<Plus size={16} />}
            onClick={openComposer}
            style={{ backgroundColor: 'var(--color-teal)', color: 'var(--color-bg)' }}
          >
            New Thread
          </Button>
        </Group>
      </Group>

      {searchResults !== null ? (
        <SearchResults
          results={searchResults}
          loading={searchLoading}
          categoriesById={categoriesById}
          onSelect={(threadId) => { clearSearch(); openThread(threadId); }}
          onClear={clearSearch}
        />
      ) : (
        <>
          {/* Board chips */}
          <ScrollArea type="never">
            <Group gap="xs" wrap="nowrap">
              <BoardChip
                label="All"
                active={!categoryId}
                onClick={() => { setCategoryId(null); setPage(0); }}
              />
              {forum.categories.map(category => (
                <BoardChip
                  key={category.id}
                  label={category.name}
                  color={category.color}
                  count={category.thread_count}
                  active={categoryId === category.id}
                  onClick={() => { setCategoryId(category.id); setPage(0); }}
                />
              ))}
            </Group>
          </ScrollArea>

          {/* Board description + sort */}
          <Group justify="space-between" align="center">
            <Text size="xs" c="dimmed">
              {categoryId
                ? categoriesById[categoryId]?.description
                : 'All boards — the whole tribos community'}
            </Text>
            <SegmentedControl
              size="xs"
              value={sort}
              onChange={(value) => { setSort(value); setPage(0); }}
              data={SORT_OPTIONS}
              styles={{ root: { backgroundColor: 'var(--color-bg-secondary)' } }}
            />
          </Group>

          <ThreadList
            threads={forum.threads}
            categoriesById={categoriesById}
            total={forum.threadTotal}
            page={page}
            onPageChange={setPage}
            loading={forum.loading}
            onSelectThread={(thread) => openThread(thread.id)}
            emptyMessage={
              sort === 'unanswered'
                ? 'Nothing unanswered right now. Nice work, community.'
                : 'No threads here yet. Start the first conversation.'
            }
          />
        </>
      )}

      <ThreadComposerModal
        opened={composerOpened}
        onClose={closeComposer}
        categories={forum.categories}
        onSubmit={handleCreateThread}
      />
    </Stack>
  );
}

function BoardChip({ label, color = 'gray', count, active, onClick }) {
  return (
    <Badge
      variant={active ? 'filled' : 'light'}
      color={active ? 'teal' : color}
      size="lg"
      radius="sm"
      style={{ cursor: 'pointer', textTransform: 'none', flexShrink: 0 }}
      onClick={onClick}
    >
      {label}{typeof count === 'number' && count > 0 ? ` · ${count}` : ''}
    </Badge>
  );
}

function SearchResults({ results, loading, categoriesById, onSelect, onClear }) {
  if (loading) {
    return <Text size="sm" c="dimmed" ta="center" py="md">Searching…</Text>;
  }

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text size="sm" fw={500}>
          {results.length === 0 ? 'No results' : `${results.length} result${results.length === 1 ? '' : 's'}`}
        </Text>
        <Button size="compact-xs" variant="subtle" color="gray" onClick={onClear}>
          Back to threads
        </Button>
      </Group>

      {results.map(result => {
        const category = categoriesById[result.category_id];
        return (
          <Card
            key={result.thread_id}
            padding="sm"
            radius="md"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              cursor: 'pointer',
            }}
            onClick={() => onSelect(result.thread_id)}
            className="tribos-discussion-item"
          >
            <Group gap="xs" mb={4}>
              {category && (
                <Badge size="xs" variant="light" color={category.color}>{category.name}</Badge>
              )}
              {result.matched_in === 'reply' && (
                <Badge size="xs" variant="light" color="gray">matched in a reply</Badge>
              )}
            </Group>
            <Text size="sm" fw={500} lineClamp={1} style={{ color: 'var(--color-text-primary)' }}>
              {result.title}
            </Text>
            {/* snippet comes from ts_headline with <b> highlight tags */}
            <Box
              mt={4}
              style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}
              dangerouslySetInnerHTML={{ __html: sanitizeSnippet(result.snippet) }}
            />
            <Group gap="xs" mt={4}>
              <Text size="xs" c="dimmed">{result.reply_count} replies</Text>
              <Text size="xs" c="dimmed">·</Text>
              <Text size="xs" c="dimmed">{timeAgo(result.last_activity_at)}</Text>
            </Group>
          </Card>
        );
      })}
    </Stack>
  );
}

// ts_headline output is plain text plus <b>…</b> markers. Escape everything,
// then restore only the <b> tags so user content can't inject markup.
function sanitizeSnippet(snippet) {
  if (!snippet) return '';
  const escaped = snippet
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .replace(/&lt;b&gt;/g, '<b>')
    .replace(/&lt;\/b&gt;/g, '</b>');
}

export default ForumHome;
