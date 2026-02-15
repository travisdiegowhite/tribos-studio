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
} from '@mantine/core';
import {
  IconRoute,
  IconCheck,
  IconChevronRight,
  IconTrendingUp,
  IconMapPin,
  IconHeart,
  IconBolt,
  IconUpload,
  IconActivity,
  IconDeviceWatch,
  IconMessageChatbot,
  IconCalendarEvent,
  IconMap2,
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
        <Container size="lg">
          <Grid gutter={{ base: 40, md: 60 }} align="center">
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Stack gap="lg">
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

                <Text size="xl" style={{ color: 'var(--tribos-text-secondary)' }}>
                  A cycling route builder and training platform that learns from your ride history. Plan routes, get AI coaching, and follow structured training plans—all in one place.
                </Text>

                <Stack gap="xs">
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
            </Grid.Col>

            {/* Route Builder Preview */}
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Paper
                p="lg"
                radius="lg"
                style={{
                  background: `linear-gradient(135deg, ${'var(--tribos-bg-secondary)'} 0%, rgba(158, 90, 60, 0.05) 100%)`,
                  border: `2px solid ${'var(--tribos-terracotta-500)'}30`,
                }}
              >
                <Stack gap="md">
                  <Text size="sm" fw={600} style={{ color: 'var(--tribos-terracotta-500)' }}>
                    ROUTE BUILDER
                  </Text>

                  {/* Mock Map */}
                  <Box style={{ height: 180, background: `linear-gradient(135deg, rgba(168, 191, 168, 0.3) 0%, rgba(123, 169, 160, 0.3) 100%)`, borderRadius: 8, position: 'relative', overflow: 'hidden' }}>
                    {/* Route line with waypoints */}
                    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 400 180" preserveAspectRatio="none">
                      <path d="M40,140 C80,130 100,60 160,50 C220,40 240,100 280,80 C320,60 350,30 380,40" stroke="var(--tribos-terracotta-500)" strokeWidth="3" fill="none" strokeLinecap="round" />
                      <circle cx="40" cy="140" r="5" fill="#22d3ee" />
                      <circle cx="160" cy="50" r="4" fill="var(--tribos-terracotta-500)" />
                      <circle cx="280" cy="80" r="4" fill="var(--tribos-terracotta-500)" />
                      <circle cx="380" cy="40" r="5" fill="#22d3ee" />
                    </svg>
                    <Box style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: 4 }}>
                      <Text size="xs" c="white">42.5 km  650m elev</Text>
                    </Box>
                    <Box style={{ position: 'absolute', bottom: 10, left: 10, background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: 4 }}>
                      <Text size="xs" c="white">Moderate  ~2h 10m</Text>
                    </Box>
                  </Box>

                  {/* Elevation Profile Mini */}
                  <Box style={{ height: 40, display: 'flex', alignItems: 'flex-end', gap: 1, padding: '0 4px' }}>
                    {[15, 20, 25, 35, 50, 65, 80, 75, 60, 45, 55, 70, 85, 90, 80, 65, 50, 40, 35, 30, 25, 20, 30, 45, 60, 50, 35, 25, 20, 15].map((h, i) => (
                      <Box key={i} style={{ flex: 1, height: `${h}%`, backgroundColor: h > 70 ? 'var(--tribos-terracotta-500)' : 'rgba(34, 211, 238, 0.6)', borderRadius: '1px 1px 0 0', transition: 'height 0.3s' }} />
                    ))}
                  </Box>
                  <Text size="xs" c="dimmed" ta="center">Elevation Profile</Text>
                </Stack>
              </Paper>
            </Grid.Col>
          </Grid>
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
        <Container size="lg">
          <Stack gap={60}>

            {/* 1. ROUTE BUILDING - Primary Feature */}
            <Grid gutter="xl" align="center">
              <Grid.Col span={{ base: 12, md: 6 }} order={{ base: 2, md: 1 }}>
                <Paper p="lg" style={{ backgroundColor: 'var(--tribos-bg-secondary)', border: `1px solid ${'var(--tribos-border)'}` }}>
                  <Text size="xs" c="dimmed" mb="md">AI ROUTE GENERATION</Text>
                  {/* AI prompt mock */}
                  <Paper p="sm" mb="md" style={{ backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(158, 90, 60, 0.3)' }}>
                    <Text size="xs" style={{ color: 'var(--tribos-text-secondary)', fontStyle: 'italic' }}>
                      "Generate a 60km rolling hills ride starting from downtown, avoiding highways, mostly paved"
                    </Text>
                  </Paper>
                  {/* Route result stats */}
                  <SimpleGrid cols={3} spacing="sm">
                    <Paper p="xs" style={{ backgroundColor: 'rgba(0,0,0,0.2)', textAlign: 'center' }}>
                      <Text size="xs" c="dimmed">Distance</Text>
                      <Text size="sm" fw={700} style={{ color: 'var(--tribos-terracotta-500)' }}>62.3 km</Text>
                    </Paper>
                    <Paper p="xs" style={{ backgroundColor: 'rgba(0,0,0,0.2)', textAlign: 'center' }}>
                      <Text size="xs" c="dimmed">Elevation</Text>
                      <Text size="sm" fw={700} style={{ color: '#22d3ee' }}>840m</Text>
                    </Paper>
                    <Paper p="xs" style={{ backgroundColor: 'rgba(0,0,0,0.2)', textAlign: 'center' }}>
                      <Text size="xs" c="dimmed">Surface</Text>
                      <Text size="sm" fw={700} style={{ color: '#B89040' }}>96% paved</Text>
                    </Paper>
                  </SimpleGrid>
                  <Paper p="sm" mt="md" style={{ backgroundColor: 'var(--tribos-terracotta-500)' + '20', border: `1px solid ${'var(--tribos-terracotta-500)'}50` }}>
                    <Group gap="sm">
                      <ThemeIcon color="sage" variant="light" radius="xl" size="sm">
                        <IconCheck size={12} />
                      </ThemeIcon>
                      <Text size="xs" style={{ color: 'var(--tribos-text-primary)' }}>
                        Route ready — export to Garmin, Wahoo, or GPX
                      </Text>
                    </Group>
                  </Paper>
                </Paper>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }} order={{ base: 1, md: 2 }}>
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
                  <Stack gap="xs">
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>AI route generation from natural language</Text>
                    </Group>
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Drag-and-drop waypoints with live elevation profile</Text>
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
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Fueling and tire pressure recommendations</Text>
                    </Group>
                  </Stack>
                </Stack>
              </Grid.Col>
            </Grid>

            <Divider style={{ borderColor: `${'var(--tribos-terracotta-500)'}20` }} />

            {/* 2. AI COACH */}
            <Grid gutter="xl" align="center">
              <Grid.Col span={{ base: 12, md: 6 }}>
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
                  <Stack gap="xs">
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
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Available anywhere via the command bar</Text>
                    </Group>
                  </Stack>
                </Stack>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Paper p="lg" style={{ backgroundColor: 'var(--tribos-bg-secondary)', border: `1px solid ${'var(--tribos-border)'}` }}>
                  <Text size="xs" c="dimmed" mb="md">AI COACH</Text>
                  <Stack gap="sm">
                    {/* User message */}
                    <Paper p="sm" style={{ backgroundColor: 'rgba(158, 90, 60, 0.15)', borderRadius: '12px 12px 4px 12px', marginLeft: 40 }}>
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                        What should I ride today? I have about 90 minutes.
                      </Text>
                    </Paper>
                    {/* Coach response */}
                    <Paper p="sm" style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '12px 12px 12px 4px', marginRight: 20 }}>
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                        Your TSB is +8 and you're coming off a rest day — you're fresh. I'd suggest sweet spot intervals: 3x15min at 88-93% FTP with 5min recovery.
                      </Text>
                      <Text size="xs" mt="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                        That would add ~85 TSS, keeping your ramp rate healthy at 5.2 TSS/week.
                      </Text>
                    </Paper>
                    {/* Quick action */}
                    <Group gap="xs" mt={4}>
                      <Badge size="sm" color="terracotta" variant="light" style={{ cursor: 'pointer' }}>Add to calendar</Badge>
                      <Badge size="sm" color="blue" variant="light" style={{ cursor: 'pointer' }}>Build a route for it</Badge>
                    </Group>
                  </Stack>
                </Paper>
              </Grid.Col>
            </Grid>

            <Divider style={{ borderColor: `${'var(--tribos-terracotta-500)'}20` }} />

            {/* 3. TRAINING PLANS */}
            <Grid gutter="xl" align="center">
              <Grid.Col span={{ base: 12, md: 6 }} order={{ base: 2, md: 1 }}>
                <Paper p="lg" style={{ backgroundColor: 'var(--tribos-bg-secondary)', border: `1px solid ${'var(--tribos-border)'}` }}>
                  <Text size="xs" c="dimmed" mb="md">TRAINING PLANNER</Text>
                  {/* Mock calendar week */}
                  <SimpleGrid cols={7} spacing={4}>
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                      <Text key={day} size={10} ta="center" c="dimmed">{day}</Text>
                    ))}
                    {/* Week 1 */}
                    <Paper p={4} style={{ backgroundColor: 'rgba(34, 211, 238, 0.2)', textAlign: 'center', borderRadius: 4 }}>
                      <Text size={9} style={{ color: '#22d3ee' }}>Z2</Text>
                      <Text size={8} c="dimmed">60m</Text>
                    </Paper>
                    <Paper p={4} style={{ backgroundColor: 'rgba(158, 90, 60, 0.2)', textAlign: 'center', borderRadius: 4 }}>
                      <Text size={9} style={{ color: 'var(--tribos-terracotta-500)' }}>SST</Text>
                      <Text size={8} c="dimmed">75m</Text>
                    </Paper>
                    <Paper p={4} style={{ backgroundColor: 'rgba(0,0,0,0.1)', textAlign: 'center', borderRadius: 4 }}>
                      <Text size={9} c="dimmed">Rest</Text>
                    </Paper>
                    <Paper p={4} style={{ backgroundColor: 'rgba(158, 90, 60, 0.3)', textAlign: 'center', borderRadius: 4 }}>
                      <Text size={9} style={{ color: 'var(--tribos-terracotta-500)' }}>VO2</Text>
                      <Text size={8} c="dimmed">60m</Text>
                    </Paper>
                    <Paper p={4} style={{ backgroundColor: 'rgba(34, 211, 238, 0.15)', textAlign: 'center', borderRadius: 4 }}>
                      <Text size={9} style={{ color: '#22d3ee' }}>Z2</Text>
                      <Text size={8} c="dimmed">45m</Text>
                    </Paper>
                    <Paper p={4} style={{ backgroundColor: 'rgba(184, 144, 64, 0.2)', textAlign: 'center', borderRadius: 4 }}>
                      <Text size={9} style={{ color: '#B89040' }}>Long</Text>
                      <Text size={8} c="dimmed">3h</Text>
                    </Paper>
                    <Paper p={4} style={{ backgroundColor: 'rgba(0,0,0,0.1)', textAlign: 'center', borderRadius: 4 }}>
                      <Text size={9} c="dimmed">Rest</Text>
                    </Paper>
                  </SimpleGrid>
                  <Group justify="space-between" mt="md">
                    <div>
                      <Text size="xs" c="dimmed">Weekly TSS</Text>
                      <Text size="sm" fw={600} style={{ color: 'var(--tribos-terracotta-500)' }}>420</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">Phase</Text>
                      <Badge size="sm" color="blue" variant="light">Build 2</Badge>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">Compliance</Text>
                      <Text size="sm" fw={600} style={{ color: '#22d3ee' }}>92%</Text>
                    </div>
                  </Group>
                </Paper>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }} order={{ base: 1, md: 2 }}>
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
                    Choose from 25+ training plans across polarized, sweet spot, threshold, and goal-specific programs—or let the AI coach build one for you. Drag workouts onto your calendar and track compliance as you go.
                  </Text>
                  <Stack gap="xs">
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Plans for racing, gran fondo, climbing, gravel, and more</Text>
                    </Group>
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>80+ workouts with power and HR zone targets</Text>
                    </Group>
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Drag-and-drop calendar with compliance tracking</Text>
                    </Group>
                  </Stack>
                </Stack>
              </Grid.Col>
            </Grid>

            <Divider style={{ borderColor: `${'var(--tribos-terracotta-500)'}20` }} />

            {/* 4. TRAINING ANALYTICS */}
            <Grid gutter="xl" align="center">
              <Grid.Col span={{ base: 12, md: 6 }}>
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
                  <Stack gap="xs">
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
                  </Stack>
                </Stack>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Paper p="lg" style={{ backgroundColor: 'var(--tribos-bg-secondary)', border: `1px solid ${'var(--tribos-border)'}` }}>
                  <Text size="xs" c="dimmed" mb="md">FITNESS OVERVIEW</Text>
                  {/* Mock Dashboard Stats */}
                  <SimpleGrid cols={{ base: 2 }} spacing="sm">
                    <Paper p="sm" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
                      <Text size="xs" c="dimmed">Readiness</Text>
                      <Group gap="xs" align="baseline">
                        <Text size="xl" fw={700} style={{ color: 'var(--tribos-terracotta-500)' }}>78</Text>
                        <Text size="xs" c="sage">Good to train</Text>
                      </Group>
                    </Paper>
                    <Paper p="sm" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
                      <Text size="xs" c="dimmed">Form (TSB)</Text>
                      <Group gap="xs" align="baseline">
                        <Text size="xl" fw={700} style={{ color: '#22d3ee' }}>+12</Text>
                        <Text size="xs" c="blue">Fresh</Text>
                      </Group>
                    </Paper>
                    <Paper p="sm" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
                      <Text size="xs" c="dimmed">Fitness (CTL)</Text>
                      <Group gap="xs" align="baseline">
                        <Text size="xl" fw={700} style={{ color: '#B89040' }}>67</Text>
                        <Text size="xs" c="orange">Building</Text>
                      </Group>
                    </Paper>
                    <Paper p="sm" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
                      <Text size="xs" c="dimmed">Fatigue (ATL)</Text>
                      <Group gap="xs" align="baseline">
                        <Text size="xl" fw={700} style={{ color: '#9E5A3C' }}>55</Text>
                        <Text size="xs" c="red">Moderate</Text>
                      </Group>
                    </Paper>
                  </SimpleGrid>
                  {/* Mini fitness chart */}
                  <Box mt="md" style={{ height: 60, background: 'linear-gradient(90deg, rgba(158, 90, 60, 0.2) 0%, rgba(34, 211, 238, 0.2) 100%)', borderRadius: 8, display: 'flex', alignItems: 'flex-end', padding: '8px 12px', gap: 3 }}>
                    {[40, 55, 48, 62, 58, 70, 65, 75, 68, 80, 72, 85].map((h, i) => (
                      <Box key={i} style={{ flex: 1, height: `${h}%`, backgroundColor: i > 8 ? 'var(--tribos-terracotta-500)' : '#22d3ee', borderRadius: 2, opacity: 0.8 }} />
                    ))}
                  </Box>
                  <Group justify="space-between" mt={4}>
                    <Text size={10} c="dimmed">12 weeks ago</Text>
                    <Text size={10} c="dimmed">Today</Text>
                  </Group>
                </Paper>
              </Grid.Col>
            </Grid>

            <Divider style={{ borderColor: `${'var(--tribos-terracotta-500)'}20` }} />

            {/* 5. RECOVERY */}
            <Grid gutter="xl" align="center">
              <Grid.Col span={{ base: 12, md: 6 }} order={{ base: 2, md: 1 }}>
                <Paper p="lg" style={{ backgroundColor: 'var(--tribos-bg-secondary)', border: `1px solid ${'var(--tribos-border)'}` }}>
                  <Text size="xs" c="dimmed" mb="md">HEALTH CHECK-IN</Text>
                  <Stack gap="sm">
                    <Group justify="space-between">
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Sleep</Text>
                      <Badge color="sage">7.5 hrs</Badge>
                    </Group>
                    <Group justify="space-between">
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>HRV</Text>
                      <Badge color="blue">58 ms</Badge>
                    </Group>
                    <Group justify="space-between">
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Energy</Text>
                      <Badge color="terracotta">4/5</Badge>
                    </Group>
                    <Group justify="space-between">
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Soreness</Text>
                      <Badge color="orange">2/5</Badge>
                    </Group>
                  </Stack>
                  <Paper p="sm" mt="md" style={{ backgroundColor: 'var(--tribos-terracotta-500)' + '20', border: `1px solid ${'var(--tribos-terracotta-500)'}50` }}>
                    <Group gap="sm">
                      <ThemeIcon color="terracotta" variant="light" radius="xl" size="sm">
                        <IconBolt size={12} />
                      </ThemeIcon>
                      <Text size="xs" style={{ color: 'var(--tribos-text-primary)' }}>
                        Recovery looks good — clear for intensity today
                      </Text>
                    </Group>
                  </Paper>
                </Paper>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }} order={{ base: 1, md: 2 }}>
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
                  <Stack gap="xs">
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>30-second daily health check-ins</Text>
                    </Group>
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Health trends visualization over time</Text>
                    </Group>
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Integrated into readiness and training recommendations</Text>
                    </Group>
                  </Stack>
                </Stack>
              </Grid.Col>
            </Grid>

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
