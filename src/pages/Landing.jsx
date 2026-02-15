import { Link } from 'react-router-dom';
import {
  Container,
  Title,
  Text,
  Button,
  Stack,
  Group,
  Box,
  Grid,
  ThemeIcon,
  Paper,
  Divider,
  Center,
  Anchor,
  Badge,
  SimpleGrid,
  SegmentedControl,
  Textarea,
  TextInput,
  ActionIcon,
} from '@mantine/core';
import {
  IconRoute,
  IconCheck,
  IconChevronRight,
  IconTrendingUp,
  IconMapPin,
  IconHeart,
  IconUpload,
  IconActivity,
  IconDeviceWatch,
  IconMessageChatbot,
  IconCalendarEvent,
  IconMap2,
  IconSparkles,
  IconRuler,
  IconMountain,
  IconClock,
  IconSend,
  IconUser,
  IconRobot,
  IconCalendarPlus,
  IconDownload,
} from '@tabler/icons-react';
import SEO, { getOrganizationSchema, getWebSiteSchema } from '../components/SEO';

function Landing() {

  return (
    <>
      <SEO
        title="tribos.studio - Cycling Route Builder, AI Coach & Training Platform"
        description="Build smarter cycling routes with AI, get personalized coaching from your ride history, and follow structured training plans. Syncs with Strava, Garmin, and Wahoo."
        keywords="cycling route builder, cycling route planner, AI cycling coach, cycling training platform, bike route builder, cycling training plans, strava route builder, garmin route sync, cycling analytics, cycling power analysis"
        url="https://tribos.studio"
        image="https://tribos.studio/og-image.svg"
        structuredData={{
          '@context': 'https://schema.org',
          '@graph': [getOrganizationSchema(), getWebSiteSchema()],
        }}
      />
      <Box
        style={{
          background: `radial-gradient(ellipse at top, rgba(158, 90, 60, 0.1) 0%, transparent 50%),
                       linear-gradient(180deg, ${'var(--tribos-bg-primary)'} 0%, ${'var(--tribos-bg-secondary)'} 100%)`,
          minHeight: '100vh',
        }}
      >
      {/* Header */}
      <Box py="md" px={{ base: 'md', md: 'xl' }}>
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <IconRoute size={24} color={'var(--tribos-terracotta-500)'} />
            <Text
              fw={700}
              size="lg"
              style={{
                color: 'var(--tribos-terracotta-500)',
                letterSpacing: '-0.02em',
              }}
            >
              tribos.studio
            </Text>
          </Group>
          <Button
            component={Link}
            to="/auth"
            variant="subtle"
            color="gray"
          >
            Sign In
          </Button>
        </Group>
      </Box>

      {/* HERO SECTION */}
      <Box py={{ base: 60, md: 100 }} px={{ base: 'md', md: 'xl' }}>
        <Container size="md">
          <Stack gap="lg" align="center" ta="center">
            <Badge color="terracotta" variant="light" size="lg">
              Now in Private Beta
            </Badge>

            <Title
              order={1}
              style={{
                fontSize: 'clamp(2.2rem, 5vw, 3.5rem)',
                color: 'var(--tribos-text-primary)',
                lineHeight: 1.1,
              }}
            >
              Build Routes.{' '}
              <span
                style={{
                  background: `linear-gradient(135deg, ${'var(--tribos-terracotta-500)'} 0%, #22d3ee 100%)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Train with AI.
              </span>
              {' '}Ride Smarter.
            </Title>

            <Text size="xl" style={{ color: 'var(--tribos-text-secondary)', maxWidth: 600 }}>
              A cycling route builder and training platform that learns from your ride history. Plan routes, get AI coaching, and follow structured training plans—all in one place.
            </Text>

            <Stack gap="xs" align="center">
              <Button
                component={Link}
                to="/auth"
                size="lg"
                color="terracotta"
                rightSection={<IconChevronRight size={18} />}
              >
                Create Free Account
              </Button>
              <Group gap="lg">
                <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                  <IconCheck size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> Free access
                </Text>
                <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                  <IconCheck size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> No credit card
                </Text>
              </Group>
            </Stack>
          </Stack>
        </Container>
      </Box>

      {/* WHAT IS TRIBOS - Quick Explainer for Cold Traffic */}
      <Box py={{ base: 40, md: 60 }} px={{ base: 'md', md: 'xl' }} style={{ backgroundColor: `${'var(--tribos-bg-secondary)'}50` }}>
        <Container size="md">
          <Stack align="center" gap="xl">
            <Title order={2} size={28} ta="center" style={{ color: 'var(--tribos-text-primary)' }}>
              One Platform for Your Entire Ride
            </Title>
            <Text size="lg" ta="center" style={{ color: 'var(--tribos-text-secondary)', maxWidth: 600 }}>
              tribos.studio connects your Strava, Garmin, and Wahoo data to give you a complete cycling platform—from planning your route to analyzing your performance.
            </Text>

            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg">
              <Paper p="md" style={{ backgroundColor: 'rgba(158, 90, 60, 0.1)', border: '1px solid rgba(158, 90, 60, 0.2)', textAlign: 'center' }}>
                <ThemeIcon size={40} radius="xl" color="sage" variant="light" mx="auto" mb="sm">
                  <IconMap2 size={20} />
                </ThemeIcon>
                <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }} mb={4}>
                  Plan the Ride
                </Text>
                <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                  Build routes manually or let AI generate one based on your fitness, distance, and terrain preferences.
                </Text>
              </Paper>
              <Paper p="md" style={{ backgroundColor: 'rgba(158, 90, 60, 0.1)', border: '1px solid rgba(158, 90, 60, 0.2)', textAlign: 'center' }}>
                <ThemeIcon size={40} radius="xl" color="terracotta" variant="light" mx="auto" mb="sm">
                  <IconMessageChatbot size={20} />
                </ThemeIcon>
                <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }} mb={4}>
                  Train with AI
                </Text>
                <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                  An AI coach that knows your ride history, training load, and recovery to recommend what you actually need today.
                </Text>
              </Paper>
              <Paper p="md" style={{ backgroundColor: 'rgba(158, 90, 60, 0.1)', border: '1px solid rgba(158, 90, 60, 0.2)', textAlign: 'center' }}>
                <ThemeIcon size={40} radius="xl" color="blue" variant="light" mx="auto" mb="sm">
                  <IconTrendingUp size={20} />
                </ThemeIcon>
                <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }} mb={4}>
                  Track Everything
                </Text>
                <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                  Fitness trends, power curves, training load, recovery—all auto-calculated from your synced rides.
                </Text>
              </Paper>
            </SimpleGrid>
          </Stack>
        </Container>
      </Box>

      {/* PRODUCT SHOWCASE */}
      <Box py={{ base: 60, md: 80 }} px={{ base: 'md', md: 'xl' }}>
        <Container size="md">
          <Stack gap={48}>

            {/* 1. ROUTE BUILDING */}
            <Grid gutter="xl" align="center">
              <Grid.Col span={{ base: 12, md: 5 }} order={{ base: 2, md: 1 }}>
                {/* Accurate preview of the Route Builder sidebar */}
                <Paper
                  p="md"
                  radius="lg"
                  style={{
                    background: 'var(--tribos-bg-secondary)',
                    border: '1px solid var(--tribos-border)',
                    pointerEvents: 'none',
                    userSelect: 'none',
                  }}
                >
                  <Stack gap="sm">
                    {/* Mode selector - matches real SegmentedControl */}
                    <SegmentedControl
                      size="xs"
                      readOnly
                      value="ai"
                      data={[
                        { label: 'AI Builder', value: 'ai' },
                        { label: 'Manual', value: 'manual' },
                        { label: 'Import GPX', value: 'import' },
                      ]}
                      styles={{ root: { backgroundColor: 'var(--tribos-bg-tertiary)' } }}
                      fullWidth
                    />

                    {/* AI prompt textarea - matches real placeholder */}
                    <div>
                      <Text size="xs" fw={600} c="dimmed" mb={4}>DESCRIBE YOUR RIDE</Text>
                      <Textarea
                        readOnly
                        value="40 mile gravel loop with rolling hills, avoid highways"
                        rows={2}
                        variant="filled"
                        styles={{
                          input: {
                            backgroundColor: 'var(--tribos-bg-tertiary)',
                            fontSize: 'var(--mantine-font-size-sm)',
                          },
                        }}
                      />
                    </div>

                    {/* Route profile selector - matches real options */}
                    <div>
                      <Text size="xs" fw={600} c="dimmed" mb={4}>ROUTE PROFILE</Text>
                      <SegmentedControl
                        size="xs"
                        readOnly
                        value="gravel"
                        fullWidth
                        data={[
                          { label: 'Road', value: 'road' },
                          { label: 'Gravel', value: 'gravel' },
                          { label: 'MTB', value: 'mountain' },
                          { label: 'Commute', value: 'commuting' },
                        ]}
                        styles={{ root: { backgroundColor: 'var(--tribos-bg-tertiary)' } }}
                      />
                    </div>

                    {/* Generate button - matches real styling */}
                    <Button
                      color="terracotta"
                      fullWidth
                      leftSection={<IconSparkles size={16} />}
                      style={{ pointerEvents: 'none' }}
                    >
                      Generate from Description
                    </Button>

                    {/* Route stats - matches real RouteStatsPanel layout */}
                    <Paper p="sm" style={{ backgroundColor: 'var(--tribos-bg-tertiary)', border: '1px solid var(--tribos-border)' }}>
                      <Text size="xs" fw={600} c="dimmed" mb="xs">ROUTE STATS</Text>
                      <SimpleGrid cols={2} spacing="xs">
                        <Group gap="xs">
                          <IconRuler size={16} color="var(--tribos-terracotta-500)" />
                          <div>
                            <Text size="xs" c="dimmed">Distance</Text>
                            <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>64.3 km</Text>
                          </div>
                        </Group>
                        <Group gap="xs">
                          <IconMountain size={16} color="#D4734D" />
                          <div>
                            <Text size="xs" c="dimmed">Elevation</Text>
                            <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>780m</Text>
                          </div>
                        </Group>
                        <Group gap="xs">
                          <IconClock size={16} color="var(--tribos-terracotta-500)" />
                          <div>
                            <Text size="xs" c="dimmed">Est. Time</Text>
                            <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>2h 45m</Text>
                          </div>
                        </Group>
                        <Group gap="xs">
                          <IconDownload size={16} color="var(--tribos-terracotta-500)" />
                          <div>
                            <Text size="xs" c="dimmed">Export</Text>
                            <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>GPX / TCX</Text>
                          </div>
                        </Group>
                      </SimpleGrid>
                    </Paper>
                  </Stack>
                </Paper>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 7 }} order={{ base: 1, md: 2 }}>
                <Stack gap="md">
                  <Group gap="sm">
                    <ThemeIcon size={40} color="sage" variant="light">
                      <IconMapPin size={20} />
                    </ThemeIcon>
                    <Title order={3} style={{ color: 'var(--tribos-text-primary)' }}>
                      Route Builder
                    </Title>
                  </Group>
                  <Text style={{ color: 'var(--tribos-text-secondary)' }}>
                    Build cycling routes by clicking on a map or describe what you want and let AI generate one for you.
                    Full elevation profiles, surface analysis, and difficulty ratings included.
                  </Text>
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>AI route generation from natural language</Text>
                    </Group>
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Drag-and-drop waypoints with elevation profile</Text>
                    </Group>
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Surface type detection (road, gravel, mixed)</Text>
                    </Group>
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Export to Garmin, Wahoo, GPX, or TCX</Text>
                    </Group>
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Weather, fueling, and tire pressure tools</Text>
                    </Group>
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Workout zone overlay on route</Text>
                    </Group>
                  </SimpleGrid>
                </Stack>
              </Grid.Col>
            </Grid>

            <Divider style={{ borderColor: `${'var(--tribos-terracotta-500)'}20` }} />

            {/* 2. AI COACH */}
            <Grid gutter="xl" align="center">
              <Grid.Col span={{ base: 12, md: 7 }}>
                <Stack gap="md">
                  <Group gap="sm">
                    <ThemeIcon size={40} color="terracotta" variant="light">
                      <IconMessageChatbot size={20} />
                    </ThemeIcon>
                    <Title order={3} style={{ color: 'var(--tribos-text-primary)' }}>
                      AI Coach
                    </Title>
                  </Group>
                  <Text style={{ color: 'var(--tribos-text-secondary)' }}>
                    A conversational cycling coach that actually knows your data. Ask it anything—what to ride today, how your fitness is trending, or to build you a training plan. It sees your ride history, training load, and recovery status.
                  </Text>
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Workout recommendations based on your current form</Text>
                    </Group>
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Knows your CTL, ATL, TSB, and recovery status</Text>
                    </Group>
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Can generate full training plans on demand</Text>
                    </Group>
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Persistent conversation history</Text>
                    </Group>
                  </SimpleGrid>
                </Stack>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 5 }}>
                {/* Accurate preview of the CoachCard component */}
                <Paper
                  p="md"
                  radius="lg"
                  style={{
                    background: `linear-gradient(135deg, rgba(158, 90, 60, 0.15), transparent), var(--tribos-bg-secondary)`,
                    border: '1px solid var(--tribos-border)',
                    pointerEvents: 'none',
                    userSelect: 'none',
                  }}
                >
                  <Stack gap="sm">
                    {/* Header - matches real CoachCard */}
                    <Group justify="space-between">
                      <Group gap="xs">
                        <ThemeIcon color="terracotta" variant="light" size="sm">
                          <IconSparkles size={14} />
                        </ThemeIcon>
                        <Text fw={600} size="sm" style={{ color: 'var(--tribos-text-primary)' }}>AI Coach</Text>
                      </Group>
                    </Group>

                    {/* Chat messages - matches real message styling */}
                    <Stack gap="xs">
                      {/* User message */}
                      <Group gap={6} align="flex-start">
                        <ThemeIcon color="teal" variant="light" size="xs" mt={2}>
                          <IconUser size={10} />
                        </ThemeIcon>
                        <Text size="xs" style={{ color: 'var(--tribos-text-secondary)', lineHeight: 1.5 }}>
                          What should I ride today? I have about 90 minutes.
                        </Text>
                      </Group>

                      {/* Coach message */}
                      <Group gap={6} align="flex-start">
                        <ThemeIcon color="terracotta" variant="light" size="xs" mt={2}>
                          <IconRobot size={10} />
                        </ThemeIcon>
                        <Stack gap={4} style={{ flex: 1 }}>
                          <Text size="xs" style={{ color: 'var(--tribos-text-primary)', lineHeight: 1.5 }}>
                            Your TSB is +8 and you had a rest day yesterday — you're fresh. I'd recommend sweet spot intervals: 3x15min at 88-93% FTP with 5min recovery between sets.
                          </Text>
                          {/* Workout recommendation action - matches real button */}
                          <Button
                            size="compact-xs"
                            variant="light"
                            color="terracotta"
                            leftSection={<IconCalendarPlus size={12} />}
                            style={{ alignSelf: 'flex-start', pointerEvents: 'none' }}
                          >
                            Add Sweet Spot 3x15
                          </Button>
                        </Stack>
                      </Group>
                    </Stack>

                    {/* Input - matches real CoachCard input */}
                    <Group gap="xs">
                      <TextInput
                        readOnly
                        placeholder="Ask your coach anything..."
                        size="xs"
                        style={{ flex: 1 }}
                        styles={{
                          input: {
                            backgroundColor: 'var(--tribos-bg-tertiary)',
                            borderColor: 'var(--tribos-border)',
                          },
                        }}
                      />
                      <ActionIcon color="terracotta" variant="light" size="md">
                        <IconSend size={14} />
                      </ActionIcon>
                    </Group>
                  </Stack>
                </Paper>
              </Grid.Col>
            </Grid>

            <Divider style={{ borderColor: `${'var(--tribos-terracotta-500)'}20` }} />

            {/* 3. TRAINING PLANS */}
            <Stack gap="md">
              <Group gap="sm">
                <ThemeIcon size={40} color="blue" variant="light">
                  <IconCalendarEvent size={20} />
                </ThemeIcon>
                <Title order={3} style={{ color: 'var(--tribos-text-primary)' }}>
                  Structured Training Plans
                </Title>
              </Group>
              <Text style={{ color: 'var(--tribos-text-secondary)' }}>
                Choose from training plans across polarized, sweet spot, threshold, and goal-specific programs—or let the AI coach build one for you. Drag workouts onto your calendar and track compliance as you go.
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                <Group gap="xs">
                  <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                  <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Plans for racing, gran fondo, climbing, gravel, and more</Text>
                </Group>
                <Group gap="xs">
                  <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                  <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Workouts with power and HR zone targets</Text>
                </Group>
                <Group gap="xs">
                  <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                  <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Drag-and-drop calendar with compliance tracking</Text>
                </Group>
                <Group gap="xs">
                  <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                  <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Cross-training and race goal support</Text>
                </Group>
              </SimpleGrid>
            </Stack>

            <Divider style={{ borderColor: `${'var(--tribos-terracotta-500)'}20` }} />

            {/* 4. TRAINING ANALYTICS */}
            <Stack gap="md">
              <Group gap="sm">
                <ThemeIcon size={40} color="blue" variant="light">
                  <IconTrendingUp size={20} />
                </ThemeIcon>
                <Title order={3} style={{ color: 'var(--tribos-text-primary)' }}>
                  Training Analytics
                </Title>
              </Group>
              <Text style={{ color: 'var(--tribos-text-secondary)' }}>
                Your rides automatically sync and feed into fitness, fatigue, and form calculations. See your power curves, zone distribution, and long-term trends—all in context so you know what the numbers mean.
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                <Group gap="xs">
                  <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                  <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Fitness (CTL), Fatigue (ATL), and Form (TSB) tracking</Text>
                </Group>
                <Group gap="xs">
                  <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                  <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Power duration curves and personal records</Text>
                </Group>
                <Group gap="xs">
                  <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                  <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Daily readiness score with training recommendations</Text>
                </Group>
                <Group gap="xs">
                  <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                  <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Year-over-year fitness comparisons and insights</Text>
                </Group>
              </SimpleGrid>
            </Stack>

            <Divider style={{ borderColor: `${'var(--tribos-terracotta-500)'}20` }} />

            {/* 5. RECOVERY */}
            <Stack gap="md">
              <Group gap="sm">
                <ThemeIcon size={40} color="terracotta" variant="light">
                  <IconHeart size={20} />
                </ThemeIcon>
                <Title order={3} style={{ color: 'var(--tribos-text-primary)' }}>
                  Recovery & Health Tracking
                </Title>
              </Group>
              <Text style={{ color: 'var(--tribos-text-secondary)' }}>
                Quick daily check-ins for sleep, HRV, energy, and soreness feed directly into your readiness score. Combined with your training load, the platform knows when you're ready to push and when you need to back off.
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                <Group gap="xs">
                  <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                  <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>30-second daily health check-ins</Text>
                </Group>
                <Group gap="xs">
                  <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                  <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Auto-sync resting HR and HRV from Garmin</Text>
                </Group>
                <Group gap="xs">
                  <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                  <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Health trends visualization over time</Text>
                </Group>
                <Group gap="xs">
                  <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                  <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Integrated into readiness and training recommendations</Text>
                </Group>
              </SimpleGrid>
            </Stack>

          </Stack>
        </Container>
      </Box>

      {/* INTEGRATIONS */}
      <Box py={{ base: 40, md: 60 }} px={{ base: 'md', md: 'xl' }} style={{ backgroundColor: `${'var(--tribos-bg-secondary)'}50` }}>
        <Container size="md">
          <Stack align="center" gap="xl">
            <Title order={2} size={28} ta="center" style={{ color: 'var(--tribos-text-primary)' }}>
              Syncs With Your Gear
            </Title>
            <Text size="md" ta="center" style={{ color: 'var(--tribos-text-secondary)', maxWidth: 500 }}>
              Connect your accounts and your ride history imports automatically. New rides sync in real-time.
            </Text>

            <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="lg">
              <Paper p="lg" style={{ backgroundColor: 'var(--tribos-bg-secondary)', border: '2px solid #FC4C02', textAlign: 'center' }}>
                <ThemeIcon size={50} radius="xl" color="orange" variant="light" mx="auto" mb="sm">
                  <IconActivity size={24} />
                </ThemeIcon>
                <Text fw={600} style={{ color: 'var(--tribos-text-primary)' }}>Strava</Text>
                <Text size="xs" c="dimmed">Auto-import rides</Text>
              </Paper>
              <Paper p="lg" style={{ backgroundColor: 'var(--tribos-bg-secondary)', border: '2px solid #007CC3', textAlign: 'center' }}>
                <ThemeIcon size={50} radius="xl" color="blue" variant="light" mx="auto" mb="sm">
                  <IconDeviceWatch size={24} />
                </ThemeIcon>
                <Text fw={600} style={{ color: 'var(--tribos-text-primary)' }}>Garmin</Text>
                <Text size="xs" c="dimmed">Sync activities & routes</Text>
              </Paper>
              <Paper p="lg" style={{ backgroundColor: 'var(--tribos-bg-secondary)', border: '2px solid #1A73E8', textAlign: 'center' }}>
                <ThemeIcon size={50} radius="xl" color="cyan" variant="light" mx="auto" mb="sm">
                  <IconDeviceWatch size={24} />
                </ThemeIcon>
                <Text fw={600} style={{ color: 'var(--tribos-text-primary)' }}>Wahoo</Text>
                <Text size="xs" c="dimmed">Sync routes to device</Text>
              </Paper>
              <Paper p="lg" style={{ backgroundColor: 'var(--tribos-bg-secondary)', border: `2px solid ${'var(--tribos-terracotta-500)'}`, textAlign: 'center' }}>
                <ThemeIcon size={50} radius="xl" color="terracotta" variant="light" mx="auto" mb="sm">
                  <IconUpload size={24} />
                </ThemeIcon>
                <Text fw={600} style={{ color: 'var(--tribos-text-primary)' }}>FIT Upload</Text>
                <Text size="xs" c="dimmed">Direct file upload</Text>
              </Paper>
            </SimpleGrid>
          </Stack>
        </Container>
      </Box>

      {/* FINAL CTA */}
      <Box py={{ base: 60, md: 80 }} px={{ base: 'md', md: 'xl' }}>
        <Container size="sm">
          <Stack align="center" gap="xl">
            <Title order={2} size={32} ta="center" style={{ color: 'var(--tribos-text-primary)' }}>
              Ready to Ride Smarter?
            </Title>
            <Text size="lg" ta="center" style={{ color: 'var(--tribos-text-secondary)' }}>
              Join the beta — build your first route, connect your devices, and see what AI coaching can do for your cycling.
            </Text>

            <Button
              component={Link}
              to="/auth"
              size="xl"
              color="terracotta"
              rightSection={<IconChevronRight size={20} />}
            >
              Create Free Account
            </Button>

            <Text size="sm" style={{ color: 'var(--tribos-text-muted)' }}>
              Free to start  -  No credit card required
            </Text>
          </Stack>
        </Container>
      </Box>

      {/* Footer */}
      <Box py={30} px={{ base: 'md', md: 'xl' }} style={{ backgroundColor: 'var(--tribos-bg-primary)', borderTop: `1px solid ${'var(--tribos-terracotta-500)'}20` }}>
        <Container size="lg">
          <Stack gap="sm">
            <Center>
              <Group gap="md">
                <IconRoute size={20} color={'var(--tribos-terracotta-500)'} />
                <Text size="sm" style={{ color: 'var(--tribos-text-muted)' }}>
                  tribos.studio
                </Text>
              </Group>
            </Center>
            <Center>
              <Group gap="lg">
                <Anchor href="/privacy" size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                  Privacy
                </Anchor>
                <Anchor href="/terms" size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                  Terms
                </Anchor>
                <Anchor href="mailto:travis@tribos.studio" size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                  Contact
                </Anchor>
              </Group>
            </Center>
          </Stack>
        </Container>
      </Box>
    </Box>
    </>
  );
}

export default Landing;
