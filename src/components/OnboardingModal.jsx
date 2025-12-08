import { useState, useEffect } from 'react';
import {
  Modal,
  Stepper,
  Button,
  Group,
  Text,
  Stack,
  Paper,
  Title,
  ThemeIcon,
  SimpleGrid,
  Badge,
  Box,
  NumberInput,
  Select,
  Divider,
} from '@mantine/core';
import {
  IconRocket,
  IconDeviceWatch,
  IconTarget,
  IconCheck,
  IconChevronRight,
  IconChevronLeft,
  IconRoute,
  IconActivity,
  IconBrandStrava,
} from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';
import { tokens } from '../theme';
import { stravaService } from '../utils/stravaService';
import { garminService } from '../utils/garminService';
import { wahooService } from '../utils/wahooService';

function OnboardingModal({ opened, onClose }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMarkedSeen, setHasMarkedSeen] = useState(false);

  // Form state
  const [ftp, setFtp] = useState(null);
  const [unitsPreference, setUnitsPreference] = useState('imperial');

  // Connection status
  const [stravaConnected, setStravaConnected] = useState(false);
  const [garminConnected, setGarminConnected] = useState(false);
  const [wahooConnected, setWahooConnected] = useState(false);

  // Mark onboarding as completed when modal is first shown
  // This ensures the popup only shows once, even if user closes it early
  useEffect(() => {
    const markOnboardingSeen = async () => {
      if (!user || !opened || hasMarkedSeen) return;

      try {
        await supabase
          .from('user_profiles')
          .upsert({
            id: user.id,
            onboarding_completed: true,
          });
        setHasMarkedSeen(true);
      } catch (err) {
        console.error('Error marking onboarding as seen:', err);
      }
    };

    markOnboardingSeen();
  }, [user, opened, hasMarkedSeen]);

  // Check connection status on mount
  useEffect(() => {
    const checkConnections = async () => {
      if (!user) return;

      try {
        const [stravaStatus, garminStatus, wahooStatus] = await Promise.all([
          stravaService.getConnectionStatus().catch(() => ({ connected: false })),
          garminService.getConnectionStatus().catch(() => ({ connected: false })),
          wahooService.getConnectionStatus().catch(() => ({ connected: false })),
        ]);

        setStravaConnected(stravaStatus.connected);
        setGarminConnected(garminStatus.connected);
        setWahooConnected(wahooStatus.connected);
      } catch (err) {
        console.error('Error checking connections:', err);
      }
    };

    if (opened) {
      checkConnections();
    }
  }, [user, opened]);

  const handleConnectStrava = () => {
    const authUrl = stravaService.getAuthorizationUrl();
    window.location.href = authUrl;
  };

  const handleConnectGarmin = async () => {
    if (!garminService.isConfigured()) return;
    const authUrl = await garminService.getAuthorizationUrl();
    window.location.href = authUrl;
  };

  const handleConnectWahoo = () => {
    if (!wahooService.isConfigured()) return;
    const authUrl = wahooService.getAuthorizationUrl();
    window.location.href = authUrl;
  };

  const handleSavePreferences = async () => {
    if (!user) return;

    setLoading(true);
    try {
      await supabase
        .from('user_profiles')
        .upsert({
          id: user.id,
          units_preference: unitsPreference,
          ftp: ftp || null,
          onboarding_completed: true,
        });
    } catch (err) {
      console.error('Error saving preferences:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    await handleSavePreferences();
    onClose();
  };

  const nextStep = () => {
    if (active === 2) {
      handleSavePreferences();
    }
    setActive((current) => (current < 3 ? current + 1 : current));
  };

  const prevStep = () => setActive((current) => (current > 0 ? current - 1 : current));

  const anyDeviceConnected = stravaConnected || garminConnected || wahooConnected;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      title={
        <Group gap="sm">
          <ThemeIcon color="lime" variant="light" size="lg">
            <IconRocket size={20} />
          </ThemeIcon>
          <Text fw={600} size="lg">Welcome to tribos.studio</Text>
          <Badge color="lime" variant="light">Beta</Badge>
        </Group>
      }
      closeOnClickOutside={false}
    >
      <Stepper active={active} onStepClick={setActive} color="lime" size="sm" mb="xl">
        <Stepper.Step label="Welcome" icon={<IconRocket size={18} />}>
          <Stack gap="lg" py="md">
            <Title order={3} style={{ color: tokens.colors.textPrimary }}>
              Thanks for joining the beta!
            </Title>

            <Text style={{ color: tokens.colors.textSecondary }}>
              tribos.studio helps you train smarter by combining route planning,
              training analytics, and recovery tracking in one place.
            </Text>

            <Paper p="md" style={{ backgroundColor: tokens.colors.bgTertiary }}>
              <Text size="sm" style={{ color: tokens.colors.textSecondary }} mb="sm">
                <strong>As a beta user, you'll get:</strong>
              </Text>
              <Stack gap="xs">
                <Group gap="xs">
                  <IconCheck size={16} color={tokens.colors.electricLime} />
                  <Text size="sm" style={{ color: tokens.colors.textPrimary }}>
                    Early access to all features
                  </Text>
                </Group>
                <Group gap="xs">
                  <IconCheck size={16} color={tokens.colors.electricLime} />
                  <Text size="sm" style={{ color: tokens.colors.textPrimary }}>
                    Direct line to Travis for feedback
                  </Text>
                </Group>
                <Group gap="xs">
                  <IconCheck size={16} color={tokens.colors.electricLime} />
                  <Text size="sm" style={{ color: tokens.colors.textPrimary }}>
                    Free access during the beta period
                  </Text>
                </Group>
              </Stack>
            </Paper>

            <Text size="sm" style={{ color: tokens.colors.textMuted }}>
              Let's get you set up in just a couple of steps.
            </Text>
          </Stack>
        </Stepper.Step>

        <Stepper.Step label="Connect" icon={<IconDeviceWatch size={18} />}>
          <Stack gap="lg" py="md">
            <Box>
              <Title order={3} style={{ color: tokens.colors.textPrimary }} mb="xs">
                Connect Your Devices
              </Title>
              <Text style={{ color: tokens.colors.textSecondary }}>
                Sync your activities from Strava, Garmin, or Wahoo to unlock training insights.
              </Text>
            </Box>

            <SimpleGrid cols={1} spacing="sm">
              <Paper
                p="md"
                withBorder
                style={{
                  borderColor: stravaConnected ? tokens.colors.electricLime : tokens.colors.borderDefault,
                  backgroundColor: stravaConnected ? `${tokens.colors.electricLime}10` : tokens.colors.bgSecondary,
                }}
              >
                <Group justify="space-between">
                  <Group gap="sm">
                    <ThemeIcon size="lg" color="orange" variant="light">
                      <IconActivity size={20} />
                    </ThemeIcon>
                    <Box>
                      <Text fw={500} style={{ color: tokens.colors.textPrimary }}>Strava</Text>
                      <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                        Import rides and activities
                      </Text>
                    </Box>
                  </Group>
                  {stravaConnected ? (
                    <Badge color="green" leftSection={<IconCheck size={12} />}>Connected</Badge>
                  ) : (
                    <Button size="xs" variant="light" color="orange" onClick={handleConnectStrava}>
                      Connect
                    </Button>
                  )}
                </Group>
              </Paper>

              <Paper
                p="md"
                withBorder
                style={{
                  borderColor: garminConnected ? tokens.colors.electricLime : tokens.colors.borderDefault,
                  backgroundColor: garminConnected ? `${tokens.colors.electricLime}10` : tokens.colors.bgSecondary,
                }}
              >
                <Group justify="space-between">
                  <Group gap="sm">
                    <ThemeIcon size="lg" color="blue" variant="light">
                      <IconDeviceWatch size={20} />
                    </ThemeIcon>
                    <Box>
                      <Text fw={500} style={{ color: tokens.colors.textPrimary }}>Garmin</Text>
                      <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                        Auto-sync from your Garmin device
                      </Text>
                    </Box>
                  </Group>
                  {garminConnected ? (
                    <Badge color="green" leftSection={<IconCheck size={12} />}>Connected</Badge>
                  ) : (
                    <Button size="xs" variant="light" color="blue" onClick={handleConnectGarmin}>
                      Connect
                    </Button>
                  )}
                </Group>
              </Paper>

              <Paper
                p="md"
                withBorder
                style={{
                  borderColor: wahooConnected ? tokens.colors.electricLime : tokens.colors.borderDefault,
                  backgroundColor: wahooConnected ? `${tokens.colors.electricLime}10` : tokens.colors.bgSecondary,
                }}
              >
                <Group justify="space-between">
                  <Group gap="sm">
                    <ThemeIcon size="lg" color="cyan" variant="light">
                      <IconDeviceWatch size={20} />
                    </ThemeIcon>
                    <Box>
                      <Text fw={500} style={{ color: tokens.colors.textPrimary }}>Wahoo</Text>
                      <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                        Sync with Wahoo devices
                      </Text>
                    </Box>
                  </Group>
                  {wahooConnected ? (
                    <Badge color="green" leftSection={<IconCheck size={12} />}>Connected</Badge>
                  ) : (
                    <Button size="xs" variant="light" color="cyan" onClick={handleConnectWahoo}>
                      Connect
                    </Button>
                  )}
                </Group>
              </Paper>
            </SimpleGrid>

            <Text size="xs" style={{ color: tokens.colors.textMuted }}>
              You can always connect more devices later in Settings.
            </Text>
          </Stack>
        </Stepper.Step>

        <Stepper.Step label="Preferences" icon={<IconTarget size={18} />}>
          <Stack gap="lg" py="md">
            <Box>
              <Title order={3} style={{ color: tokens.colors.textPrimary }} mb="xs">
                Set Your Preferences
              </Title>
              <Text style={{ color: tokens.colors.textSecondary }}>
                Help us personalize your experience.
              </Text>
            </Box>

            <Select
              label="Units Preference"
              description="How should we display distances and speeds?"
              value={unitsPreference}
              onChange={setUnitsPreference}
              data={[
                { value: 'metric', label: 'Metric (km, kg)' },
                { value: 'imperial', label: 'Imperial (mi, lbs)' },
              ]}
            />

            <NumberInput
              label="FTP (Functional Threshold Power)"
              description="Your 1-hour max sustainable power in watts. Leave blank if unsure."
              placeholder="e.g., 250"
              value={ftp || ''}
              onChange={(val) => setFtp(val || null)}
              min={50}
              max={600}
              suffix=" W"
            />

            <Paper p="sm" style={{ backgroundColor: tokens.colors.bgTertiary }}>
              <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                <strong>Tip:</strong> If you don't know your FTP, you can set it later.
                We can also estimate it from your ride data once you've connected a device.
              </Text>
            </Paper>
          </Stack>
        </Stepper.Step>

        <Stepper.Completed>
          <Stack gap="lg" py="md" align="center">
            <ThemeIcon size={80} radius="xl" color="lime" variant="light">
              <IconCheck size={40} />
            </ThemeIcon>

            <Title order={3} ta="center" style={{ color: tokens.colors.textPrimary }}>
              You're All Set!
            </Title>

            <Text ta="center" style={{ color: tokens.colors.textSecondary }}>
              Your account is ready. Here's what you can do next:
            </Text>

            <SimpleGrid cols={2} spacing="md" style={{ width: '100%' }}>
              <Paper
                p="md"
                withBorder
                style={{ backgroundColor: tokens.colors.bgSecondary, cursor: 'pointer' }}
                onClick={() => { onClose(); navigate('/routes/new'); }}
              >
                <Stack gap="xs" align="center">
                  <ThemeIcon size="lg" color="lime" variant="light">
                    <IconRoute size={20} />
                  </ThemeIcon>
                  <Text size="sm" fw={500} ta="center" style={{ color: tokens.colors.textPrimary }}>
                    Create a Route
                  </Text>
                </Stack>
              </Paper>

              <Paper
                p="md"
                withBorder
                style={{ backgroundColor: tokens.colors.bgSecondary, cursor: 'pointer' }}
                onClick={() => { onClose(); navigate('/training'); }}
              >
                <Stack gap="xs" align="center">
                  <ThemeIcon size="lg" color="blue" variant="light">
                    <IconActivity size={20} />
                  </ThemeIcon>
                  <Text size="sm" fw={500} ta="center" style={{ color: tokens.colors.textPrimary }}>
                    View Training
                  </Text>
                </Stack>
              </Paper>
            </SimpleGrid>

            <Text size="xs" style={{ color: tokens.colors.textMuted }}>
              Use the feedback button (bottom right) to send suggestions or report issues!
            </Text>
          </Stack>
        </Stepper.Completed>
      </Stepper>

      <Divider mb="md" />

      <Group justify="space-between">
        {active > 0 && active < 3 ? (
          <Button variant="subtle" onClick={prevStep} leftSection={<IconChevronLeft size={16} />}>
            Back
          </Button>
        ) : (
          <div />
        )}

        {active < 3 ? (
          <Button
            onClick={nextStep}
            rightSection={<IconChevronRight size={16} />}
            color="lime"
          >
            {active === 2 ? 'Finish Setup' : 'Continue'}
          </Button>
        ) : (
          <Button onClick={handleComplete} color="lime" loading={loading}>
            Go to Dashboard
          </Button>
        )}
      </Group>
    </Modal>
  );
}

export default OnboardingModal;
