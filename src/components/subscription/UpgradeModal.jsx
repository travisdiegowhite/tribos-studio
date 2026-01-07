import { useState } from 'react';
import {
  Modal,
  Stack,
  Title,
  Text,
  Button,
  Group,
  List,
  ThemeIcon,
  Badge,
  Paper,
  Loader,
  Alert
} from '@mantine/core';
import {
  IconCheck,
  IconX,
  IconCrown,
  IconAlertCircle
} from '@tabler/icons-react';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { TIERS, getFeatureGateMessage, getLimitReachedMessage } from '../../utils/featureAccess';

export default function UpgradeModal({
  opened,
  onClose,
  feature = null,
  limitName = null,
  limitMax = null
}) {
  const { createCheckoutSession, isPro } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleUpgrade = async () => {
    try {
      setLoading(true);
      setError(null);

      const { url } = await createCheckoutSession();

      if (url) {
        window.location.href = url;
      }
    } catch (err) {
      console.error('Upgrade error:', err);
      setError(err.message || 'Failed to start upgrade process');
    } finally {
      setLoading(false);
    }
  };

  // Don't show if already Pro
  if (isPro) {
    return null;
  }

  // Generate context message
  let contextMessage = null;
  if (feature) {
    contextMessage = getFeatureGateMessage(feature);
  } else if (limitName && limitMax !== null) {
    contextMessage = getLimitReachedMessage(limitName, limitMax);
  }

  const proTier = TIERS.pro;
  const freeTier = TIERS.free;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconCrown size={24} style={{ color: 'var(--mantine-color-yellow-5)' }} />
          <Title order={3}>Upgrade to Pro</Title>
        </Group>
      }
      size="lg"
      centered
    >
      <Stack gap="lg">
        {contextMessage && (
          <Alert
            icon={<IconAlertCircle size={18} />}
            color="blue"
            variant="light"
          >
            {contextMessage}
          </Alert>
        )}

        {error && (
          <Alert
            icon={<IconAlertCircle size={18} />}
            color="red"
            variant="light"
            onClose={() => setError(null)}
            withCloseButton
          >
            {error}
          </Alert>
        )}

        <Paper p="md" withBorder style={{ borderColor: 'var(--mantine-color-yellow-5)' }}>
          <Stack gap="sm">
            <Group justify="space-between" align="flex-start">
              <div>
                <Group gap="xs">
                  <Text fw={600} size="lg">{proTier.name}</Text>
                  <Badge color="yellow" variant="light">Recommended</Badge>
                </Group>
                <Text size="sm" c="dimmed">{proTier.description}</Text>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Text fw={700} size="xl">${proTier.price}</Text>
                <Text size="xs" c="dimmed">per month</Text>
              </div>
            </Group>

            <List
              spacing="xs"
              size="sm"
              icon={
                <ThemeIcon color="green" size={20} radius="xl">
                  <IconCheck size={14} />
                </ThemeIcon>
              }
            >
              {proTier.features.map((feature, index) => (
                <List.Item key={index}>{feature}</List.Item>
              ))}
            </List>
          </Stack>
        </Paper>

        <Paper p="md" withBorder style={{ opacity: 0.7 }}>
          <Stack gap="sm">
            <div>
              <Text fw={600}>{freeTier.name}</Text>
              <Text size="sm" c="dimmed">{freeTier.description}</Text>
            </div>

            <Group gap="xl">
              <List
                spacing="xs"
                size="sm"
                icon={
                  <ThemeIcon color="gray" size={20} radius="xl" variant="light">
                    <IconCheck size={14} />
                  </ThemeIcon>
                }
              >
                {freeTier.features.slice(0, 3).map((feature, index) => (
                  <List.Item key={index}>{feature}</List.Item>
                ))}
              </List>

              <List
                spacing="xs"
                size="sm"
                icon={
                  <ThemeIcon color="red" size={20} radius="xl" variant="light">
                    <IconX size={14} />
                  </ThemeIcon>
                }
              >
                {freeTier.notIncluded.slice(0, 3).map((feature, index) => (
                  <List.Item key={index} c="dimmed">{feature}</List.Item>
                ))}
              </List>
            </Group>
          </Stack>
        </Paper>

        <Group justify="space-between">
          <Button variant="subtle" onClick={onClose}>
            Maybe later
          </Button>
          <Button
            onClick={handleUpgrade}
            loading={loading}
            leftSection={loading ? null : <IconCrown size={18} />}
            color="yellow"
            variant="filled"
          >
            {loading ? 'Starting checkout...' : 'Upgrade to Pro'}
          </Button>
        </Group>

        <Text size="xs" c="dimmed" ta="center">
          Cancel anytime. No long-term commitment required.
        </Text>
      </Stack>
    </Modal>
  );
}
