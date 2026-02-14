import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  TextInput,
  Anchor,
  Badge,
  SimpleGrid,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconRoute,
  IconCheck,
  IconMail,
  IconChevronRight,
  IconTrendingUp,
  IconMapPin,
  IconHeart,
  IconBolt,
  IconUpload,
  IconBrandStrava,
  IconActivity,
  IconDeviceWatch,
} from '@tabler/icons-react';
import { tokens } from '../theme';
import { supabase } from '../lib/supabase';
import SEO, { getOrganizationSchema, getWebSiteSchema } from '../components/SEO';

function Landing() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [bottomEmail, setBottomEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bottomSubmitting, setBottomSubmitting] = useState(false);

  const handleBetaSignup = async (e, emailValue, setLoadingFn) => {
    e.preventDefault();

    if (!emailValue || !emailValue.includes('@')) {
      notifications.show({
        title: 'Invalid Email',
        message: 'Please enter a valid email address',
        color: 'terracotta',
      });
      return;
    }

    setLoadingFn(true);

    try {
      const { error } = await supabase
        .from('beta_signups')
        .insert([{
          email: emailValue,
          signed_up_at: new Date().toISOString(),
          status: 'pending'
        }]);

      if (error) {
        if (error.code === '23505') {
          notifications.show({
            title: 'Welcome Back!',
            message: "You're already on the list! Let's create your account...",
            color: 'blue',
          });
          navigate('/auth', { state: { email: emailValue, fromBetaSignup: true } });
        } else {
          throw error;
        }
      } else {
        // Beta signup saved - user will receive the branded confirmation email from Supabase
        // after they create their account on the auth page
        notifications.show({
          title: 'Welcome to the Beta!',
          message: "You're in! Let's create your account...",
          color: 'sage',
        });

        navigate('/auth', { state: { email: emailValue, fromBetaSignup: true } });
      }
    } catch (error) {
      console.error('Beta signup error:', error);
      notifications.show({
        title: 'Signup Failed',
        message: 'Please try again later',
        color: 'terracotta',
      });
    } finally {
      setLoadingFn(false);
    }
  };

  return (
    <>
      <SEO
        title="tribos.studio - AI-Powered Cycling Training App"
        description="Elevate your cycling performance with AI route planning, training analytics, and seamless device sync for Strava, Garmin, and Wahoo. Join the beta today."
        keywords="cycling training app, AI cycling routes, bike training planner, cycling analytics, strava integration, garmin connect, wahoo sync, cycling performance tracking"
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

      {/* HERO SECTION - User-Focused */}
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
                  Know Exactly What{' '}
                  <span
                    style={{
                      background: `linear-gradient(135deg, ${'var(--tribos-terracotta-500)'} 0%, #22d3ee 100%)`,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    Ride Your Body Needs
                  </span>
                  {' '}Today
                </Title>

                <Text size="xl" style={{ color: 'var(--tribos-text-secondary)' }}>
                  The cycling training app that combines training load analytics, AI route planning, and recovery tracking—finally in one place.
                </Text>

                {/* Beta Signup Form */}
                <Paper
                  p="md"
                  radius="md"
                  style={{
                    background: 'rgba(158, 90, 60, 0.05)',
                    border: `1px solid ${'var(--tribos-terracotta-500)'}30`,
                  }}
                >
                  <form onSubmit={(e) => handleBetaSignup(e, email, setSubmitting)}>
                    <Group gap="sm">
                      <TextInput
                        placeholder="your@email.com"
                        size="md"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        leftSection={<IconMail size={18} />}
                        style={{ flex: 1 }}
                        styles={{
                          input: {
                            backgroundColor: 'var(--tribos-bg-primary)',
                            borderColor: 'var(--tribos-border)',
                          },
                        }}
                      />
                      <Button
                        type="submit"
                        size="md"
                        color="terracotta"
                        loading={submitting}
                        rightSection={<IconChevronRight size={18} />}
                      >
                        Get Started for Free
                      </Button>
                    </Group>
                  </form>
                  <Group gap="lg" mt="xs">
                    <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                      <IconCheck size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> Free access
                    </Text>
                    <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                      <IconCheck size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> No credit card
                    </Text>
                  </Group>
                </Paper>
              </Stack>
            </Grid.Col>

            {/* Product Preview */}
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
                    TRAINING DASHBOARD PREVIEW
                  </Text>

                  {/* Mock Dashboard Stats */}
                  <SimpleGrid cols={{ base: 2 }} spacing="sm">
                    <Paper p="sm" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
                      <Text size="xs" c="dimmed">Today's Readiness</Text>
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

                  {/* Recommendation */}
                  <Paper p="sm" style={{ backgroundColor: 'var(--tribos-terracotta-500)' + '20', border: `1px solid ${'var(--tribos-terracotta-500)'}50` }}>
                    <Group gap="sm">
                      <ThemeIcon color="terracotta" variant="light" radius="xl">
                        <IconBolt size={16} />
                      </ThemeIcon>
                      <div>
                        <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
                          Today: Threshold intervals
                        </Text>
                        <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                          Your form is good for intensity work
                        </Text>
                      </div>
                    </Group>
                  </Paper>
                </Stack>
              </Paper>
            </Grid.Col>
          </Grid>
        </Container>
      </Box>

      {/* PROBLEM SECTION - Quick Pain Points */}
      <Box py={{ base: 40, md: 60 }} px={{ base: 'md', md: 'xl' }} style={{ backgroundColor: `${'var(--tribos-bg-secondary)'}50` }}>
        <Container size="md">
          <Stack align="center" gap="xl">
            <Title order={2} size={28} ta="center" style={{ color: 'var(--tribos-text-primary)' }}>
              Sound Familiar?
            </Title>

            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg">
              <Paper p="md" style={{ backgroundColor: 'rgba(158, 90, 60, 0.1)', border: '1px solid rgba(158, 90, 60, 0.2)', textAlign: 'center' }}>
                <Text size="lg" mb="xs">📊</Text>
                <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  "Strava shows me numbers but never tells me what to DO with them"
                </Text>
              </Paper>
              <Paper p="md" style={{ backgroundColor: 'rgba(158, 90, 60, 0.1)', border: '1px solid rgba(158, 90, 60, 0.2)', textAlign: 'center' }}>
                <Text size="lg" mb="xs">🗺️</Text>
                <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  "Route builders don't know if I'm fresh or cooked"
                </Text>
              </Paper>
              <Paper p="md" style={{ backgroundColor: 'rgba(158, 90, 60, 0.1)', border: '1px solid rgba(158, 90, 60, 0.2)', textAlign: 'center' }}>
                <Text size="lg" mb="xs">🔀</Text>
                <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  "I'm paying for 5 apps that don't talk to each other"
                </Text>
              </Paper>
            </SimpleGrid>

            <Text size="lg" ta="center" style={{ color: 'var(--tribos-terracotta-500)' }} fw={600}>
              tribos.studio brings it all together.
            </Text>
          </Stack>
        </Container>
      </Box>

      {/* PRODUCT SHOWCASE */}
      <Box py={{ base: 60, md: 80 }} px={{ base: 'md', md: 'xl' }}>
        <Container size="lg">
          <Stack gap={60}>
            {/* Training Analytics */}
            <Grid gutter="xl" align="center">
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Stack gap="md">
                  <Group gap="sm">
                    <ThemeIcon size={40} color="blue" variant="light">
                      <IconTrendingUp size={20} />
                    </ThemeIcon>
                    <Title order={3} style={{ color: 'var(--tribos-text-primary)' }}>
                      Cycling Analytics That Guide You
                    </Title>
                  </Group>
                  <Text style={{ color: 'var(--tribos-text-secondary)' }}>
                    CTL, ATL, TSB aren't just numbers—our cycling training app tells you what they mean for TODAY's ride.
                    Track your fitness trajectory and know exactly when to push and when to rest.
                  </Text>
                  <Stack gap="xs">
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Daily readiness recommendations</Text>
                    </Group>
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>TSS auto-calculated from power or HR</Text>
                    </Group>
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Long-term fitness trend visualization</Text>
                    </Group>
                  </Stack>
                </Stack>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Paper p="lg" style={{ backgroundColor: 'var(--tribos-bg-secondary)', border: `1px solid ${'var(--tribos-border)'}` }}>
                  <Text size="xs" c="dimmed" mb="md">FITNESS CHART</Text>
                  <Box style={{ height: 150, background: 'linear-gradient(90deg, rgba(158, 90, 60, 0.2) 0%, rgba(34, 211, 238, 0.2) 100%)', borderRadius: 8, display: 'flex', alignItems: 'flex-end', padding: 16, gap: 4 }}>
                    {[40, 55, 48, 62, 58, 70, 65, 75, 68, 80, 72, 85].map((h, i) => (
                      <Box key={i} style={{ flex: 1, height: `${h}%`, backgroundColor: i > 8 ? 'var(--tribos-terracotta-500)' : '#22d3ee', borderRadius: 2, opacity: 0.8 }} />
                    ))}
                  </Box>
                  <Group justify="space-between" mt="sm">
                    <Text size="xs" c="dimmed">12 weeks ago</Text>
                    <Text size="xs" c="dimmed">Today</Text>
                  </Group>
                </Paper>
              </Grid.Col>
            </Grid>

            <Divider style={{ borderColor: `${'var(--tribos-terracotta-500)'}20` }} />

            {/* Route Planning */}
            <Grid gutter="xl" align="center">
              <Grid.Col span={{ base: 12, md: 6 }} order={{ base: 2, md: 1 }}>
                <Paper p="lg" style={{ backgroundColor: 'var(--tribos-bg-secondary)', border: `1px solid ${'var(--tribos-border)'}` }}>
                  <Text size="xs" c="dimmed" mb="md">ROUTE BUILDER</Text>
                  <Box style={{ height: 180, background: `linear-gradient(135deg, rgba(168, 191, 168, 0.3) 0%, rgba(123, 169, 160, 0.3) 100%)`, borderRadius: 8, position: 'relative', overflow: 'hidden' }}>
                    <Box style={{ position: 'absolute', top: '30%', left: '10%', right: '10%', height: 3, background: 'var(--tribos-terracotta-500)', borderRadius: 2, transform: 'rotate(5deg)' }} />
                    <Box style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: 4 }}>
                      <Text size="xs" c="white">42.5 km • 650m elev</Text>
                    </Box>
                  </Box>
                </Paper>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }} order={{ base: 1, md: 2 }}>
                <Stack gap="md">
                  <Group gap="sm">
                    <ThemeIcon size={40} color="sage" variant="light">
                      <IconMapPin size={20} />
                    </ThemeIcon>
                    <Title order={3} style={{ color: 'var(--tribos-text-primary)' }}>
                      AI-Powered Route Planning
                    </Title>
                  </Group>
                  <Text style={{ color: 'var(--tribos-text-secondary)' }}>
                    Our bike training planner lets you build routes manually or use AI to generate cycling routes based on your fitness goals.
                    Professional editing tools with elevation profiles and surface analysis.
                  </Text>
                  <Stack gap="xs">
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>AI route generation based on your fitness</Text>
                    </Group>
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Export to Garmin, Wahoo, or GPX</Text>
                    </Group>
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Drag-and-drop route editing</Text>
                    </Group>
                  </Stack>
                </Stack>
              </Grid.Col>
            </Grid>

            <Divider style={{ borderColor: `${'var(--tribos-terracotta-500)'}20` }} />

            {/* Health & Recovery */}
            <Grid gutter="xl" align="center">
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Stack gap="md">
                  <Group gap="sm">
                    <ThemeIcon size={40} color="terracotta" variant="light">
                      <IconHeart size={20} />
                    </ThemeIcon>
                    <Title order={3} style={{ color: 'var(--tribos-text-primary)' }}>
                      Recovery Tracking
                    </Title>
                  </Group>
                  <Text style={{ color: 'var(--tribos-text-secondary)' }}>
                    Log sleep, HRV, and how you feel. We combine your health data with training
                    load to give smarter recommendations.
                  </Text>
                  <Stack gap="xs">
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Daily health check-ins</Text>
                    </Group>
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>HRV and resting HR tracking</Text>
                    </Group>
                    <Group gap="xs">
                      <IconCheck size={16} color={'var(--tribos-terracotta-500)'} />
                      <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>Readiness score calculation</Text>
                    </Group>
                  </Stack>
                </Stack>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
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
                </Paper>
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
              Works With Your Gear
            </Title>

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
                <Text size="xs" c="dimmed">Sync routes to device</Text>
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

      {/* FINAL CTA - Bottom Beta Signup */}
      <Box py={{ base: 60, md: 80 }} px={{ base: 'md', md: 'xl' }}>
        <Container size="sm">
          <Stack align="center" gap="xl">
            <Title order={2} size={32} ta="center" style={{ color: 'var(--tribos-text-primary)' }}>
              Ready to Train Smarter?
            </Title>
            <Text size="lg" ta="center" style={{ color: 'var(--tribos-text-secondary)' }}>
              Join the beta and help build the cycling platform we've all been waiting for.
            </Text>

            {/* Bottom Beta Signup Form */}
            <Paper
              p="xl"
              radius="lg"
              style={{
                background: `linear-gradient(135deg, rgba(158, 90, 60, 0.1) 0%, rgba(34, 211, 238, 0.1) 100%)`,
                border: `2px solid ${'var(--tribos-terracotta-500)'}40`,
                maxWidth: 500,
                width: '100%',
              }}
            >
              <form onSubmit={(e) => handleBetaSignup(e, bottomEmail, setBottomSubmitting)}>
                <Stack gap="md">
                  <TextInput
                    placeholder="your@email.com"
                    size="lg"
                    value={bottomEmail}
                    onChange={(e) => setBottomEmail(e.target.value)}
                    leftSection={<IconMail size={20} />}
                    styles={{
                      input: {
                        backgroundColor: 'var(--tribos-bg-primary)',
                        borderColor: 'var(--tribos-border)',
                      },
                    }}
                  />
                  <Button
                    type="submit"
                    size="lg"
                    color="terracotta"
                    loading={bottomSubmitting}
                    rightSection={<IconChevronRight size={20} />}
                    fullWidth
                  >
                    Get Started for Free
                  </Button>
                </Stack>
              </form>
            </Paper>

            <Text size="sm" style={{ color: 'var(--tribos-text-muted)' }}>
              Free to start • No credit card required
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
