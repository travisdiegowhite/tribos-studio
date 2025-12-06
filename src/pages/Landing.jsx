import { useState, useEffect } from 'react';
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
  Card,
  ThemeIcon,
  Paper,
  List,
  Flex,
  Divider,
  Center,
  TextInput,
  Anchor,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconRoute,
  IconActivity,
  IconTrendingUp,
  IconMapPin,
  IconTarget,
  IconStar,
  IconCheck,
  IconMail,
  IconChevronRight,
  IconDeviceWatch,
  IconRocket,
} from '@tabler/icons-react';
import { tokens } from '../theme';
import { supabase } from '../lib/supabase';

function Landing() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const features = [
    {
      icon: IconMapPin,
      title: 'Smart Route Planning & Building',
      description: 'Build routes manually or let AI suggest routes based on your goals. Professional editing tools with elevation profiles and surface type analysis.',
      color: 'green',
    },
    {
      icon: IconActivity,
      title: 'Strava & Garmin Integration',
      description: 'Connect your existing data sources. Import rides automatically, sync routes to your devices, and track your complete cycling history.',
      color: 'orange',
    },
    {
      icon: IconTrendingUp,
      title: 'Training Analytics',
      description: 'Track CTL, ATL, and TSB with research-backed metrics. See your fitness trends, analyze performance, and understand your training load.',
      color: 'blue',
    },
    {
      icon: IconTarget,
      title: 'All-in-One Platform',
      description: 'Stop juggling multiple apps. Route planning, training tracking, and performance analytics—everything you need in one place.',
      color: 'violet',
    },
  ];

  const benefits = [
    'One platform instead of Strava + route builders + separate training tools',
    'Training analytics that actually help you decide what to do',
    'Routes tailored to your current fitness level',
    'Export to Garmin, Wahoo, or any GPS device',
    'Built by a cyclist who was frustrated with existing tools',
  ];

  const handleBetaSignup = async (e) => {
    e.preventDefault();

    if (!email || !email.includes('@')) {
      notifications.show({
        title: 'Invalid Email',
        message: 'Please enter a valid email address',
        color: 'red',
      });
      return;
    }

    setSubmitting(true);

    try {
      const { error } = await supabase
        .from('beta_signups')
        .insert([{
          email: email,
          signed_up_at: new Date().toISOString(),
          status: 'pending'
        }]);

      if (error) {
        if (error.code === '23505') {
          notifications.show({
            title: 'Already Signed Up',
            message: "You're already on the list! We'll be in touch soon.",
            color: 'blue',
          });
        } else {
          throw error;
        }
      } else {
        // Send welcome email
        try {
          const apiBase = import.meta.env.VITE_API_URL || '';
          await fetch(`${apiBase}/api/email?action=beta-notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
        } catch (emailErr) {
          console.error('Failed to send welcome email:', emailErr);
          // Don't fail the signup if email fails
        }

        setSubmitted(true);
        notifications.show({
          title: 'Welcome to the Beta!',
          message: "You're on the list! Check your inbox for a confirmation email.",
          color: 'green',
        });
      }
    } catch (error) {
      console.error('Beta signup error:', error);
      notifications.show({
        title: 'Signup Failed',
        message: 'Please try again later',
        color: 'red',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      style={{
        background: `radial-gradient(ellipse at top, rgba(190, 242, 100, 0.1) 0%, transparent 50%),
                     linear-gradient(180deg, ${tokens.colors.bgPrimary} 0%, ${tokens.colors.bgSecondary} 100%)`,
        minHeight: '100vh',
      }}
    >
      {/* Header */}
      <Box py="md" px={{ base: 'md', md: 'xl' }}>
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <IconRoute size={24} color={tokens.colors.electricLime} />
            <Text
              fw={700}
              size="lg"
              style={{
                color: tokens.colors.electricLime,
                letterSpacing: '-0.02em',
              }}
            >
              tribos.studio
            </Text>
          </Group>
          <Group gap="sm">
            <Button
              component={Link}
              to="/auth"
              variant="subtle"
              color="gray"
            >
              Sign In
            </Button>
            <Button
              component={Link}
              to="/auth"
              color="lime"
            >
              Get Started
            </Button>
          </Group>
        </Group>
      </Box>

      {/* Hero Section */}
      <Box py={{ base: 40, md: 80 }} px={{ base: 'md', md: 'xl' }}>
        <Container size="lg">
          <Stack gap="xl" align="center">
            <Stack gap="md" align="center">
              <Title
                order={1}
                ta="center"
                style={{
                  fontSize: 'clamp(2rem, 5vw, 3.5rem)',
                  color: tokens.colors.textPrimary,
                  lineHeight: 1.1,
                }}
              >
                Building the Cycling Platform{' '}
                <Text
                  span
                  style={{
                    background: `linear-gradient(135deg, ${tokens.colors.electricLime} 0%, #22d3ee 100%)`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  I Wish Existed
                </Text>
              </Title>

              <Text
                size="xl"
                ta="center"
                style={{ color: tokens.colors.textSecondary, maxWidth: 600 }}
              >
                Route planning, training analytics, and performance tracking—all in one place.
                No more juggling multiple apps.
              </Text>
            </Stack>

            {/* Beta Signup Form */}
            <Paper
              p="xl"
              radius="lg"
              style={{
                background: `linear-gradient(135deg, rgba(190, 242, 100, 0.1) 0%, rgba(34, 211, 238, 0.1) 100%)`,
                border: `2px solid ${tokens.colors.electricLime}40`,
                maxWidth: 500,
                width: '100%',
              }}
            >
              <Stack gap="md">
                <Stack gap="xs" align="center">
                  <ThemeIcon size={48} color="lime" variant="light" radius="xl">
                    <IconRocket size={24} />
                  </ThemeIcon>
                  <Title order={3} ta="center" style={{ color: tokens.colors.textPrimary }}>
                    Join the Beta
                  </Title>
                  <Text size="sm" ta="center" style={{ color: tokens.colors.textSecondary }}>
                    Be among the first to try tribos.studio. Get early access and help shape the product.
                  </Text>
                </Stack>

                {!submitted ? (
                  <form onSubmit={handleBetaSignup}>
                    <Stack gap="sm">
                      <TextInput
                        placeholder="your@email.com"
                        size="md"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        leftSection={<IconMail size={18} />}
                        styles={{
                          input: {
                            backgroundColor: tokens.colors.bgPrimary,
                            borderColor: tokens.colors.borderDefault,
                          },
                        }}
                      />
                      <Button
                        type="submit"
                        size="md"
                        color="lime"
                        loading={submitting}
                        rightSection={<IconChevronRight size={18} />}
                        fullWidth
                      >
                        Get Early Access
                      </Button>
                    </Stack>
                  </form>
                ) : (
                  <Stack align="center" gap="sm">
                    <ThemeIcon size={48} color="green" variant="light" radius="xl">
                      <IconCheck size={24} />
                    </ThemeIcon>
                    <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
                      You're on the list!
                    </Text>
                    <Text size="sm" ta="center" style={{ color: tokens.colors.textSecondary }}>
                      We'll send you access details soon. In the meantime, feel free to explore.
                    </Text>
                    <Button component={Link} to="/auth" color="lime" variant="light">
                      Create Account Now
                    </Button>
                  </Stack>
                )}

                <Group justify="center" gap="lg">
                  <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                    <IconCheck size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Free to start
                  </Text>
                  <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                    <IconCheck size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> No credit card
                  </Text>
                </Group>
              </Stack>
            </Paper>
          </Stack>
        </Container>
      </Box>

      <Divider style={{ borderColor: `${tokens.colors.electricLime}30` }} />

      {/* Why I'm Building This Section */}
      <Box py={{ base: 40, md: 80 }} px={{ base: 'md', md: 'xl' }} style={{ backgroundColor: `${tokens.colors.bgSecondary}80` }}>
        <Container size="lg">
          <Stack gap="xl">
            <Stack align="center" gap="md">
              <Title order={2} size={32} ta="center" style={{ color: tokens.colors.textPrimary }}>
                Here's Why I'm{' '}
                <Text
                  span
                  style={{
                    background: `linear-gradient(135deg, ${tokens.colors.electricLime} 0%, #22d3ee 100%)`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  Building This
                </Text>
              </Title>
              <Text size="lg" ta="center" style={{ color: tokens.colors.textSecondary, maxWidth: 600 }}>
                I've spent years frustrated with the tools we're forced to use. Let's fix this together.
              </Text>
            </Stack>

            <Grid gutter="xl">
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Stack gap="md">
                  <Title order={3} size="xl" mb="md" style={{ color: tokens.colors.textPrimary }}>
                    My Training App Frustrations:
                  </Title>
                  <Paper p="md" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                    <Group align="flex-start" gap="sm">
                      <Text size="xl">📊</Text>
                      <Stack gap={4} style={{ flex: 1 }}>
                        <Text fw={600} style={{ color: tokens.colors.textPrimary }}>Training platforms show CTL, ATL, TSB...</Text>
                        <Text size="sm" style={{ color: tokens.colors.textSecondary }}>But never tell me what to DO with those numbers at 5:30am</Text>
                      </Stack>
                    </Group>
                  </Paper>
                  <Paper p="md" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                    <Group align="flex-start" gap="sm">
                      <Text size="xl">🗺️</Text>
                      <Stack gap={4} style={{ flex: 1 }}>
                        <Text fw={600} style={{ color: tokens.colors.textPrimary }}>Route builders don't know MY fitness</Text>
                        <Text size="sm" style={{ color: tokens.colors.textSecondary }}>A 50-mile route hits different when you're cooked vs fresh</Text>
                      </Stack>
                    </Group>
                  </Paper>
                  <Paper p="md" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                    <Group align="flex-start" gap="sm">
                      <Text size="xl">🔀</Text>
                      <Stack gap={4} style={{ flex: 1 }}>
                        <Text fw={600} style={{ color: tokens.colors.textPrimary }}>Too many disconnected apps</Text>
                        <Text size="sm" style={{ color: tokens.colors.textSecondary }}>Multiple platforms that don't even talk to each other</Text>
                      </Stack>
                    </Group>
                  </Paper>
                </Stack>
              </Grid.Col>

              <Grid.Col span={{ base: 12, md: 6 }}>
                <Paper p="xl" style={{
                  background: `linear-gradient(135deg, rgba(190, 242, 100, 0.1) 0%, rgba(34, 211, 238, 0.1) 100%)`,
                  border: `2px solid ${tokens.colors.electricLime}40`,
                  height: '100%'
                }}>
                  <Title order={3} size="lg" mb="md" style={{ color: tokens.colors.textPrimary }}>
                    What Every Cyclist Actually Needs:
                  </Title>
                  <Stack gap="sm">
                    <Group align="flex-start" gap="xs">
                      <Text style={{ color: tokens.colors.electricLime }} fw={600}>→</Text>
                      <Text style={{ color: tokens.colors.textPrimary }}>Clear answer: train hard or rest today?</Text>
                    </Group>
                    <Group align="flex-start" gap="xs">
                      <Text style={{ color: tokens.colors.electricLime }} fw={600}>→</Text>
                      <Text style={{ color: tokens.colors.textPrimary }}>Routes that match your current fitness</Text>
                    </Group>
                    <Group align="flex-start" gap="xs">
                      <Text style={{ color: tokens.colors.electricLime }} fw={600}>→</Text>
                      <Text style={{ color: tokens.colors.textPrimary }}>One app that actually understands your training</Text>
                    </Group>
                    <Group align="flex-start" gap="xs">
                      <Text style={{ color: tokens.colors.electricLime }} fw={600}>→</Text>
                      <Text style={{ color: tokens.colors.textPrimary }}>Simple, affordable, no feature bloat</Text>
                    </Group>
                  </Stack>

                  <Paper mt="lg" p="md" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
                    <Text size="sm" style={{ color: tokens.colors.textSecondary }} fs="italic">
                      "If existing platforms had better guidance and smart routes, I wouldn't be building this.
                      But they don't. So here we are."
                    </Text>
                    <Text size="sm" fw={600} mt="xs" style={{ color: tokens.colors.textPrimary }}>
                      - Travis, Solo Developer & Cyclist
                    </Text>
                  </Paper>
                </Paper>
              </Grid.Col>
            </Grid>
          </Stack>
        </Container>
      </Box>

      <Divider style={{ borderColor: `${tokens.colors.electricLime}30` }} />

      {/* Connect Your Data Section */}
      <Box py={{ base: 40, md: 80 }} px={{ base: 'md', md: 'xl' }}>
        <Container size="lg">
          <Stack gap="xl">
            <Stack align="center" gap="md">
              <Title order={2} size={32} ta="center" style={{ color: tokens.colors.textPrimary }}>
                Connect Your Cycling Life 🔗
              </Title>
              <Text size="lg" ta="center" style={{ color: tokens.colors.textSecondary, maxWidth: 600 }}>
                Already tracking rides? Import them instantly and let our AI learn your riding style!
              </Text>
            </Stack>

            <Grid gutter="xl">
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Card
                  withBorder
                  h="100%"
                  padding="xl"
                  style={{
                    border: '3px solid #FC4C02',
                    backgroundColor: tokens.colors.bgSecondary,
                  }}
                >
                  <Stack align="center" gap="lg">
                    <ThemeIcon size={70} radius="xl" color="orange" variant="light">
                      <IconActivity size={36} />
                    </ThemeIcon>
                    <Title order={3} size="xl" ta="center" style={{ color: tokens.colors.textPrimary }}>Strava</Title>
                    <Text size="sm" ta="center" style={{ color: tokens.colors.textSecondary }}>
                      Connect your Strava account to unlock personalized route recommendations
                    </Text>
                    <List spacing="sm" size="sm" style={{ color: tokens.colors.textPrimary }}>
                      <List.Item icon={<ThemeIcon size={20} radius="xl" color="orange" variant="light"><IconCheck size={12} /></ThemeIcon>}>
                        Import all your activities automatically
                      </List.Item>
                      <List.Item icon={<ThemeIcon size={20} radius="xl" color="orange" variant="light"><IconCheck size={12} /></ThemeIcon>}>
                        Sync routes to Strava instantly
                      </List.Item>
                      <List.Item icon={<ThemeIcon size={20} radius="xl" color="orange" variant="light"><IconCheck size={12} /></ThemeIcon>}>
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
                  padding="xl"
                  style={{
                    border: '3px solid #007CC3',
                    backgroundColor: tokens.colors.bgSecondary,
                  }}
                >
                  <Stack align="center" gap="lg">
                    <ThemeIcon size={70} radius="xl" color="blue" variant="light">
                      <IconDeviceWatch size={36} />
                    </ThemeIcon>
                    <Title order={3} size="xl" ta="center" style={{ color: tokens.colors.textPrimary }}>Garmin</Title>
                    <Text size="sm" ta="center" style={{ color: tokens.colors.textSecondary }}>
                      Seamlessly connect your Garmin bike computer for two-way sync
                    </Text>
                    <List spacing="sm" size="sm" style={{ color: tokens.colors.textPrimary }}>
                      <List.Item icon={<ThemeIcon size={20} radius="xl" color="blue" variant="light"><IconCheck size={12} /></ThemeIcon>}>
                        Upload rides from your device
                      </List.Item>
                      <List.Item icon={<ThemeIcon size={20} radius="xl" color="blue" variant="light"><IconCheck size={12} /></ThemeIcon>}>
                        Export routes directly to Edge/Forerunner
                      </List.Item>
                      <List.Item icon={<ThemeIcon size={20} radius="xl" color="blue" variant="light"><IconCheck size={12} /></ThemeIcon>}>
                        Full power, HR, and cadence data support
                      </List.Item>
                    </List>
                  </Stack>
                </Card>
              </Grid.Col>
            </Grid>
          </Stack>
        </Container>
      </Box>

      <Divider style={{ borderColor: `${tokens.colors.electricLime}30` }} />

      {/* Features Section */}
      <Box py={{ base: 40, md: 80 }} px={{ base: 'md', md: 'xl' }} style={{ backgroundColor: `${tokens.colors.bgSecondary}80` }}>
        <Container size="lg">
          <Stack gap="xl">
            <Stack align="center" gap="md">
              <Title order={2} size={32} ta="center" style={{ color: tokens.colors.textPrimary }}>
                Everything You Need for Smarter Cycling
              </Title>
              <Text size="lg" ta="center" style={{ color: tokens.colors.textSecondary, maxWidth: 600 }}>
                From intelligent route planning to professional editing tools, performance analysis,
                and community features—all designed to help you ride with purpose.
              </Text>
            </Stack>

            <Grid gutter="lg">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <Grid.Col key={index} span={{ base: 12, sm: 6 }}>
                    <Card shadow="sm" padding="lg" h="100%" style={{ backgroundColor: tokens.colors.bgSecondary }}>
                      <Stack gap="md">
                        <ThemeIcon size={50} color={feature.color} variant="light">
                          <Icon size={24} />
                        </ThemeIcon>
                        <Title order={4} size="lg" fw={600} style={{ color: tokens.colors.textPrimary }}>
                          {feature.title}
                        </Title>
                        <Text size="sm" lh={1.5} style={{ color: tokens.colors.textSecondary }}>
                          {feature.description}
                        </Text>
                      </Stack>
                    </Card>
                  </Grid.Col>
                );
              })}
            </Grid>
          </Stack>
        </Container>
      </Box>

      <Divider style={{ borderColor: `${tokens.colors.electricLime}30` }} />

      {/* Benefits Section */}
      <Box py={{ base: 40, md: 80 }} px={{ base: 'md', md: 'xl' }}>
        <Container size="lg">
          <Grid align="center" gutter="xl">
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Stack gap="xl">
                <Title order={2} size={32} style={{ color: tokens.colors.textPrimary }}>
                  Stop Juggling Multiple Apps
                </Title>
                <Text size="lg" lh={1.6} style={{ color: tokens.colors.textSecondary }}>
                  Tired of paying for multiple cycling platforms and route builders?
                  We've built the platform we wished existed—route planning, training analytics,
                  and performance tracking in one place.
                </Text>
                <List
                  spacing="sm"
                  size="md"
                  icon={
                    <ThemeIcon size={20} color="lime" variant="light">
                      <IconStar size={12} />
                    </ThemeIcon>
                  }
                  style={{ color: tokens.colors.textPrimary }}
                >
                  {benefits.map((benefit, index) => (
                    <List.Item key={index}>{benefit}</List.Item>
                  ))}
                </List>
                <Group>
                  <Button
                    component={Link}
                    to="/auth"
                    size="md"
                    color="lime"
                    rightSection={<IconChevronRight size={18} />}
                  >
                    Get Started
                  </Button>
                </Group>
              </Stack>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6 }}>
              <Paper shadow="md" p="xl" style={{ backgroundColor: tokens.colors.bgSecondary, border: `2px solid ${tokens.colors.electricLime}` }}>
                <Stack gap="lg">
                  <Title order={3} size="lg" ta="center" style={{ color: tokens.colors.textPrimary }}>
                    How It Works
                  </Title>
                  <Stack gap="md">
                    <Flex align="center" gap="md">
                      <ThemeIcon size={32} color="lime" variant="filled">
                        <Text size="sm" fw={700}>1</Text>
                      </ThemeIcon>
                      <Text size="sm" style={{ color: tokens.colors.textPrimary }}>Create an account (takes 30 seconds, no credit card)</Text>
                    </Flex>
                    <Flex align="center" gap="md">
                      <ThemeIcon size={32} color="lime" variant="filled">
                        <Text size="sm" fw={700}>2</Text>
                      </ThemeIcon>
                      <Text size="sm" style={{ color: tokens.colors.textPrimary }}>Optionally connect Strava or Garmin to import your history</Text>
                    </Flex>
                    <Flex align="center" gap="md">
                      <ThemeIcon size={32} color="lime" variant="filled">
                        <Text size="sm" fw={700}>3</Text>
                      </ThemeIcon>
                      <Text size="sm" style={{ color: tokens.colors.textPrimary }}>Build routes, track training, and monitor your progress</Text>
                    </Flex>
                    <Flex align="center" gap="md">
                      <ThemeIcon size={32} color="lime" variant="filled">
                        <Text size="sm" fw={700}>4</Text>
                      </ThemeIcon>
                      <Text size="sm" style={{ color: tokens.colors.textPrimary }}>Help shape the product with your feedback</Text>
                    </Flex>
                  </Stack>
                </Stack>
              </Paper>
            </Grid.Col>
          </Grid>
        </Container>
      </Box>

      <Divider style={{ borderColor: `${tokens.colors.electricLime}30` }} />

      {/* Final CTA */}
      <Box py={{ base: 40, md: 80 }} px={{ base: 'md', md: 'xl' }} style={{ backgroundColor: `${tokens.colors.bgSecondary}80` }}>
        <Container size="sm">
          <Stack align="center" gap="xl">
            <Title order={2} size={32} ta="center" style={{ color: tokens.colors.textPrimary }}>
              Ready to Ride Smarter?
            </Title>
            <Text size="lg" ta="center" lh={1.6} style={{ color: tokens.colors.textSecondary }}>
              Join the beta and help build the cycling platform we've all been waiting for.
            </Text>
            <Group>
              <Button
                component={Link}
                to="/auth"
                size="xl"
                color="lime"
                rightSection={<IconChevronRight size={24} />}
              >
                Get Started Free
              </Button>
            </Group>
            <Text size="sm" style={{ color: tokens.colors.textMuted }}>
              Free to start • No credit card required • Cancel anytime
            </Text>
          </Stack>
        </Container>
      </Box>

      {/* Footer */}
      <Box py={40} px={{ base: 'md', md: 'xl' }} style={{ backgroundColor: tokens.colors.bgPrimary, borderTop: `2px solid ${tokens.colors.electricLime}30` }}>
        <Container size="lg">
          <Stack gap="md">
            <Center>
              <Group gap="md">
                <IconRoute size={24} color={tokens.colors.electricLime} />
                <Text size="sm" style={{ color: tokens.colors.textMuted }}>
                  © 2024 tribos.studio
                </Text>
              </Group>
            </Center>
            <Center>
              <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                Route planning, training tracking, and performance analytics for cyclists
              </Text>
            </Center>
            <Center>
              <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                Questions? Email <a href="mailto:travis@tribos.studio" style={{ color: tokens.colors.electricLime }}>travis@tribos.studio</a>
              </Text>
            </Center>
            <Center>
              <Group gap="lg">
                <Anchor href="/privacy" size="sm" style={{ color: tokens.colors.electricLime }}>
                  Privacy Policy
                </Anchor>
                <Anchor href="/terms" size="sm" style={{ color: tokens.colors.electricLime }}>
                  Terms of Service
                </Anchor>
                <Anchor href="mailto:travis@tribos.studio" size="sm" style={{ color: tokens.colors.electricLime }}>
                  Contact
                </Anchor>
              </Group>
            </Center>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}

export default Landing;
