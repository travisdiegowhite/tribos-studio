import { useState } from 'react';
import {
  Card,
  Stack,
  Title,
  Text,
  Button,
  Group,
  List,
  ThemeIcon,
  Badge,
  SimpleGrid,
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
import { TIERS } from '../../utils/featureAccess';

export default function PricingCards({ onUpgradeSuccess }) {
  const {
    tier: currentTier,
    createCheckoutSession,
    openCustomerPortal,
    isPro
  } = useSubscription();

  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);

  const handleUpgrade = async () => {
    try {
      setLoading('upgrade');
      setError(null);

      const { url } = await createCheckoutSession();

      if (url) {
        window.location.href = url;
      }
    } catch (err) {
      console.error('Upgrade error:', err);
      setError(err.message || 'Failed to start upgrade process');
    } finally {
      setLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    try {
      setLoading('manage');
      setError(null);

      const { url } = await openCustomerPortal();

      if (url) {
        window.location.href = url;
      }
    } catch (err) {
      console.error('Portal error:', err);
      setError(err.message || 'Failed to open billing portal');
    } finally {
      setLoading(null);
    }
  };

  const freeTier = TIERS.free;
  const proTier = TIERS.pro;

  return (
    <Stack gap="lg">
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

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
        {/* Free Tier */}
        <Card
          withBorder
          padding="lg"
          style={{
            opacity: currentTier === 'pro' ? 0.7 : 1,
            borderColor: currentTier === 'free' ? 'var(--mantine-color-blue-5)' : undefined
          }}
        >
          <Stack gap="md">
            <div>
              <Group justify="space-between">
                <Title order={4}>{freeTier.name}</Title>
                {currentTier === 'free' && (
                  <Badge color="blue" variant="light">Current Plan</Badge>
                )}
              </Group>
              <Text size="sm" c="dimmed" mt={4}>{freeTier.description}</Text>
            </div>

            <div>
              <Text size="xl" fw={700}>Free</Text>
              <Text size="xs" c="dimmed">Forever</Text>
            </div>

            <List
              spacing="xs"
              size="sm"
              icon={
                <ThemeIcon color="green" size={20} radius="xl">
                  <IconCheck size={14} />
                </ThemeIcon>
              }
            >
              {freeTier.features.map((feature, index) => (
                <List.Item key={index}>{feature}</List.Item>
              ))}
            </List>

            {freeTier.notIncluded && (
              <List
                spacing="xs"
                size="sm"
                icon={
                  <ThemeIcon color="gray" size={20} radius="xl" variant="light">
                    <IconX size={14} />
                  </ThemeIcon>
                }
              >
                {freeTier.notIncluded.map((feature, index) => (
                  <List.Item key={index} c="dimmed">{feature}</List.Item>
                ))}
              </List>
            )}

            <Button
              variant="light"
              disabled={currentTier === 'free'}
              fullWidth
            >
              {currentTier === 'free' ? 'Current Plan' : 'Downgrade'}
            </Button>
          </Stack>
        </Card>

        {/* Pro Tier */}
        <Card
          withBorder
          padding="lg"
          style={{
            borderColor: currentTier === 'pro' ? 'var(--mantine-color-yellow-5)' : 'var(--mantine-color-yellow-3)',
            borderWidth: 2
          }}
        >
          <Stack gap="md">
            <div>
              <Group justify="space-between">
                <Group gap="xs">
                  <IconCrown size={20} style={{ color: 'var(--mantine-color-yellow-5)' }} />
                  <Title order={4}>{proTier.name}</Title>
                </Group>
                {currentTier === 'pro' ? (
                  <Badge color="yellow" variant="filled">Current Plan</Badge>
                ) : (
                  <Badge color="yellow" variant="light">Recommended</Badge>
                )}
              </Group>
              <Text size="sm" c="dimmed" mt={4}>{proTier.description}</Text>
            </div>

            <div>
              <Group gap={4} align="baseline">
                <Text size="xl" fw={700}>${proTier.price}</Text>
                <Text size="sm" c="dimmed">/ month</Text>
              </Group>
            </div>

            <List
              spacing="xs"
              size="sm"
              icon={
                <ThemeIcon color="yellow" size={20} radius="xl">
                  <IconCheck size={14} />
                </ThemeIcon>
              }
            >
              {proTier.features.map((feature, index) => (
                <List.Item key={index}>{feature}</List.Item>
              ))}
            </List>

            {currentTier === 'pro' ? (
              <Button
                variant="light"
                color="yellow"
                onClick={handleManageSubscription}
                loading={loading === 'manage'}
                fullWidth
              >
                Manage Subscription
              </Button>
            ) : (
              <Button
                color="yellow"
                onClick={handleUpgrade}
                loading={loading === 'upgrade'}
                leftSection={loading !== 'upgrade' && <IconCrown size={18} />}
                fullWidth
              >
                Upgrade to Pro
              </Button>
            )}
          </Stack>
        </Card>
      </SimpleGrid>

      <Text size="xs" c="dimmed" ta="center">
        All plans include a 7-day free trial. Cancel anytime.
      </Text>
    </Stack>
  );
}
