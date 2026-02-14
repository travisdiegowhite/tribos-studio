import { useState, useEffect, useCallback } from 'react';
import {
  Stack,
  Paper,
  Group,
  Text,
  Badge,
  ActionIcon,
  Collapse,
  Box,
  Loader,
  ScrollArea,
  Divider,
  Tooltip,
  SegmentedControl,
} from '@mantine/core';
import {
  IconChevronDown,
  IconChevronRight,
  IconChartLine,
  IconActivity,
  IconArchive,
  IconPlus,
} from '@tabler/icons-react';
import { tokens } from '../../theme';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext.jsx';
import ThreadLinkBadge from './ThreadLinkBadge';

// Coach type configurations
const COACH_CONFIGS = {
  strategist: {
    color: 'teal',
    icon: IconChartLine,
    name: 'Training Strategist',
    primary: '#7BA9A0',
  },
  pulse: {
    color: 'terracotta',
    icon: IconActivity,
    name: 'Pulse',
    primary: '#C4785C',
  },
};

/**
 * ConversationThreadList - Displays collapsible conversation threads
 *
 * @param {Object} props
 * @param {string} props.coachType - Filter threads by coach type ('strategist', 'pulse', or 'all')
 * @param {function} props.onThreadSelect - Callback when a thread is selected
 * @param {function} props.onNewThread - Callback to start a new thread
 * @param {string} props.activeThreadId - Currently active thread ID
 * @param {number} props.maxHeight - Maximum height for scroll area
 */
