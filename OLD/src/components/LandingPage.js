import React, { useState } from 'react';
import {
  Container,
  Title,
  Text,
  Button,
  Stack,
  Group,
  Grid,
  Card,
  ThemeIcon,
  Box,
  Center,
  Divider,
  Paper,
  Anchor,
  List,
  Flex,
  Badge,
} from '@mantine/core';
import {
  Route,
  Brain,
  TrendingUp,
  MapPin,
  Activity,
  Zap,
  Target,
  Clock,
  Globe,
  Smartphone,
  ChevronRight,
  Star,
  Plus,
  Users,
  HelpCircle,
  Rocket,
  Play,
  Watch,
  LogIn,
  Check,
} from 'lucide-react';
import BetaSignup from './BetaSignup';
import LandingRouteDemo from './LandingRouteDemo';
import AnimatedBackground from './AnimatedBackground';

const LandingPage = ({ onGetStarted, onTryDemo, onSignIn }) => {
  const [betaModalOpened, setBetaModalOpened] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [showStickyBar, setShowStickyBar] = useState(false);

  // Show sticky CTA bar after scrolling past hero
  React.useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      setShowStickyBar(scrollPosition > 400);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  const features = [
    {
      icon: MapPin,
      title: 'Smart Route Planning & Building',
      description: 'Build routes manually or let AI suggest routes based on your goals. Professional editing tools with elevation profiles and surface type analysis.',
      color: 'green',
    },
    {
      icon: Activity,
      title: 'Strava & Garmin Integration',
      description: 'Connect your existing data sources. Import rides automatically, sync routes to your devices, and track your complete cycling history.',
      color: 'blue',
    },
    {
      icon: TrendingUp,
      title: 'Training Analytics',
      description: 'Track CTL, ATL, and TSB with research-backed metrics. See your fitness trends, analyze performance, and understand your training load—all in one place.',
      color: 'orange',
    },
    {
      icon: Target,
      title: 'All-in-One Platform',
      description: 'Stop juggling multiple apps. Route planning, training tracking, and performance analytics—everything you need without the $300/year subscription fees.',
      color: 'purple',
    },
  ];

  const benefits = [
    'One platform instead of Strava + route builders + separate training tools',
    'Training analytics that actually help you decide what to do',
    'Routes tailored to your current fitness level',
    'Export to Garmin, Wahoo, or any GPS device',
    'Affordable pricing ($4/month for beta users)',
    'Built by a cyclist who was frustrated with existing tools',
  ];

  return (
    <Box style={{
      background: 'radial-gradient(ellipse at top, rgba(50, 205, 50, 0.15) 0%, transparent 50%), linear-gradient(180deg, #1a202c 0%, #2d3748 30%, #3d4e5e 70%, #475569 100%)',
      minHeight: '100vh',
      position: 'relative',
      width: '100%'
    }}>
      {/* Animated Background */}
      <AnimatedBackground />

      {/* Compact Hero Section */}
      <Box py={{ base: 20, md: 30 }} px={{ base: 'lg', sm: 'xl', md: 60, lg: 80 }} style={{
        background: 'linear-gradient(135deg, rgba(26, 32, 44, 0.95) 0%, rgba(45, 55, 72, 0.9) 100%)',
        position: 'relative',
        width: '100%'
      }}>
        <Group justify="space-between" align="center">
          <Group spacing="sm" align="center">
            <Route size={20} color="#10b981" style={{ filter: 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.5))' }} />
            <Title
              order={1}
              size={{ base: 20, md: 24 }}
              fw={700}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #22d3ee 50%, #fbbf24 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                letterSpacing: '-0.02em',
              }}
            >
              tribos.studio
            </Title>
          </Group>

          <Group spacing="sm" display={{ base: 'none', sm: 'flex' }}>
            <Button
              size="md"
              variant="subtle"
              onClick={onSignIn || (() => onGetStarted && onGetStarted())}
              leftSection={<LogIn size={16} />}
              color="gray"
            >
              Sign In
            </Button>
            <Button
              size="md"
              onClick={onGetStarted}
              leftSection={<ChevronRight size={18} />}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #22d3ee 100%)',
              }}
            >
              Create Free Account
            </Button>
          </Group>
        </Group>

        <Title order={1} size={{ base: 32, md: 48 }} fw={700} ta="center" mt="xl">
          Building the Cycling Platform{' '}
          <Text span style={{
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            I Wish Existed
          </Text>
        </Title>

        <Text size={{ base: 'md', md: 'xl' }} c="dimmed" ta="center" mt="md" maw={800} mx="auto">
          Stop paying $300/year across multiple cycling platforms.
          Get route planning, training analytics, and performance tracking in one place—for $4/month.
        </Text>

        {/* Beta Deal Callout Box */}
        <Paper shadow="md" p="xl" mt="xl" maw={700} mx="auto" style={{
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
          border: '2px solid rgba(139, 92, 246, 0.3)'
        }}>
          <Title order={3} size="lg" ta="center" mb="md">
            🎯 The Beta Deal
          </Title>
          <Grid gutter="md">
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Flex align="flex-start" gap="xs">
                <Text c="violet" fw={600}>✓</Text>
                <Text size="sm"><strong>$4/month forever</strong> (vs $8+ at launch)</Text>
              </Flex>
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Flex align="flex-start" gap="xs">
                <Text c="violet" fw={600}>✓</Text>
                <Text size="sm"><strong>Shape the product</strong> with direct founder access</Text>
              </Flex>
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Flex align="flex-start" gap="xs">
                <Text c="violet" fw={600}>✓</Text>
                <Text size="sm"><strong>Free to start</strong> - no credit card required</Text>
              </Flex>
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Flex align="flex-start" gap="xs">
                <Text c="violet" fw={600}>✓</Text>
                <Text size="sm"><strong>Founding member status</strong> forever</Text>
              </Flex>
            </Grid.Col>
          </Grid>
        </Paper>

        {/* CTA Buttons - Desktop */}
        <Group justify="center" mt="xl" display={{ base: 'none', sm: 'flex' }}>
          <Button
            size="xl"
            onClick={onGetStarted}
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            }}
          >
            Create Free Account
          </Button>
          <Button
            size="xl"
            variant="outline"
            onClick={onTryDemo}
            leftSection={<Play size={20} />}
            style={{
              borderColor: '#8b5cf6',
              color: '#8b5cf6',
            }}
          >
            Try Demo
          </Button>
        </Group>

        <Group justify="center" gap="lg" mt="md" display={{ base: 'none', sm: 'flex' }}>
          <Text size="sm" c="dimmed" ta="center">
            <Check size={16} style={{ display: 'inline', verticalAlign: 'middle', color: '#10b981' }} /> Free to start
          </Text>
          <Text size="sm" c="dimmed" ta="center">
            <Check size={16} style={{ display: 'inline', verticalAlign: 'middle', color: '#10b981' }} /> No credit card
          </Text>
          <Text size="sm" c="dimmed" ta="center">
            <Check size={16} style={{ display: 'inline', verticalAlign: 'middle', color: '#10b981' }} /> Cancel anytime
          </Text>
        </Group>

        {/* Mobile-only CTA below tagline */}
        <Center mt="xl" display={{ base: 'block', sm: 'none' }}>
          <Stack spacing="sm">
            <Button
              size="lg"
              fullWidth
              onClick={onGetStarted}
              style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                minHeight: '48px',
              }}
            >
              Create Free Account
            </Button>
            <Button
              size="lg"
              fullWidth
              variant="outline"
              onClick={onTryDemo}
              leftSection={<Play size={18} />}
              style={{
                borderColor: '#8b5cf6',
                color: '#8b5cf6',
                minHeight: '48px',
              }}
            >
              Try Demo
            </Button>
            <Text size="xs" c="dimmed" ta="center">
              Free to start • No credit card • Cancel anytime
            </Text>
          </Stack>
        </Center>
      </Box>

      <Divider style={{ marginTop: 0, marginBottom: 0, borderColor: 'rgba(50, 205, 50, 0.3)' }} />

      {/* The Problem Section */}
      <Box py={{ base: 40, md: 80 }} px={{ base: 'lg', sm: 'xl', md: 60, lg: 80 }} style={{ backgroundColor: 'rgba(26, 32, 44, 0.5)', width: '100%' }}>
        <Stack spacing="xl">
          <Stack align="center" spacing="md">
            <Title order={2} size={32} ta="center">
              Here's Why I'm{' '}
              <Text span style={{
                background: 'linear-gradient(135deg, #10b981 0%, #22d3ee 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
                Building This
              </Text>
            </Title>
            <Text size="lg" c="dimmed" ta="center" maw={700}>
              I've spent years frustrated with the tools we're forced to use. Let's fix this together.
            </Text>
          </Stack>

          <Grid gutter="xl">
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Stack spacing="md">
                <Title order={3} size="xl" mb="md">
                  My Training App Frustrations:
                </Title>
                <Paper p="md" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                  <Group align="flex-start" gap="sm">
                    <Text size="xl">📊</Text>
                    <Stack spacing={4} style={{ flex: 1 }}>
                      <Text fw={600}>My training platform shows me CTL, ATL, TSB...</Text>
                      <Text size="sm" c="dimmed">But never tells me what to DO with those numbers at 5:30am</Text>
                    </Stack>
                  </Group>
                </Paper>
                <Paper p="md" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                  <Group align="flex-start" gap="sm">
                    <Text size="xl">🗺️</Text>
                    <Stack spacing={4} style={{ flex: 1 }}>
                      <Text fw={600}>Route builders don't know MY fitness</Text>
                      <Text size="sm" c="dimmed">A 50-mile route hits different when you're cooked vs fresh</Text>
                    </Stack>
                  </Group>
                </Paper>
                <Paper p="md" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                  <Group align="flex-start" gap="sm">
                    <Text size="xl">💰</Text>
                    <Stack spacing={4} style={{ flex: 1 }}>
                      <Text fw={600}>$300/year across multiple apps</Text>
                      <Text size="sm" c="dimmed">Multiple platforms that don't even talk to each other</Text>
                    </Stack>
                  </Group>
                </Paper>
              </Stack>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6 }}>
              <Paper p="xl" style={{
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(99, 102, 241, 0.1) 100%)',
                border: '2px solid rgba(139, 92, 246, 0.3)',
                height: '100%'
              }}>
                <Title order={3} size="lg" mb="md">
                  What Every Cyclist Actually Needs:
                </Title>
                <Stack spacing="sm">
                  <Group align="flex-start" gap="xs">
                    <Text c="green" fw={600}>→</Text>
                    <Text>Clear answer: train hard or rest today?</Text>
                  </Group>
                  <Group align="flex-start" gap="xs">
                    <Text c="green" fw={600}>→</Text>
                    <Text>Routes that match your current fitness</Text>
                  </Group>
                  <Group align="flex-start" gap="xs">
                    <Text c="green" fw={600}>→</Text>
                    <Text>One app that actually understands your training</Text>
                  </Group>
                  <Group align="flex-start" gap="xs">
                    <Text c="green" fw={600}>→</Text>
                    <Text>Affordable enough for every cyclist</Text>
                  </Group>
                </Stack>

                <Paper mt="lg" p="md" style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)' }}>
                  <Text size="sm" c="dimmed" fs="italic">
                    "If existing platforms had better guidance and smart routes, I wouldn't be building this.
                    But they don't. So here we are."
                  </Text>
                  <Text size="sm" fw={600} mt="xs">
                    - Travis, Solo Developer & Cyclist
                  </Text>
                </Paper>
              </Paper>
            </Grid.Col>
          </Grid>
        </Stack>
      </Box>

      <Divider style={{ borderColor: 'rgba(50, 205, 50, 0.3)' }} />

      {/* Connect Your Data Section - NEW */}
      <Box py={{ base: 40, md: 80 }} px={{ base: 'lg', sm: 'xl', md: 60, lg: 80 }} id="integrations" style={{ backgroundColor: 'transparent', width: '100%' }}>
        <Stack align="center" spacing="xl">
          <Stack align="center" spacing="md" maw={700}>
            <Title order={2} size={32} ta="center">
              Connect Your Cycling Life 🔗
            </Title>
            <Text size="lg" c="dimmed" ta="center" lh={1.6}>
              Already tracking rides? Import them instantly and let our AI learn your riding style!
            </Text>
          </Stack>

          <Grid gutter={{ base: 'md', md: 'xl' }} mt="md" w="100%">
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Card
                withBorder
                h="100%"
                shadow="sm"
                padding={{ base: 'lg', md: 'xl' }}
                style={{
                  border: '3px solid #FC4C02',
                  transition: 'transform 0.2s',
                }}
              >
                <Stack align="center" spacing="lg">
                  <ThemeIcon size={70} radius="xl" color="orange" variant="light">
                    <Activity size={36} />
                  </ThemeIcon>
                  <Title order={3} size="xl" ta="center">Strava</Title>
                  <Text size="sm" c="dimmed" ta="center">
                    Connect your Strava account to unlock personalized route recommendations
                  </Text>
                  <List spacing="sm" size="sm">
                    <List.Item icon={
                      <ThemeIcon size={20} radius="xl" color="orange" variant="light">
                        <Text size="xs">✓</Text>
                      </ThemeIcon>
                    }>
                      Import all your activities automatically
                    </List.Item>
                    <List.Item icon={
                      <ThemeIcon size={20} radius="xl" color="orange" variant="light">
                        <Text size="xs">✓</Text>
                      </ThemeIcon>
                    }>
                      Sync routes to Strava instantly
                    </List.Item>
                    <List.Item icon={
                      <ThemeIcon size={20} radius="xl" color="orange" variant="light">
                        <Text size="xs">✓</Text>
                      </ThemeIcon>
                    }>
                      Analyze performance trends over time
                    </List.Item>
                  </List>
                </Stack>
              </Card>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6 }}>
              <Card
                withBorder
                h="100%"
                shadow="sm"
                padding={{ base: 'lg', md: 'xl' }}
                style={{
                  border: '3px solid #007CC3',
                  transition: 'transform 0.2s',
                }}
              >
                <Stack align="center" spacing="lg">
                  <ThemeIcon size={70} radius="xl" color="blue" variant="light">
                    <Watch size={36} />
                  </ThemeIcon>
                  <Title order={3} size="xl" ta="center">Garmin</Title>
                  <Text size="sm" c="dimmed" ta="center">
                    Seamlessly connect your Garmin bike computer for two-way sync
                  </Text>
                  <List spacing="sm" size="sm">
                    <List.Item icon={
                      <ThemeIcon size={20} radius="xl" color="blue" variant="light">
                        <Text size="xs">✓</Text>
                      </ThemeIcon>
                    }>
                      Upload rides from your device
                    </List.Item>
                    <List.Item icon={
                      <ThemeIcon size={20} radius="xl" color="blue" variant="light">
                        <Text size="xs">✓</Text>
                      </ThemeIcon>
                    }>
                      Export routes directly to Edge/Forerunner
                    </List.Item>
                    <List.Item icon={
                      <ThemeIcon size={20} radius="xl" color="blue" variant="light">
                        <Text size="xs">✓</Text>
                      </ThemeIcon>
                    }>
                      Full power, HR, and cadence data support
                    </List.Item>
                  </List>
                </Stack>
              </Card>
            </Grid.Col>
          </Grid>
        </Stack>
      </Box>

      <Divider style={{ borderColor: 'rgba(50, 205, 50, 0.3)' }} />

      {/* Features Section */}
      <Box py={{ base: 40, md: 80 }} px={{ base: 'lg', sm: 'xl', md: 60, lg: 80 }} id="features" style={{ backgroundColor: 'transparent', width: '100%' }}>
        <Stack spacing={60}>
          <Center>
            <Stack align="center" spacing="md">
              <Title order={2} size={32} ta="center">
                Everything You Need for Smarter Cycling
              </Title>
              <Text size="lg" c="dimmed" ta="center" maw={600}>
                From intelligent route planning to professional editing tools,
                performance analysis, and community features—all designed to help you
                discover better routes and ride with purpose.
              </Text>
            </Stack>
          </Center>

          <Grid>
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Grid.Col key={index} span={{ base: 12, md: 6, lg: 4 }}>
                  <Card shadow="sm" padding="lg" h="100%">
                    <Stack spacing="md">
                      <ThemeIcon size={50} color={feature.color} variant="light">
                        <Icon size={24} />
                      </ThemeIcon>
                      <Title order={4} size="lg" fw={600}>
                        {feature.title}
                      </Title>
                      <Text c="dimmed" size="sm" lh={1.5}>
                        {feature.description}
                      </Text>
                    </Stack>
                  </Card>
                </Grid.Col>
              );
            })}
          </Grid>
        </Stack>
      </Box>

      <Divider style={{ borderColor: 'rgba(50, 205, 50, 0.3)' }} />

      {/* Benefits Section */}
      <Box py={80} px={{ base: 'lg', sm: 'xl', md: 60, lg: 80 }} style={{ backgroundColor: 'transparent', width: '100%' }}>
        <Grid align="center">
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Stack spacing="xl">
              <Title order={2} size={32}>
                Stop Juggling Multiple Apps
              </Title>
              <Text size="lg" c="dimmed" lh={1.6}>
                Tired of paying for multiple cycling platforms and route builders?
                We've built the platform we wished existed—route planning, training analytics,
                and performance tracking in one affordable place.
              </Text>
              <List
                spacing="sm"
                size="md"
                icon={
                  <ThemeIcon size={20} color="green" variant="light">
                    <Star size={12} />
                  </ThemeIcon>
                }
              >
                {benefits.map((benefit, index) => (
                  <List.Item key={index}>{benefit}</List.Item>
                ))}
              </List>
              <Group>
                <Button
                  size="md"
                  onClick={onGetStarted}
                  leftSection={<ChevronRight size={18} />}
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #22d3ee 100%)',
                  }}
                >
                  Create Account
                </Button>
                <Button
                  size="md"
                  variant="outline"
                  onClick={onTryDemo}
                  leftSection={<Play size={18} />}
                >
                  Try Demo
                </Button>
              </Group>
            </Stack>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 6 }}>
            <Paper shadow="md" p="xl" style={{ backgroundColor: '#3d4e5e', borderColor: '#32CD32', border: '2px solid #32CD32' }}>
              <Stack spacing="lg">
                <Title order={3} size="lg" ta="center">
                  How It Works
                </Title>
                <Stack spacing="md">
                  <Flex align="center" gap="md">
                    <ThemeIcon size={32} color="blue" variant="filled">
                      <Text size="sm" fw={700}>1</Text>
                    </ThemeIcon>
                    <Text size="sm">Create an account (takes 30 seconds, no credit card)</Text>
                  </Flex>
                  <Flex align="center" gap="md">
                    <ThemeIcon size={32} color="blue" variant="filled">
                      <Text size="sm" fw={700}>2</Text>
                    </ThemeIcon>
                    <Text size="sm">Optionally connect Strava or Garmin to import your history</Text>
                  </Flex>
                  <Flex align="center" gap="md">
                    <ThemeIcon size={32} color="blue" variant="filled">
                      <Text size="sm" fw={700}>3</Text>
                    </ThemeIcon>
                    <Text size="sm">Build routes, track training, and monitor your progress</Text>
                  </Flex>
                  <Flex align="center" gap="md">
                    <ThemeIcon size={32} color="blue" variant="filled">
                      <Text size="sm" fw={700}>4</Text>
                    </ThemeIcon>
                    <Text size="sm">Lock in $4/month beta pricing (others will pay $8+)</Text>
                  </Flex>
                </Stack>
              </Stack>
            </Paper>
          </Grid.Col>
        </Grid>
      </Box>

      <Divider style={{ borderColor: 'rgba(50, 205, 50, 0.3)' }} />

      {/* Technical Highlights */}
      <Box py={80} px={{ base: 'lg', sm: 'xl', md: 60, lg: 80 }} style={{ backgroundColor: 'transparent', width: '100%' }}>
        <Center>
          <Stack align="center" spacing="xl" maw={800}>
            <Title order={2} size={32} ta="center">
              Currently in Beta
            </Title>
            <Text size="lg" c="dimmed" ta="center" lh={1.6}>
              We're actively building and improving based on user feedback. Join now to shape
              the product and lock in founding member pricing forever.
            </Text>

            <Grid mt="xl">
              <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                <Stack align="center" spacing="xs">
                  <ThemeIcon size={40} color="green" variant="light">
                    <Check size={20} />
                  </ThemeIcon>
                  <Text fw={600}>$4/month</Text>
                  <Text size="xs" c="dimmed" ta="center">Beta pricing locked forever</Text>
                </Stack>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                <Stack align="center" spacing="xs">
                  <ThemeIcon size={40} color="blue" variant="light">
                    <Users size={20} />
                  </ThemeIcon>
                  <Text fw={600}>Direct Access</Text>
                  <Text size="xs" c="dimmed" ta="center">Shape the product</Text>
                </Stack>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                <Stack align="center" spacing="xs">
                  <ThemeIcon size={40} color="orange" variant="light">
                    <Activity size={20} />
                  </ThemeIcon>
                  <Text fw={600}>Rapid Updates</Text>
                  <Text size="xs" c="dimmed" ta="center">Weekly improvements</Text>
                </Stack>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                <Stack align="center" spacing="xs">
                  <ThemeIcon size={40} color="purple" variant="light">
                    <Target size={20} />
                  </ThemeIcon>
                  <Text fw={600}>No Contracts</Text>
                  <Text size="xs" c="dimmed" ta="center">Cancel anytime</Text>
                </Stack>
              </Grid.Col>
            </Grid>
          </Stack>
        </Center>
      </Box>

      <Divider style={{ borderColor: 'rgba(50, 205, 50, 0.3)' }} />

      {/* CTA Section */}
      <Box py={80} px={{ base: 'lg', sm: 'xl', md: 60, lg: 80 }} style={{ backgroundColor: 'transparent', width: '100%' }}>
        <Center>
          <Stack align="center" spacing="xl" maw={600}>
            <Title order={2} size={32} ta="center">
              Join the Beta
            </Title>
            <Text size="lg" c="dimmed" ta="center" lh={1.6}>
              Be part of building the cycling platform we've all been waiting for.
              Lock in $4/month pricing forever. No credit card required to start.
            </Text>
            <Group>
              <Button
                size="xl"
                onClick={onGetStarted}
                leftSection={<ChevronRight size={24} />}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #22d3ee 100%)',
                }}
              >
                Create Free Account
              </Button>
              <Button
                size="xl"
                variant="outline"
                onClick={onTryDemo}
                leftSection={<Play size={24} />}
                style={{
                  borderColor: '#10b981',
                  color: '#10b981',
                }}
              >
                Try Demo
              </Button>
            </Group>
            <Text size="sm" c="dimmed">
              Free to start • $4/month beta pricing • Cancel anytime • Built by a cyclist in Boulder, CO
            </Text>
          </Stack>
        </Center>
      </Box>

      <Divider style={{ borderColor: 'rgba(50, 205, 50, 0.3)' }} />

      {/* Interactive Demo Section - Try It Out */}
      <Box py={{ base: 40, md: 60 }} px={{ base: 'lg', sm: 'xl', md: 60, lg: 80 }} id="demo" style={{ backgroundColor: 'rgba(26, 32, 44, 0.5)', width: '100%' }}>
        <Stack spacing="xl">
          <Stack align="center" spacing="md">
            <Title order={2} size={{ base: 28, md: 36 }} ta="center">
              Try It Out 🚴
            </Title>
            <Text size="lg" c="dimmed" ta="center" maw={700}>
              See how easy it is to generate a custom route. No sign-up required to try the demo.
            </Text>
          </Stack>

          {/* Interactive Route Demo Component */}
          <Box w="100%" maw={1200} mx="auto">
            <LandingRouteDemo onGetStarted={onGetStarted} />
          </Box>
        </Stack>
      </Box>

      {/* Footer */}
      <Box py={40} px={{ base: 'lg', sm: 'xl', md: 60, lg: 80 }} style={{ backgroundColor: '#1a202c', borderTop: '2px solid rgba(50, 205, 50, 0.3)', width: '100%' }}>
          <Stack spacing="md">
            <Center>
              <Group spacing="md">
                <Route size={24} color="#10b981" style={{ filter: 'drop-shadow(0 0 4px rgba(16, 185, 129, 0.3))' }} />
                <Text size="sm" c="dimmed">
                  © 2024 tribos.studio
                </Text>
              </Group>
            </Center>
            <Center>
              <Text size="xs" c="dimmed">
                Consolidating route planning, training tracking, and performance analytics
              </Text>
            </Center>
            <Center>
              <Text size="xs" c="dimmed">
                Questions? Email <a href="mailto:travis@tribos.studio" style={{ color: '#32CD32' }}>travis@tribos.studio</a>
              </Text>
            </Center>
            <Center>
              <Group spacing="lg">
                <Anchor href="/privacy" size="sm" style={{ color: '#32CD32' }}>
                  Privacy Policy
                </Anchor>
                <Anchor href="/terms" size="sm" style={{ color: '#32CD32' }}>
                  Terms of Service
                </Anchor>
                <Anchor href="mailto:travis@tribos.studio" size="sm" style={{ color: '#32CD32' }}>
                  Contact
                </Anchor>
              </Group>
            </Center>
          </Stack>
      </Box>

      {/* Beta Signup Modal */}
      <BetaSignup opened={betaModalOpened} onClose={() => setBetaModalOpened(false)} />

      {/* Sticky Bottom CTA Bar - Mobile Only */}
      <Box
        display={{ base: showStickyBar ? 'block' : 'none', sm: 'none' }}
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          backgroundColor: 'rgba(26, 32, 44, 0.95)',
          backdropFilter: 'blur(10px)',
          borderTop: '2px solid rgba(50, 205, 50, 0.5)',
          padding: '12px 16px',
          boxShadow: '0 -4px 12px rgba(50, 205, 50, 0.3)',
        }}
      >
        <Button
          size="md"
          fullWidth
          onClick={onGetStarted}
          leftSection={<Rocket size={18} />}
          style={{
            background: 'linear-gradient(135deg, #10b981 0%, #22d3ee 100%)',
            minHeight: '48px',
          }}
        >
          Get Started Free
        </Button>
      </Box>
    </Box>
  );
};

export default LandingPage;