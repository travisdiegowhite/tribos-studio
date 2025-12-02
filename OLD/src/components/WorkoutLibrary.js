import React, { useState } from 'react';
import {
  Container,
  Title,
  Text,
  Stack,
  Button,
  Group,
  Badge,
  Card,
  Tabs,
  Grid,
  Alert,
  Anchor
} from '@mantine/core';
import { Book, TrendingUp, Target, ArrowRight, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import WorkoutSelector from './WorkoutSelector';
import { TRAINING_METHODOLOGIES } from '../data/workoutLibrary';

/**
 * Workout Library Browse Page
 * Displays all available workouts with filtering and selection
 */
const WorkoutLibrary = () => {
  const navigate = useNavigate();
  const [selectedWorkout, setSelectedWorkout] = useState(null);

  const handleWorkoutSelect = (workout) => {
    setSelectedWorkout(workout);
  };

  const handleGenerateRoute = () => {
    if (selectedWorkout) {
      // Navigate to AI Route Generator with workout pre-selected
      navigate(`/?workout=${selectedWorkout.id}`);
    }
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <div>
          <Group gap="sm" mb="sm">
            <Book size={32} style={{ color: 'var(--mantine-color-blue-6)' }} />
            <Title order={1}>Workout Library</Title>
          </Group>
          <Text size="lg" c="dimmed">
            40+ research-backed cycling workouts based on 2025 training science
          </Text>
        </div>

        {/* Quick Stats */}
        <Grid>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Card withBorder p="md" style={{ height: '100%' }}>
              <Stack gap="xs">
                <TrendingUp size={24} style={{ color: 'var(--mantine-color-blue-6)' }} />
                <Text size="sm" fw={600}>Science-Backed</Text>
                <Text size="xs" c="dimmed">
                  Based on 2024-2025 research from peer-reviewed studies and proven training methodologies
                </Text>
              </Stack>
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Card withBorder p="md" style={{ height: '100%' }}>
              <Stack gap="xs">
                <Target size={24} style={{ color: 'var(--mantine-color-green-6)' }} />
                <Text size="sm" fw={600}>4 Methodologies</Text>
                <Text size="xs" c="dimmed">
                  Polarized (80/20), Sweet Spot Base, Pyramidal, and Threshold-Focused training
                </Text>
              </Stack>
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Card withBorder p="md" style={{ height: '100%' }}>
              <Stack gap="xs">
                <Book size={24} style={{ color: 'var(--mantine-color-orange-6)' }} />
                <Text size="sm" fw={600}>40+ Workouts</Text>
                <Text size="xs" c="dimmed">
                  From beginner recovery rides to advanced VO2max intervals
                </Text>
              </Stack>
            </Card>
          </Grid.Col>
        </Grid>

        {/* Selected Workout CTA */}
        {selectedWorkout && (
          <Alert color="blue" variant="filled">
            <Group justify="space-between" align="center">
              <div>
                <Text size="sm" fw={600} c="white">
                  {selectedWorkout.name} selected
                </Text>
                <Text size="xs" c="white" opacity={0.9}>
                  {selectedWorkout.duration}min • {selectedWorkout.targetTSS} TSS • {selectedWorkout.difficulty}
                </Text>
              </div>
              <Button
                variant="white"
                color="blue"
                rightSection={<ArrowRight size={16} />}
                onClick={handleGenerateRoute}
              >
                Generate Route
              </Button>
            </Group>
          </Alert>
        )}

        {/* Tabs for different views */}
        <Tabs defaultValue="browse">
          <Tabs.List>
            <Tabs.Tab value="browse">Browse Workouts</Tabs.Tab>
            <Tabs.Tab value="methodologies">Training Methodologies</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="browse" pt="xl">
            <WorkoutSelector
              onWorkoutSelect={handleWorkoutSelect}
              selectedWorkoutId={selectedWorkout?.id}
              showFilters={true}
            />
          </Tabs.Panel>

          <Tabs.Panel value="methodologies" pt="xl">
            <Stack gap="xl">
              <Text size="sm" c="dimmed">
                Choose a training methodology that aligns with your goals and available time
              </Text>

              {Object.entries(TRAINING_METHODOLOGIES).map(([key, methodology]) => (
                <Card key={key} withBorder p="lg">
                  <Stack gap="md">
                    <div>
                      <Group justify="space-between" align="flex-start">
                        <div style={{ flex: 1 }}>
                          <Title order={3} mb="xs">{methodology.name}</Title>
                          <Text size="sm" c="dimmed">{methodology.description}</Text>
                        </div>
                        <Badge size="lg" variant="light">
                          {key.replace('_', ' ')}
                        </Badge>
                      </Group>
                    </div>

                    {/* Weekly Distribution */}
                    <div>
                      <Text size="sm" fw={600} mb="xs">Weekly Intensity Distribution</Text>
                      <Group gap="xs">
                        {Object.entries(methodology.weeklyDistribution).map(([zone, percent]) => (
                          <Badge key={zone} size="sm" variant="outline">
                            {zone.replace('_', ' ')}: {Math.round(percent * 100)}%
                          </Badge>
                        ))}
                      </Group>
                    </div>

                    {/* Best For */}
                    <div>
                      <Text size="sm" fw={600} mb="xs">Best For</Text>
                      <Group gap="xs">
                        {methodology.bestFor.map((item, idx) => (
                          <Badge key={idx} size="sm" color="blue" variant="light">
                            {item}
                          </Badge>
                        ))}
                      </Group>
                    </div>

                    {/* Research Basis */}
                    <div>
                      <Text size="sm" fw={600} mb="xs">Research Basis</Text>
                      <Text size="sm" c="dimmed">{methodology.researchBasis}</Text>
                    </div>

                    {/* Sample Week */}
                    {methodology.sampleWeek && (
                      <div>
                        <Text size="sm" fw={600} mb="xs">Sample Week</Text>
                        <Stack gap="xs">
                          {methodology.sampleWeek.map((day, idx) => (
                            <Group key={idx} justify="space-between">
                              <Text size="sm" c="dimmed" style={{ minWidth: '100px' }}>
                                {day.day}:
                              </Text>
                              <Text size="sm" style={{ flex: 1 }}>
                                {day.workout ? (day.workout.replace('_', ' ')) : 'Rest'}
                              </Text>
                            </Group>
                          ))}
                        </Stack>
                      </div>
                    )}
                  </Stack>
                </Card>
              ))}
            </Stack>
          </Tabs.Panel>
        </Tabs>

        {/* CTA Section */}
        <Card withBorder p="xl" style={{ backgroundColor: 'var(--mantine-color-blue-0)' }}>
          <Stack gap="md" align="center">
            <Title order={3} style={{ textAlign: 'center' }}>
              Ready to Start Training?
            </Title>
            <Text size="sm" c="dimmed" style={{ textAlign: 'center', maxWidth: '600px' }}>
              Select a workout above and we'll generate the perfect route to match it.
              AI-powered routing considers your target TSS, duration, and terrain preferences.
            </Text>
            <Button
              size="lg"
              leftSection={<Target size={20} />}
              onClick={() => navigate('/')}
            >
              Go to Smart Route Planner
            </Button>
          </Stack>
        </Card>

        {/* Research Link */}
        <Card withBorder p="md" style={{ backgroundColor: 'var(--mantine-color-blue-0)' }}>
          <Group justify="space-between" align="center">
            <Group gap="sm">
              <BookOpen size={24} style={{ color: 'var(--mantine-color-blue-6)' }} />
              <div>
                <Text size="sm" fw={600}>Want to learn about the science behind our training?</Text>
                <Text size="xs" c="dimmed">Read about our research-backed methodologies</Text>
              </div>
            </Group>
            <Anchor href="/training-research" size="sm" fw={600}>
              View Research →
            </Anchor>
          </Group>
        </Card>
      </Stack>
    </Container>
  );
};

export default WorkoutLibrary;