function ConversationThreadList({
  coachType = 'all',
  onThreadSelect,
  onNewThread,
  activeThreadId,
  maxHeight = 400,
}) {
  const { user } = useAuth();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedThreads, setExpandedThreads] = useState({});
  const [threadMessages, setThreadMessages] = useState({});
  const [filter, setFilter] = useState(coachType);

  // Load threads
  const loadThreads = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      let query = supabase
        .from('conversation_threads')
        .select('*')
        .eq('user_id', user.id)
        .order('last_message_at', { ascending: false })
        .limit(30);

      if (filter !== 'all') {
        query = query.eq('coach_type', filter);
      }

      const { data, error } = await query;

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.log('conversation_threads table not yet available');
          return;
        }
        throw error;
      }

      if (data) {
        setThreads(data);

        // Auto-expand active thread
        if (activeThreadId) {
          setExpandedThreads(prev => ({ ...prev, [activeThreadId]: true }));
        }
      }
    } catch (err) {
      console.error('Error loading threads:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, filter, activeThreadId]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  // Load messages for a specific thread
  const loadThreadMessages = async (threadId) => {
    if (threadMessages[threadId]) return; // Already loaded

    try {
      const { data, error } = await supabase
        .from('coach_conversations')
        .select('id, role, message, timestamp')
        .eq('thread_id', threadId)
        .order('timestamp', { ascending: true })
        .limit(20);

      if (!error && data) {
        setThreadMessages(prev => ({ ...prev, [threadId]: data }));
      }
    } catch (err) {
      console.error('Error loading thread messages:', err);
    }
  };

  // Toggle thread expansion
  const toggleThread = async (threadId) => {
    const newExpanded = !expandedThreads[threadId];
    setExpandedThreads(prev => ({ ...prev, [threadId]: newExpanded }));

    if (newExpanded) {
      await loadThreadMessages(threadId);
    }
  };

  // Format timestamp for display
  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Group threads by date
  const groupedThreads = threads.reduce((groups, thread) => {
    const date = formatDate(thread.last_message_at);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(thread);
    return groups;
  }, {});

  if (loading) {
    return (
      <Box style={{ padding: tokens.spacing.md, textAlign: 'center' }}>
        <Loader size="sm" color="gray" />
      </Box>
    );
  }

  return (
    <Stack gap="sm">
      {/* Filter */}
      {coachType === 'all' && (
        <SegmentedControl
          size="xs"
          value={filter}
          onChange={setFilter}
          data={[
            { label: 'All', value: 'all' },
            {
              label: (
                <Group gap={4}>
                  <IconChartLine size={12} />
                  <span>Strategist</span>
                </Group>
              ),
              value: 'strategist'
            },
            {
              label: (
                <Group gap={4}>
                  <IconActivity size={12} />
                  <span>Pulse</span>
                </Group>
              ),
              value: 'pulse'
            },
          ]}
        />
      )}

      {/* New Thread Button */}
      {onNewThread && (
        <Paper
          p="xs"
          style={{
            backgroundColor: 'var(--tribos-bg-tertiary)',
            cursor: 'pointer',
            border: `1px dashed ${'var(--tribos-text-muted)'}`,
          }}
          onClick={onNewThread}
        >
          <Group gap="xs" justify="center">
            <IconPlus size={14} style={{ color: 'var(--tribos-text-muted)' }} />
            <Text size="sm" c="dimmed">New Conversation</Text>
          </Group>
        </Paper>
      )}

      {/* Thread List */}
      <ScrollArea style={{ maxHeight }}>
        <Stack gap="xs">
          {Object.entries(groupedThreads).map(([date, dateThreads]) => (
            <Box key={date}>
              <Text size="xs" c="dimmed" mb="xs" tt="uppercase" fw={500}>
                {date}
              </Text>

              {dateThreads.map(thread => {
                const config = COACH_CONFIGS[thread.coach_type] || COACH_CONFIGS.pulse;
                const Icon = config.icon;
                const isActive = thread.id === activeThreadId;
                const isExpanded = expandedThreads[thread.id];

                return (
                  <Paper
                    key={thread.id}
                    p="sm"
                    mb="xs"
                    style={{
                      backgroundColor: isActive
                        ? `${config.primary}15`
                        : 'var(--tribos-bg-tertiary)',
                      cursor: 'pointer',
                      border: isActive
                        ? `1px solid ${config.primary}`
                        : `1px solid transparent`,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {/* Thread Header */}
                    <Group
                      justify="space-between"
                      wrap="nowrap"
                      onClick={() => {
                        toggleThread(thread.id);
                        if (onThreadSelect) onThreadSelect(thread);
                      }}
                    >
                      <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                        <ActionIcon
                          size="xs"
                          variant="subtle"
                          color={config.color}
                        >
                          {isExpanded ? (
                            <IconChevronDown size={14} />
                          ) : (
                            <IconChevronRight size={14} />
                          )}
                        </ActionIcon>

                        <Icon size={16} style={{ color: config.primary, flexShrink: 0 }} />

                        <Text
                          size="sm"
                          fw={isActive ? 600 : 500}
                          style={{
                            color: 'var(--tribos-text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {thread.title}
                        </Text>
                      </Group>

                      <Group gap="xs" wrap="nowrap">
                        {thread.status === 'archived' && (
                          <Tooltip label="Archived">
                            <IconArchive size={12} style={{ color: 'var(--tribos-text-muted)' }} />
                          </Tooltip>
                        )}

                        <Badge size="xs" color={config.color} variant="light">
                          {thread.message_count}
                        </Badge>
                      </Group>
                    </Group>

                    {/* Thread Summary */}
                    {thread.summary && !isExpanded && (
                      <Text size="xs" c="dimmed" mt="xs" lineClamp={1} pl="xl">
                        {thread.summary}
                      </Text>
                    )}

                    {/* Linked Threads */}
                    {thread.linked_thread_ids?.length > 0 && (
                      <Box mt="xs" pl="xl">
                        <ThreadLinkBadge
                          threadIds={thread.linked_thread_ids}
                          onNavigate={onThreadSelect}
                        />
                      </Box>
                    )}

                    {/* Expanded Messages Preview */}
                    <Collapse in={isExpanded}>
                      <Divider my="xs" />
                      <Stack gap="xs" pl="xl">
                        {threadMessages[thread.id] ? (
                          threadMessages[thread.id].slice(-3).map((msg, idx) => (
                            <Box key={msg.id || idx}>
                              <Text size="xs" c="dimmed">
                                {msg.role === 'coach' ? config.name : 'You'}
                              </Text>
                              <Text size="xs" lineClamp={2}>
                                {msg.message}
                              </Text>
                            </Box>
                          ))
                        ) : (
                          <Loader size="xs" color="gray" />
                        )}

                        {threadMessages[thread.id]?.length > 3 && (
                          <Text size="xs" c="dimmed" fs="italic">
                            +{threadMessages[thread.id].length - 3} more messages
                          </Text>
                        )}
                      </Stack>
                    </Collapse>
                  </Paper>
                );
              })}
            </Box>
          ))}

          {threads.length === 0 && (
            <Box style={{ textAlign: 'center', padding: tokens.spacing.lg }}>
              <Text size="sm" c="dimmed">
                No conversations yet
              </Text>
              <Text size="xs" c="dimmed" mt="xs">
                Start chatting with your AI coaches!
              </Text>
            </Box>
          )}
        </Stack>
      </ScrollArea>
    </Stack>
  );
}

export default ConversationThreadList;
