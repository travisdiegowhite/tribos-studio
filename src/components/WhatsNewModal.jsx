import { useState, useEffect } from 'react';
import {
  Modal,
  Button,
  Group,
  Text,
  Stack,
  Paper,
  Title,
  ThemeIcon,
  Badge,
  Box,
  Divider,
} from '@mantine/core';
import {
  IconSparkles,
  IconArrowRight,
  IconX,
} from '@tabler/icons-react';
import { tokens } from '../theme';
import updatesData from '../data/updates.json';

// Get the latest update ID from updates data
const getLatestUpdateId = () => {
  if (!updatesData.updates || updatesData.updates.length === 0) {
    return null;
  }
  return updatesData.updates[0].id;
};

// Check if user has seen the latest updates
const hasSeenLatestUpdates = (userId) => {
  const latestId = getLatestUpdateId();
  if (!latestId) return true;

  const seenVersion = localStorage.getItem(`tribos_whats_new_${userId}`);
  return seenVersion === latestId;
};

// Mark updates as seen
const markUpdatesSeen = (userId) => {
  const latestId = getLatestUpdateId();
  if (latestId) {
    localStorage.setItem(`tribos_whats_new_${userId}`, latestId);
  }
};

function WhatsNewModal({ opened, onClose, userId }) {
  const updates = updatesData.updates || [];
  const comingSoon = updatesData.comingSoon || [];

  const handleClose = () => {
    if (userId) {
      markUpdatesSeen(userId);
    }
    onClose();
  };

  if (updates.length === 0) {
    return null;
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      size="md"
      title={
        <Group gap="sm">
          <ThemeIcon color="lime" variant="light" size="lg">
            <IconSparkles size={20} />
          </ThemeIcon>
          <Text fw={600} size="lg">What's New</Text>
        </Group>
      }
    >
      <Stack gap="md">
        <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
          {updatesData.welcome?.subtitle || 'Latest updates and improvements'}
        </Text>

        <Divider />

        {/* Recent Updates */}
        <Stack gap="sm">
          {updates.slice(0, 3).map((update) => (
            <Paper
              key={update.id}
              p="md"
              style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}
            >
              <Group justify="space-between" mb="xs">
                <Badge variant="light" color={update.type === 'new' ? 'lime' : 'blue'} size="sm">
                  {update.type === 'improvement' ? 'Improvement' : 'New'}
                </Badge>
                <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                  {update.date}
                </Text>
              </Group>
              <Text fw={500} size="sm" style={{ color: 'var(--tribos-text-primary)' }} mb="xs">
                {update.title}
              </Text>
              <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                {update.description}
              </Text>
              {update.details && update.details.length > 0 && (
                <Stack gap={4} mt="xs">
                  {update.details.slice(0, 3).map((detail, idx) => (
                    <Group key={idx} gap="xs" wrap="nowrap">
                      <IconArrowRight size={12} color={'var(--tribos-lime)'} style={{ flexShrink: 0 }} />
                      <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                        {detail}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              )}
            </Paper>
          ))}
        </Stack>

        {/* Coming Soon */}
        {comingSoon.length > 0 && (
          <>
            <Divider />
            <Box>
              <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} tt="uppercase" fw={500} mb="sm">
                Coming Soon
              </Text>
              <Group gap="xs">
                {comingSoon.map((item, idx) => (
                  <Badge key={idx} variant="outline" color="gray" size="sm">
                    {item.title}
                  </Badge>
                ))}
              </Group>
            </Box>
          </>
        )}

        <Divider />

        <Group justify="flex-end">
          <Button onClick={handleClose} color="lime">
            Got it!
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// Export helper functions for use in Dashboard
export { hasSeenLatestUpdates, markUpdatesSeen, getLatestUpdateId };
export default WhatsNewModal;
