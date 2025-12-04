import { useState, useEffect } from 'react';
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
  Loader,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';
import { tokens } from '../theme';
import AppShell from '../components/AppShell.jsx';
import { stravaService } from '../utils/stravaService';
import { garminService } from '../utils/garminService';
import { wahooService } from '../utils/wahooService';

function Settings() {
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [stravaStatus, setStravaStatus] = useState({ connected: false, loading: true });
  const [stravaSyncing, setStravaSyncing] = useState(false);
  const [speedProfile, setSpeedProfile] = useState(null);
  const [garminStatus, setGarminStatus] = useState({ connected: false, loading: true });
  const [wahooStatus, setWahooStatus] = useState({ connected: false, loading: true });

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [location, setLocation] = useState('');
  const [bio, setBio] = useState('');
  const [unitsPreference, setUnitsPreference] = useState('imperial');
  const [ftp, setFtp] = useState(null);
  const [weightKg, setWeightKg] = useState(null);
  const [powerZones, setPowerZones] = useState(null);

  // Load profile data directly from Supabase
  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error loading profile:', error);
        } else if (data) {
          setDisplayName(data.display_name || '');
          setLocation(data.location || '');
          setBio(data.bio || '');
          setUnitsPreference(data.units_preference || 'imperial');
          setFtp(data.ftp || null);
          setWeightKg(data.weight_kg || null);
          setPowerZones(data.power_zones || null);
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      } finally {
        setProfileLoading(false);
      }
    };

    loadProfile();
  }, [user]);

  // Load Strava connection status and speed profile
  useEffect(() => {
    const loadStravaStatus = async () => {
      try {
        const status = await stravaService.getConnectionStatus();
        setStravaStatus({ ...status, loading: false });

        // Load speed profile if connected
        if (status.connected) {
          const profile = await stravaService.getSpeedProfile();
          setSpeedProfile(profile);
        }
      } catch (error) {
        console.error('Error loading Strava status:', error);
        setStravaStatus({ connected: false, loading: false });
      }
    };

    if (user) {
      loadStravaStatus();
    }
  }, [user]);

  // Load Garmin connection status
  useEffect(() => {
    const loadGarminStatus = async () => {
      try {
        const status = await garminService.getConnectionStatus();
        setGarminStatus({ ...status, loading: false });
      } catch (error) {
        console.error('Error loading Garmin status:', error);
        setGarminStatus({ connected: false, loading: false });
      }
    };

    if (user) {
      loadGarminStatus();
    }
  }, [user]);

  // Load Wahoo connection status
  useEffect(() => {
    const loadWahooStatus = async () => {
      try {
        const status = await wahooService.getConnectionStatus();
        setWahooStatus({ ...status, loading: false });
      } catch (error) {
        console.error('Error loading Wahoo status:', error);
        setWahooStatus({ connected: false, loading: false });
      }
    };

    if (user) {
      loadWahooStatus();
    }
  }, [user]);

  const handleSaveProfile = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .upsert({
          id: user.id,
          display_name: displayName,
          location: location,
          bio: bio,
          units_preference: unitsPreference,
          ftp: ftp || null,
          weight_kg: weightKg || null,
        })
        .select()
        .single();

      // Update local power zones from saved data (calculated by DB trigger)
      if (data?.power_zones) {
        setPowerZones(data.power_zones);
      }

      if (error) {
        console.error('Supabase error:', error);
        notifications.show({
          title: 'Error',
          message: error.message || 'Failed to update profile',
          color: 'red',
        });
      } else {
        notifications.show({
          title: 'Success',
          message: 'Profile updated successfully',
          color: 'green',
        });
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to update profile',
        color: 'red',
      });
    }
    setLoading(false);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  // OAuth handlers
  const connectStrava = () => {
    try {
      const authUrl = stravaService.getAuthorizationUrl();
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error connecting to Strava:', error);
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to connect to Strava',
        color: 'red',
      });
    }
  };

  const disconnectStrava = async () => {
    try {
      await stravaService.disconnect();
      setStravaStatus({ connected: false, loading: false });
      setSpeedProfile(null);
      notifications.show({
        title: 'Disconnected',
        message: 'Strava has been disconnected',
        color: 'green',
      });
    } catch (error) {
      console.error('Error disconnecting Strava:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to disconnect Strava',
        color: 'red',
      });
    }
  };

  const syncStravaActivities = async () => {
    setStravaSyncing(true);
    try {
      notifications.show({
        id: 'strava-sync',
        title: 'Syncing Activities',
        message: 'Fetching your recent rides from Strava...',
        loading: true,
        autoClose: false
      });

      const result = await stravaService.syncAllActivities((progress) => {
        notifications.update({
          id: 'strava-sync',
          title: 'Syncing Activities',
          message: `Page ${progress.page}... ${progress.totalSynced} activities synced`,
          loading: true,
          autoClose: false
        });
      });

      // Reload speed profile
      const profile = await stravaService.getSpeedProfile();
      setSpeedProfile(profile);

      notifications.update({
        id: 'strava-sync',
        title: 'Sync Complete!',
        message: `Synced ${result.totalSynced} activities. Speed profile ${profile ? 'updated' : 'needs more data'}.`,
        color: 'lime',
        loading: false,
        autoClose: 5000
      });
    } catch (error) {
      console.error('Error syncing Strava:', error);
      notifications.update({
        id: 'strava-sync',
        title: 'Sync Failed',
        message: error.message || 'Failed to sync activities',
        color: 'red',
        loading: false,
        autoClose: 5000
      });
    } finally {
      setStravaSyncing(false);
    }
  };

  const connectGarmin = async () => {
    try {
      if (!garminService.isConfigured()) {
        notifications.show({
          title: 'Not Configured',
          message: 'Garmin integration is not yet configured. Contact support.',
          color: 'yellow',
        });
        return;
      }
      const authUrl = await garminService.getAuthorizationUrl();
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error connecting to Garmin:', error);
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to connect to Garmin',
        color: 'red',
      });
    }
  };

  const disconnectGarmin = async () => {
    try {
      await garminService.disconnect();
      setGarminStatus({ connected: false, loading: false });
      notifications.show({
        title: 'Disconnected',
        message: 'Garmin has been disconnected',
        color: 'green',
      });
    } catch (error) {
      console.error('Error disconnecting Garmin:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to disconnect Garmin',
        color: 'red',
      });
    }
  };

  const connectWahoo = () => {
    try {
      if (!wahooService.isConfigured()) {
        notifications.show({
          title: 'Not Configured',
          message: 'Wahoo integration is not yet configured. Contact support.',
          color: 'yellow',
        });
        return;
      }
      const authUrl = wahooService.getAuthorizationUrl();
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error connecting to Wahoo:', error);
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to connect to Wahoo',
        color: 'red',
      });
    }
  };

  const disconnectWahoo = async () => {
    try {
      await wahooService.disconnect();
      setWahooStatus({ connected: false, loading: false });
      notifications.show({
        title: 'Disconnected',
        message: 'Wahoo has been disconnected',
        color: 'green',
      });
    } catch (error) {
      console.error('Error disconnecting Wahoo:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to disconnect Wahoo',
        color: 'red',
      });
    }
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
                label="Display Name"
                placeholder="Your display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />

              <TextInput
                label="Email"
                value={user?.email || ''}
                disabled
                description="Email cannot be changed"
              />

              <TextInput
                label="Location"
                placeholder="City, State"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />

              <TextInput
                label="Bio"
                placeholder="Tell us about yourself"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />

              <Select
                label="Units Preference"
                value={unitsPreference}
                onChange={setUnitsPreference}
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

          {/* Training & Power */}
          <Card>
            <Stack gap="md">
              <Title order={3} style={{ color: tokens.colors.textPrimary }}>
                Training & Power
              </Title>
              <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                Set your FTP to calculate personalized power zones
              </Text>

              <Group grow>
                <NumberInput
                  label="FTP (Functional Threshold Power)"
                  description="Your 1-hour max sustainable power in watts"
                  placeholder="e.g., 250"
                  value={ftp || ''}
                  onChange={(val) => setFtp(val || null)}
                  min={50}
                  max={600}
                  suffix=" W"
                />
                <NumberInput
                  label="Weight"
                  description="For W/kg calculations"
                  placeholder={unitsPreference === 'imperial' ? 'e.g., 165' : 'e.g., 75'}
                  value={unitsPreference === 'imperial' && weightKg ? Math.round(weightKg * 2.20462) : (weightKg || '')}
                  onChange={(val) => {
                    if (val) {
                      setWeightKg(unitsPreference === 'imperial' ? val / 2.20462 : val);
                    } else {
                      setWeightKg(null);
                    }
                  }}
                  min={30}
                  max={200}
                  suffix={unitsPreference === 'imperial' ? ' lbs' : ' kg'}
                  decimalScale={1}
                />
              </Group>

              {ftp && weightKg && (
                <Box
                  style={{
                    padding: tokens.spacing.sm,
                    backgroundColor: tokens.colors.bgTertiary,
                    borderRadius: tokens.radius.sm,
                  }}
                >
                  <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                    Your W/kg: <Text component="span" fw={700} style={{ color: tokens.colors.electricLime }}>
                      {(ftp / weightKg).toFixed(2)} W/kg
                    </Text>
                  </Text>
                </Box>
              )}

              {powerZones && (
                <Box>
                  <Text size="sm" fw={600} style={{ color: tokens.colors.textPrimary }} mb="xs">
                    Your Power Zones
                  </Text>
                  <Stack gap="xs">
                    {['z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7'].map((zoneKey, index) => {
                      const zone = powerZones[zoneKey];
                      if (!zone) return null;
                      const zoneColors = [
                        tokens.colors.zone1,
                        tokens.colors.zone2,
                        tokens.colors.zone3,
                        tokens.colors.zone4,
                        tokens.colors.zone5,
                        tokens.colors.zone6,
                        tokens.colors.zone7,
                      ];
                      return (
                        <Group key={zoneKey} gap="sm" wrap="nowrap">
                          <Badge
                            size="sm"
                            style={{ backgroundColor: zoneColors[index], minWidth: 35 }}
                          >
                            Z{index + 1}
                          </Badge>
                          <Text size="sm" style={{ color: tokens.colors.textPrimary, minWidth: 100 }}>
                            {zone.name}
                          </Text>
                          <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                            {zone.min}{zone.max ? `-${zone.max}` : '+'} W
                          </Text>
                        </Group>
                      );
                    })}
                  </Stack>
                </Box>
              )}

              {!ftp && (
                <Box
                  style={{
                    padding: tokens.spacing.md,
                    backgroundColor: tokens.colors.bgTertiary,
                    borderRadius: tokens.radius.md,
                    textAlign: 'center',
                  }}
                >
                  <Text size="sm" style={{ color: tokens.colors.textMuted }}>
                    Enter your FTP above to see your personalized power zones.
                    Not sure of your FTP? Try a 20-minute all-out effort and multiply by 0.95.
                  </Text>
                </Box>
              )}

              <Button color="lime" onClick={handleSaveProfile} loading={loading}>
                Save Training Settings
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
                connected={stravaStatus.connected}
                username={stravaStatus.username}
                loading={stravaStatus.loading}
                onConnect={connectStrava}
                onDisconnect={disconnectStrava}
                onSync={syncStravaActivities}
                syncing={stravaSyncing}
                speedProfile={speedProfile}
              />

              <Divider />

              <ServiceConnection
                name="Garmin Connect"
                icon="🔵"
                connected={garminStatus.connected}
                username={garminStatus.username}
                loading={garminStatus.loading}
                onConnect={connectGarmin}
                onDisconnect={disconnectGarmin}
              />

              <Divider />

              <ServiceConnection
                name="Wahoo"
                icon="🔷"
                connected={wahooStatus.connected}
                username={wahooStatus.username}
                loading={wahooStatus.loading}
                onConnect={connectWahoo}
                onDisconnect={disconnectWahoo}
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

