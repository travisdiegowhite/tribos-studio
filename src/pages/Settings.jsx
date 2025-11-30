import { useState } from 'react';
import {
  Container,
  Title,
  Text,
  Card,
  Stack,
  Group,
  Button,
  TextInput,
  NumberInput,
  Select,
  Divider,
  Box,
  Badge,
  Switch,
} from '@mantine/core';
import { useAuth } from '../contexts/AuthContext';
import { tokens } from '../theme';
import AppShell from '../components/AppShell';

function Settings() {
  const { profile, user, signOut, updateProfile } = useAuth();
  const [loading, setLoading] = useState(false);

  // Form state
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [ftp, setFtp] = useState(profile?.ftp || '');
  const [weight, setWeight] = useState(profile?.weight || '');
  const [unit, setUnit] = useState(profile?.unit_preference || 'metric');

  const handleSaveProfile = async () => {
    setLoading(true);
    await updateProfile({
      full_name: fullName,
      ftp: ftp || null,
      weight: weight || null,
      unit_preference: unit,
    });
    setLoading(false);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  // Placeholder OAuth handlers
  const connectStrava = () => {
    const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID;
    if (!clientId) {
      alert('Strava client ID not configured');
      return;
    }
    const redirectUri = `${window.location.origin}/oauth/strava/callback`;
    const scope = 'read,activity:read_all,profile:read_all';
    window.location.href = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
  };

  const connectGarmin = () => {
    alert('Garmin Connect integration coming soon!');
  };

  const connectWahoo = () => {
    alert('Wahoo integration coming soon!');
  };

  return (
    <AppShell>
      <Container size="md" py="xl">
        <Stack gap="xl">
          <Box>
            <Title order={1} style={{ color: tokens.colors.textPrimary }}>
              Settings
            </Title>
            <Text style={{ color: tokens.colors.textSecondary }}>
              Manage your profile and connected services
            </Text>
          </Box>

          {/* Profile Settings */}
          <Card>
            <Stack gap="md">
              <Title order={3} style={{ color: tokens.colors.textPrimary }}>
                Profile
              </Title>

              <TextInput
                label="Full Name"
                placeholder="Your name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />

              <TextInput
                label="Email"
                value={user?.email || ''}
                disabled
                description="Email cannot be changed"
              />

              <Group grow>
                <NumberInput
                  label="FTP (Watts)"
                  placeholder="Enter your FTP"
                  value={ftp}
                  onChange={setFtp}
                  min={0}
                  max={500}
                />
                <NumberInput
                  label={`Weight (${unit === 'metric' ? 'kg' : 'lbs'})`}
                  placeholder="Enter your weight"
                  value={weight}
                  onChange={setWeight}
                  min={0}
                  max={200}
                  decimalScale={1}
                />
              </Group>

              <Select
                label="Units"
                value={unit}
                onChange={setUnit}
                data={[
                  { value: 'metric', label: 'Metric (km, kg)' },
                  { value: 'imperial', label: 'Imperial (mi, lbs)' },
                ]}
              />

              <Button color="lime" onClick={handleSaveProfile} loading={loading}>
                Save Changes
              </Button>
            </Stack>
          </Card>

          {/* Connected Services */}
          <Card>
            <Stack gap="md">
              <Title order={3} style={{ color: tokens.colors.textPrimary }}>
                Connected Services
              </Title>
              <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                Connect your cycling platforms to sync activities automatically
              </Text>

              <Divider />

              <ServiceConnection
                name="Strava"
                icon="🟠"
                connected={false}
                onConnect={connectStrava}
                onDisconnect={() => {}}
              />

              <Divider />

              <ServiceConnection
                name="Garmin Connect"
                icon="🔵"
                connected={false}
                onConnect={connectGarmin}
                onDisconnect={() => {}}
              />

              <Divider />

              <ServiceConnection
                name="Wahoo"
                icon="🔷"
                connected={false}
                onConnect={connectWahoo}
                onDisconnect={() => {}}
              />
            </Stack>
          </Card>

          {/* Preferences */}
          <Card>
            <Stack gap="md">
              <Title order={3} style={{ color: tokens.colors.textPrimary }}>
                Preferences
              </Title>

              <Group justify="space-between">
                <Box>
                  <Text style={{ color: tokens.colors.textPrimary }}>Email Notifications</Text>
                  <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                    Receive weekly training summaries
                  </Text>
                </Box>
                <Switch color="lime" />
              </Group>

              <Divider />

              <Group justify="space-between">
                <Box>
                  <Text style={{ color: tokens.colors.textPrimary }}>Auto-sync Activities</Text>
                  <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                    Automatically import new activities
                  </Text>
                </Box>
                <Switch color="lime" defaultChecked />
              </Group>
            </Stack>
          </Card>

          {/* Account Actions */}
          <Card>
            <Stack gap="md">
              <Title order={3} style={{ color: tokens.colors.textPrimary }}>
                Account
              </Title>

              <Button variant="outline" color="red" onClick={handleSignOut}>
                Sign Out
              </Button>
            </Stack>
          </Card>
        </Stack>
      </Container>
    </AppShell>
  );
}

function ServiceConnection({ name, icon, connected, onConnect, onDisconnect }) {
  return (
    <Group justify="space-between">
      <Group>
        <Text size="xl">{icon}</Text>
        <Box>
          <Text style={{ color: tokens.colors.textPrimary }}>{name}</Text>
          {connected && (
            <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
              Last synced: Just now
            </Text>
          )}
        </Box>
      </Group>
      <Group>
        {connected ? (
          <>
            <Badge color="green" variant="light">
              Connected
            </Badge>
            <Button variant="subtle" color="red" size="sm" onClick={onDisconnect}>
              Disconnect
            </Button>
          </>
        ) : (
          <Button variant="outline" color="lime" size="sm" onClick={onConnect}>
            Connect
          </Button>
        )}
      </Group>
    </Group>
  );
}

export default Settings;
