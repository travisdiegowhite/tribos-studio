import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Stack,
  Title,
  Text,
  Paper,
  Anchor,
  Group,
  ThemeIcon,
  Alert
} from '@mantine/core';
import {
  IconArrowLeft,
  IconCheck,
  IconAlertCircle
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useAuth } from '../contexts/AuthContext';
import PricingCards from '../components/subscription/PricingCards';

export default function PricingPage() {
  const { isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Handle success/cancel redirects from Stripe
  useEffect(() => {
    const subscription = searchParams.get('subscription');

    if (subscription === 'success') {
      notifications.show({
        title: 'Welcome to Pro!',
        message: 'Your subscription is now active. Enjoy unlimited features!',
        color: 'green',
        icon: <IconCheck size={18} />
      });
      // Clear the query param
      navigate('/pricing', { replace: true });
    } else if (subscription === 'canceled') {
      notifications.show({
        title: 'Checkout canceled',
        message: 'No worries! You can upgrade anytime.',
        color: 'blue'
      });
      // Clear the query param
      navigate('/pricing', { replace: true });
    }
  }, [searchParams, navigate]);

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        <div>
          <Anchor
            component="button"
            onClick={() => navigate(-1)}
            c="dimmed"
            size="sm"
            mb="md"
          >
            <Group gap={4}>
              <IconArrowLeft size={16} />
              Back
            </Group>
          </Anchor>

          <Title order={1}>Choose Your Plan</Title>
          <Text c="dimmed" mt="xs">
            Unlock your full training potential with Tribos Pro
          </Text>
        </div>

        {!isAuthenticated && (
          <Alert
            icon={<IconAlertCircle size={18} />}
            color="blue"
            variant="light"
          >
            <Text size="sm">
              <Anchor href="/auth" inherit>Sign in</Anchor> or create an account to subscribe to a plan.
            </Text>
          </Alert>
        )}

        <PricingCards />

        <Paper p="lg" withBorder>
          <Stack gap="md">
            <Title order={4}>Frequently Asked Questions</Title>

            <div>
              <Text fw={500}>Can I cancel anytime?</Text>
              <Text size="sm" c="dimmed">
                Yes! You can cancel your subscription at any time. You'll continue to have access
                to Pro features until the end of your billing period.
              </Text>
            </div>

            <div>
              <Text fw={500}>What happens to my data if I cancel?</Text>
              <Text size="sm" c="dimmed">
                Your data is always yours. If you downgrade to Free, you'll still have access to
                your training history, routes, and plans. Some features like AI Coach will be
                limited, and older activity history may not be visible until you upgrade again.
              </Text>
            </div>

            <div>
              <Text fw={500}>Is there a free trial?</Text>
              <Text size="sm" c="dimmed">
                Yes! New Pro subscribers get a 7-day free trial. You won't be charged until the
                trial ends, and you can cancel anytime during the trial.
              </Text>
            </div>

            <div>
              <Text fw={500}>Can I switch plans?</Text>
              <Text size="sm" c="dimmed">
                You can upgrade or downgrade at any time. When you upgrade, you'll get immediate
                access to Pro features. When you downgrade, you'll keep Pro access until your
                current billing period ends.
              </Text>
            </div>
          </Stack>
        </Paper>

        <Text size="xs" c="dimmed" ta="center">
          Questions? Contact us at{' '}
          <Anchor href="mailto:support@tribos.studio" size="xs">
            support@tribos.studio
          </Anchor>
        </Text>
      </Stack>
    </Container>
  );
}
