import React, { useState, useEffect } from 'react';
import {
  Modal,
  Stack,
  Title,
  Text,
  Button,
  Group,
  Paper,
  ThemeIcon,
  SimpleGrid,
  Progress,
  Badge,
} from '@mantine/core';
import {
  TrendingUp,
  MapPin,
  Activity,
  Zap,
  Route,
  Calendar,
  ArrowRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';

/**
 * FirstInsightsModal - Shows quick insights after first Strava import
 * Provides immediate value by analyzing the user's imported rides
 */
const FirstInsightsModal = ({ opened, onClose, userId }) => {
  const navigate = useNavigate();
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (opened && userId) {
      fetchInsights();
    }
  }, [opened, userId]);

  const fetchInsights = async () => {
    try {
      setLoading(true);

      // Fetch recent rides (last 90 days)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const { data: rides, error } = await supabase
        .from('routes')
        .select('distance_km, duration_seconds, elevation_gain_m, recorded_at, average_speed, start_latitude, start_longitude')
        .eq('user_id', userId)
        .not('recorded_at', 'is', null)
        .gte('recorded_at', ninetyDaysAgo.toISOString())
        .order('recorded_at', { ascending: false });

      if (error) throw error;

      if (!rides || rides.length === 0) {
        setInsights(null);
        setLoading(false);
        return;
      }

      // Calculate insights
      const totalRides = rides.length;
      const totalDistance = rides.reduce((sum, r) => sum + (r.distance_km || 0), 0);
      const totalElevation = rides.reduce((sum, r) => sum + (r.elevation_gain_m || 0), 0);
      const avgDistance = totalDistance / totalRides;

      // Calculate weekly average
      const weeklyRides = totalRides / (90 / 7);
      const weeklyDistance = totalDistance / (90 / 7);

      // Determine form status (simplified)
      const recentRides = rides.slice(0, 7); // Last 7 rides
      const recentDistance = recentRides.reduce((sum, r) => sum + (r.distance_km || 0), 0);
      const avgRecentDistance = recentRides.length > 0 ? recentDistance / recentRides.length : 0;

      let formStatus = 'building';
      let formColor = 'yellow';
      if (avgRecentDistance > avgDistance * 1.1) {
        formStatus = 'peaking';
        formColor = 'green';
      } else if (avgRecentDistance < avgDistance * 0.8) {
        formStatus = 'recovering';
        formColor = 'blue';
      }

      // Find most common riding location (using start coordinates)
      const locationsWithCoords = rides.filter(r => r.start_latitude && r.start_longitude);
      let favoriteArea = 'your area';
      if (locationsWithCoords.length > 0) {
        // Just use presence of coordinates as indicator
        favoriteArea = 'your usual spots';
      }

      setInsights({
        totalRides,
        totalDistance: Math.round(totalDistance),
        totalElevation: Math.round(totalElevation),
        avgDistance: Math.round(avgDistance * 10) / 10,
        weeklyRides: Math.round(weeklyRides * 10) / 10,
        weeklyDistance: Math.round(weeklyDistance),
        formStatus,
        formColor,
        favoriteArea,
      });
    } catch (err) {
      console.error('Error fetching insights:', err);
      setInsights(null);
    } finally {
      setLoading(false);
    }
  };

  const handleGetRoute = () => {
    // Mark that user has seen first insights
    localStorage.setItem('tribos_first_insights_seen', 'true');
    onClose();
    navigate('/ai-planner');
  };

  const handleLater = () => {
    localStorage.setItem('tribos_first_insights_seen', 'true');
    onClose();
  };

  const getFormStatusMessage = (status) => {
    switch (status) {
      case 'peaking':
        return "You're riding strong! Your recent activity is above your average.";
      case 'recovering':
        return "Looks like you're taking it easy. A good time for a recovery ride.";
      default:
        return "You're maintaining a steady training rhythm.";
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={handleLater}
      title={null}
      size="lg"
      centered
      withCloseButton={false}
      overlayProps={{ backgroundOpacity: 0.6, blur: 3 }}
    >
      <Stack gap="lg" p="md">
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <ThemeIcon size={60} radius="xl" variant="gradient" gradient={{ from: 'teal', to: 'cyan' }} mb="md">
            <Activity size={30} />
          </ThemeIcon>
          <Title order={2} mb="xs">
            Welcome to Your Cycling Profile!
          </Title>
          <Text c="dimmed" size="lg">
            We've analyzed your rides. Here's what we found:
          </Text>
        </div>

        {loading ? (
          <Stack align="center" py="xl">
            <Progress value={100} animated size="sm" w="60%" />
            <Text c="dimmed" size="sm">Analyzing your rides...</Text>
          </Stack>
        ) : insights ? (
          <>
            {/* Key Stats */}
            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
              <Paper p="md" radius="md" withBorder style={{ textAlign: 'center' }}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={500}>Total Rides</Text>
                <Text size="xl" fw={700} c="teal">{insights.totalRides}</Text>
              </Paper>
              <Paper p="md" radius="md" withBorder style={{ textAlign: 'center' }}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={500}>Distance</Text>
                <Text size="xl" fw={700} c="teal">{insights.totalDistance} km</Text>
              </Paper>
              <Paper p="md" radius="md" withBorder style={{ textAlign: 'center' }}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={500}>Weekly Avg</Text>
                <Text size="xl" fw={700} c="teal">{insights.weeklyDistance} km</Text>
              </Paper>
              <Paper p="md" radius="md" withBorder style={{ textAlign: 'center' }}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={500}>Elevation</Text>
                <Text size="xl" fw={700} c="teal">{insights.totalElevation} m</Text>
              </Paper>
            </SimpleGrid>

            {/* Form Status */}
            <Paper p="lg" radius="md" withBorder>
              <Group>
                <ThemeIcon size="lg" color={insights.formColor} variant="light">
                  <Zap size={20} />
                </ThemeIcon>
                <div style={{ flex: 1 }}>
                  <Group gap="xs" mb={4}>
                    <Text fw={600}>Current Form:</Text>
                    <Badge color={insights.formColor} variant="light" size="lg">
                      {insights.formStatus.charAt(0).toUpperCase() + insights.formStatus.slice(1)}
                    </Badge>
                  </Group>
                  <Text size="sm" c="dimmed">
                    {getFormStatusMessage(insights.formStatus)}
                  </Text>
                </div>
              </Group>
            </Paper>

            {/* Quick Summary */}
            <Paper p="lg" radius="md" bg="dark.7">
              <Group gap="md">
                <ThemeIcon size="lg" color="cyan" variant="light">
                  <MapPin size={20} />
                </ThemeIcon>
                <div>
                  <Text fw={500}>You typically ride around {insights.favoriteArea}</Text>
                  <Text size="sm" c="dimmed">
                    Averaging {insights.avgDistance} km per ride, {insights.weeklyRides.toFixed(1)} rides per week
                  </Text>
                </div>
              </Group>
            </Paper>

            {/* CTA */}
            <Paper p="lg" radius="md" style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(6, 182, 212, 0.1) 100%)',
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}>
              <Group justify="space-between" align="center">
                <div>
                  <Group gap="xs" mb={4}>
                    <Route size={20} color="#10b981" />
                    <Text fw={600}>Ready for your next ride?</Text>
                  </Group>
                  <Text size="sm" c="dimmed">
                    Get an AI-powered route matched to your current fitness level
                  </Text>
                </div>
                <Button
                  variant="gradient"
                  gradient={{ from: 'teal', to: 'cyan' }}
                  size="md"
                  rightSection={<ArrowRight size={16} />}
                  onClick={handleGetRoute}
                >
                  Get a Route
                </Button>
              </Group>
            </Paper>
          </>
        ) : (
          <Paper p="lg" radius="md" withBorder style={{ textAlign: 'center' }}>
            <Calendar size={40} color="#868e96" style={{ marginBottom: 16 }} />
            <Text fw={500} mb="xs">No Recent Rides Found</Text>
            <Text size="sm" c="dimmed" mb="md">
              Import more rides to see your personalized insights.
            </Text>
            <Button variant="light" onClick={handleLater}>
              Continue to Dashboard
            </Button>
          </Paper>
        )}

        {/* Footer actions */}
        {insights && (
          <Group justify="center">
            <Button variant="subtle" c="dimmed" onClick={handleLater}>
              Explore on my own
            </Button>
          </Group>
        )}
      </Stack>
    </Modal>
  );
};

export default FirstInsightsModal;