function ServiceConnection({ name, icon, connected, username, loading, onConnect, onDisconnect, onSync, syncing, speedProfile }) {
  if (loading) {
    return (
      <Group justify="space-between">
        <Group>
          <Text size="xl">{icon}</Text>
          <Text style={{ color: tokens.colors.textPrimary }}>{name}</Text>
        </Group>
        <Loader size="sm" />
      </Group>
    );
  }

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Group>
          <Text size="xl">{icon}</Text>
          <Box>
            <Text style={{ color: tokens.colors.textPrimary }}>{name}</Text>
            {connected && username && (
              <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                Connected as {username}
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

      {/* Sync and Speed Profile (only for Strava when connected) */}
      {connected && onSync && (
        <Box
          style={{
            backgroundColor: tokens.colors.bgTertiary,
            padding: tokens.spacing.sm,
            borderRadius: tokens.radius.sm,
            marginLeft: '2.5rem'
          }}
        >
          <Group justify="space-between" align="flex-start">
            <Box>
              <Text size="sm" style={{ color: tokens.colors.textPrimary }}>
                Activity Sync
              </Text>
              {speedProfile ? (
                <Text size="xs" style={{ color: tokens.colors.textSecondary }}>
                  {speedProfile.rides_analyzed} rides analyzed • Avg: {speedProfile.average_speed?.toFixed(1)} km/h
                </Text>
              ) : (
                <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                  Sync to calculate your speed profile
                </Text>
              )}
            </Box>
            <Button
              size="xs"
              color="lime"
              variant="light"
              onClick={onSync}
              loading={syncing}
            >
              {syncing ? 'Syncing...' : 'Sync Activities'}
            </Button>
          </Group>
        </Box>
      )}
    </Stack>
  );
}

export default Settings;
