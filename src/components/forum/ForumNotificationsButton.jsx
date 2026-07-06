/**
 * ForumNotificationsButton — bell with unread badge and a popover list
 * of recent forum notifications. Clicking one opens its thread.
 */

import { useState } from 'react';
import {
  ActionIcon,
  Indicator,
  Popover,
  Stack,
  Text,
  Group,
  Avatar,
  UnstyledButton,
  Button,
  Skeleton,
  Divider,
} from '@mantine/core';
import { Bell } from '@phosphor-icons/react';
import { timeAgo } from '../../utils/timeAgo';

const TYPE_TEXT = {
  reply: 'replied to your thread',
  quote: 'quoted your reply in',
  mention: 'mentioned you in',
};

function ForumNotificationsButton({
  notifications,
  unreadCount,
  loading,
  onOpenList,
  onMarkRead,
  onMarkAllRead,
  onOpenThread,
}) {
  const [opened, setOpened] = useState(false);

  const handleToggle = () => {
    const next = !opened;
    setOpened(next);
    if (next) onOpenList();
  };

  const handleClickNotification = (notification) => {
    if (!notification.read_at) onMarkRead(notification.id);
    setOpened(false);
    onOpenThread(notification.thread_id);
  };

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      width={340}
      shadow="md"
    >
      <Popover.Target>
        <Indicator
          disabled={unreadCount === 0}
          label={unreadCount > 9 ? '9+' : unreadCount}
          size={16}
          color="terracotta"
          offset={4}
        >
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            onClick={handleToggle}
            aria-label={`Notifications (${unreadCount} unread)`}
          >
            <Bell size={20} />
          </ActionIcon>
        </Indicator>
      </Popover.Target>

      <Popover.Dropdown p="xs" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
        <Group justify="space-between" px="xs" py={4}>
          <Text size="sm" fw={600}>Notifications</Text>
          {unreadCount > 0 && (
            <Button size="compact-xs" variant="subtle" color="gray" onClick={onMarkAllRead}>
              Mark all read
            </Button>
          )}
        </Group>
        <Divider mb={4} />

        {loading ? (
          <Stack gap="xs" p="xs">
            {[1, 2, 3].map(i => <Skeleton key={i} height={40} radius="sm" />)}
          </Stack>
        ) : notifications.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="md">
            No notifications yet. Reply activity and @mentions land here.
          </Text>
        ) : (
          <Stack gap={2} style={{ maxHeight: 360, overflowY: 'auto' }}>
            {notifications.map(notification => {
              const actorName =
                notification.actor?.community_display_name ||
                notification.actor?.display_name ||
                'Someone';
              return (
                <UnstyledButton
                  key={notification.id}
                  onClick={() => handleClickNotification(notification)}
                  p="xs"
                  style={{
                    borderRadius: 4,
                    backgroundColor: notification.read_at
                      ? 'transparent'
                      : 'var(--color-teal)15',
                  }}
                >
                  <Group gap="sm" wrap="nowrap" align="flex-start">
                    <Avatar size="sm" radius="xl" color="gray">
                      {actorName.charAt(0).toUpperCase()}
                    </Avatar>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text size="xs" lineClamp={2}>
                        <Text span fw={600} size="xs">{actorName}</Text>
                        {' '}{TYPE_TEXT[notification.type] || 'posted in'}{' '}
                        <Text span fw={600} size="xs">
                          {notification.thread?.title || 'a thread'}
                        </Text>
                      </Text>
                      <Text size="xs" c="dimmed">{timeAgo(notification.created_at)}</Text>
                    </div>
                  </Group>
                </UnstyledButton>
              );
            })}
          </Stack>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}

export default ForumNotificationsButton;
