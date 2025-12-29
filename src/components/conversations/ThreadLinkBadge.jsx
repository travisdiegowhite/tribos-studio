import { useState, useEffect } from 'react';
import { Badge, Tooltip, Group } from '@mantine/core';
import { IconChartLine, IconActivity, IconLink } from '@tabler/icons-react';
import { supabase } from '../../lib/supabase';

// Coach type configurations
const COACH_CONFIGS = {
  strategist: {
    color: 'blue',
    icon: IconChartLine,
    name: 'Training Strategist',
  },
  pulse: {
    color: 'orange',
    icon: IconActivity,
    name: 'Pulse',
  },
};

/**
 * ThreadLinkBadge - Displays clickable badges for linked conversation threads
 *
 * @param {Object} props
 * @param {string[]} props.threadIds - Array of linked thread UUIDs
 * @param {string} props.coachType - The coach type to display links for ('strategist' or 'pulse')
 * @param {function} props.onNavigate - Callback when a thread link is clicked
 */
function ThreadLinkBadge({ threadIds = [], coachType, onNavigate }) {
  const [linkedThreads, setLinkedThreads] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (threadIds && threadIds.length > 0) {
      loadLinkedThreads();
    }
  }, [threadIds]);

  const loadLinkedThreads = async () => {
    if (!threadIds || threadIds.length === 0) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('conversation_threads')
        .select('id, title, coach_type, message_count')
        .in('id', threadIds);

      if (!error && data) {
        // Filter to show only the specified coach type if provided
        const filtered = coachType
          ? data.filter(t => t.coach_type === coachType)
          : data;
        setLinkedThreads(filtered);
      }
    } catch (err) {
      console.log('Could not load linked threads:', err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading || linkedThreads.length === 0) {
    return null;
  }

  return (
    <Group gap={4}>
      {linkedThreads.map(thread => {
        const config = COACH_CONFIGS[thread.coach_type] || COACH_CONFIGS.pulse;
        const Icon = config.icon;

        return (
          <Tooltip
            key={thread.id}
            label={`View: ${thread.title} (${config.name})`}
            withArrow
          >
            <Badge
              size="xs"
              color={config.color}
              variant="dot"
              style={{ cursor: 'pointer' }}
              leftSection={<Icon size={10} />}
              onClick={(e) => {
                e.stopPropagation();
                if (onNavigate) {
                  onNavigate(thread);
                }
              }}
            >
              {thread.title.length > 15 ? thread.title.slice(0, 15) + '...' : thread.title}
            </Badge>
          </Tooltip>
        );
      })}
    </Group>
  );
}

/**
 * InlineThreadLink - Renders an inline clickable link to another thread
 * Used within message content to create cross-references
 *
 * @param {Object} props
 * @param {string} props.threadId - The thread UUID to link to
 * @param {string} props.title - Display title for the link
 * @param {string} props.coachType - Coach type ('strategist' or 'pulse')
 * @param {function} props.onNavigate - Callback when clicked
 */
export function InlineThreadLink({ threadId, title, coachType, onNavigate }) {
  const config = COACH_CONFIGS[coachType] || COACH_CONFIGS.pulse;
  const Icon = config.icon;

  return (
    <Badge
      size="sm"
      color={config.color}
      variant="light"
      style={{
        cursor: 'pointer',
        display: 'inline-flex',
        verticalAlign: 'middle',
        margin: '0 4px'
      }}
      leftSection={<Icon size={12} />}
      onClick={() => {
        if (onNavigate) {
          onNavigate({ id: threadId, title, coach_type: coachType });
        }
      }}
    >
      {title}
    </Badge>
  );
}

/**
 * parseThreadLinks - Parses message content for thread link syntax
 * Syntax: [[link:thread_id|Title]] or [[strategist:thread_id|Title]]
 *
 * @param {string} content - Message content to parse
 * @returns {Array} Array of parts (strings and link objects)
 */
export function parseThreadLinks(content) {
  if (!content) return [content];

  const linkPattern = /\[\[(link|strategist|pulse):([a-f0-9-]+)\|([^\]]+)\]\]/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = linkPattern.exec(content)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    // Add the link object
    const [, type, threadId, title] = match;
    const coachType = type === 'link' ? 'strategist' : type;
    parts.push({
      type: 'thread_link',
      threadId,
      title,
      coachType,
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [content];
}

/**
 * MessageContent - Renders message content with parsed thread links
 *
 * @param {Object} props
 * @param {string} props.content - Message content
 * @param {function} props.onNavigate - Callback for thread navigation
 */
export function MessageContent({ content, onNavigate }) {
  const parts = parseThreadLinks(content);

  return (
    <>
      {parts.map((part, index) => {
        if (typeof part === 'string') {
          return <span key={index}>{part}</span>;
        }

        if (part.type === 'thread_link') {
          return (
            <InlineThreadLink
              key={index}
              threadId={part.threadId}
              title={part.title}
              coachType={part.coachType}
              onNavigate={onNavigate}
            />
          );
        }

        return null;
      })}
    </>
  );
}

export default ThreadLinkBadge;
