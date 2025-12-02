import React from 'react';
import {
  Container,
  Title,
  Text,
  Stack,
  Paper,
  Group,
  ThemeIcon,
  Button,
  SimpleGrid,
  Card,
  Badge,
} from '@mantine/core';
import {
  Route,
  Upload,
  MapPin,
  Brain,
  TrendingUp,
  Zap,
  ArrowRight,
  Clock,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * NewUserDashboard - Streamlined dashboard for users with few or no rides
 * Focuses on getting users to value quickly: generate a route or import rides
 */
const NewUserDashboard = ({ displayName, rideCount = 0 }) => {
  const navigate = useNavigate();

  // Different content based on ride count
  const hasImportedRides = rideCount > 0;

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        {/* Welcome Header */}
        <div style={{ textAlign: 'center' }}>
          <Title order={1} mb="xs">
            {displayName ? `Welcome, ${displayName}!` : 'Welcome to Tribos'}
          </Title>
          <Text c="dimmed" size="lg">
            {hasImportedRides
              ? "You've got rides imported. Let's plan your next adventure."
              : "Let's get you started with AI-powered cycling routes."}
          </Text>
        </div>

        {/* Primary CTA - Generate Route */}
        <Paper
          p="xl"
          radius="lg"
          style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(6, 182, 212, 0.15) 100%)',
            border: '2px solid rgba(16, 185, 129, 0.4)',
          }}
        >
          <Group wrap="nowrap" gap="lg">
            <ThemeIcon
              size={80}
              radius="xl"
              variant="gradient"
              gradient={{ from: 'teal', to: 'cyan' }}
            >
              <Brain size={40} />
            </ThemeIcon>
            <Stack gap="xs" style={{ flex: 1 }}>
              <Text size="xl" fw={700}>Get Your First AI Route</Text>
              <Text c="dimmed">
                Tell us where you're starting and how long you have. Our AI will create
                the perfect cycling route for you.
              </Text>
              <Group mt="xs">
                <Button
                  size="lg"
                  variant="gradient"
                  gradient={{ from: 'teal', to: 'cyan' }}
                  rightSection={<ArrowRight size={18} />}
                  onClick={() => navigate('/ai-planner')}
                >
                  Generate a Route
                </Button>
                <Badge size="lg" color="teal" variant="light">
                  Takes 30 seconds
                </Badge>
              </Group>
            </Stack>
          </Group>
        </Paper>

        {/* Secondary options */}
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
          {/* Import Rides */}
          <Card
            p="lg"
            radius="md"
            withBorder
            style={{ cursor: 'pointer' }}
            onClick={() => navigate('/import')}
          >
            <Group wrap="nowrap" gap="md">
              <ThemeIcon size={50} radius="md" color="orange" variant="light">
                <Upload size={24} />
              </ThemeIcon>
              <div>
                <Text fw={600} mb={4}>Import Your Rides</Text>
                <Text size="sm" c="dimmed">
                  Connect Strava, Garmin, or upload FIT files to unlock personalized insights.
                </Text>
              </div>
            </Group>
          </Card>

          {/* Create Manual Route */}
          <Card
            p="lg"
            radius="md"
            withBorder
            style={{ cursor: 'pointer' }}
            onClick={() => navigate('/route-studio')}
          >
            <Group wrap="nowrap" gap="md">
              <ThemeIcon size={50} radius="md" color="blue" variant="light">
                <MapPin size={24} />
              </ThemeIcon>
              <div>
                <Text fw={600} mb={4}>Draw a Route</Text>
                <Text size="sm" c="dimmed">
                  Manually create a route by clicking points on the map.
                </Text>
              </div>
            </Group>
          </Card>
        </SimpleGrid>

        {/* What you'll unlock section */}
        <Paper p="lg" radius="md" withBorder>
          <Text fw={600} size="lg" mb="md">What you can do with Tribos:</Text>
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon size="md" color="teal" variant="light">
                <Route size={16} />
              </ThemeIcon>
              <Text size="sm">AI-generated routes tailored to your fitness</Text>
            </Group>
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon size="md" color="blue" variant="light">
                <TrendingUp size={16} />
              </ThemeIcon>
              <Text size="sm">Training load tracking and insights</Text>
            </Group>
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon size="md" color="violet" variant="light">
                <Zap size={16} />
              </ThemeIcon>
              <Text size="sm">Personalized training plans</Text>
            </Group>
          </SimpleGrid>
        </Paper>

        {/* Quick tips for new users */}
        {!hasImportedRides && (
          <Paper p="md" radius="md" bg="dark.7">
            <Group gap="sm">
              <ThemeIcon size="sm" color="yellow" variant="light">
                <Clock size={14} />
              </ThemeIcon>
              <Text size="sm" c="dimmed">
                <strong>Quick tip:</strong> Import your ride history to get personalized route
                suggestions based on your past performance.
              </Text>
            </Group>
          </Paper>
        )}
      </Stack>
    </Container>
  );
};

export default NewUserDashboard;
