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
  Modal,
  Alert,
  List,
  ThemeIcon,
} from '@mantine/core';
import { IconAlertTriangle, IconUpload, IconCheck, IconInfoCircle } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';
import { tokens } from '../theme';
import AppShell from '../components/AppShell.jsx';
import ImportWizard from '../components/ImportWizard.jsx';
import BulkGpxUploadModal from '../components/BulkGpxUploadModal.jsx';
import { ConnectWithStravaButton, PoweredByStrava, STRAVA_ORANGE } from '../components/StravaBranding';
import { stravaService } from '../utils/stravaService';
import { garminService } from '../utils/garminService';
import { wahooService } from '../utils/wahooService';
import { TIMEZONE_OPTIONS, getBrowserTimezone, getTimezoneOffset } from '../utils/timezoneUtils';

function Settings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [stravaStatus, setStravaStatus] = useState({ connected: false, loading: true });
  const [stravaSyncing, setStravaSyncing] = useState(false);
  const [speedProfile, setSpeedProfile] = useState(null);
  const [garminStatus, setGarminStatus] = useState({ connected: false, loading: true });
  const [garminWebhookStatus, setGarminWebhookStatus] = useState(null);
  const [garminSyncing, setGarminSyncing] = useState(false);
  const [garminRepairing, setGarminRepairing] = useState(false);
  const [garminRecovering, setGarminRecovering] = useState(false);
  const [garminDiagnosis, setGarminDiagnosis] = useState(null);
  const [garminBackfillingGps, setGarminBackfillingGps] = useState(false);
  const [wahooStatus, setWahooStatus] = useState({ connected: false, loading: true });
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [showStravaDisconnectModal, setShowStravaDisconnectModal] = useState(false);
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [location, setLocation] = useState('');
  const [bio, setBio] = useState('');
  const [unitsPreference, setUnitsPreference] = useState('imperial');
  const [timezone, setTimezone] = useState(() => getBrowserTimezone());
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
          setTimezone(data.timezone || getBrowserTimezone());
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
          timezone: timezone,
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
    navigate('/auth');
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

  const handleStravaDisconnectClick = () => {
    setShowStravaDisconnectModal(true);
  };

  const confirmStravaDisconnect = async () => {
    setShowStravaDisconnectModal(false);
    try {
      await stravaService.disconnect();
      setStravaStatus({ connected: false, loading: false });
      setSpeedProfile(null);
      notifications.show({
        title: 'Disconnected',
        message: 'Strava has been disconnected and all Strava-synced activities have been removed',
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
      setGarminWebhookStatus(null);
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

  const checkGarminWebhookStatus = async () => {
    try {
      const status = await garminService.getWebhookStatus();
      setGarminWebhookStatus(status.stats);
      console.log('Garmin Webhook Status:', status.stats);
    } catch (error) {
      console.error('Error checking Garmin webhook status:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to check webhook status',
        color: 'red',
      });
    }
  };

  const repairGarminConnection = async () => {
    setGarminRepairing(true);
    try {
      notifications.show({
        id: 'garmin-repair',
        title: 'Repairing Connection',
        message: 'Refreshing token and fetching Garmin User ID...',
        loading: true,
        autoClose: false
      });

      const result = await garminService.repairConnection();

      if (result.success) {
        notifications.update({
          id: 'garmin-repair',
          title: 'Connection Repaired!',
          message: 'Token refreshed and User ID fetched successfully.',
          color: 'lime',
          loading: false,
          autoClose: 5000
        });
        // Refresh status
        await checkGarminWebhookStatus();
        const status = await garminService.getConnectionStatus();
        setGarminStatus({ ...status, loading: false });
      } else {
        notifications.update({
          id: 'garmin-repair',
          title: 'Repair Failed',
          message: result.error || 'Please try disconnecting and reconnecting.',
          color: 'red',
          loading: false,
          autoClose: 5000
        });
      }
    } catch (error) {
      console.error('Error repairing Garmin connection:', error);
      notifications.update({
        id: 'garmin-repair',
        title: 'Repair Failed',
        message: error.message || 'Please try disconnecting and reconnecting.',
        color: 'red',
        loading: false,
        autoClose: 5000
      });
    } finally {
      setGarminRepairing(false);
    }
  };

  const recoverGarminActivities = async () => {
    setGarminRecovering(true);
    try {
      notifications.show({
        id: 'garmin-recover',
        title: 'Recovering Activities',
        message: 'Reprocessing failed webhook events...',
        loading: true,
        autoClose: false
      });

      const result = await garminService.reprocessFailedEvents();

      if (result.success) {
        const reprocessed = result.reprocessed || 0;
        const skipped = result.skipped || 0;
        const message = reprocessed > 0
          ? `Recovered ${reprocessed} ${reprocessed === 1 ? 'activity' : 'activities'}.${skipped > 0 ? ` (${skipped} skipped)` : ''}`
          : result.message || 'No failed events to recover.';

        notifications.update({
          id: 'garmin-recover',
          title: reprocessed > 0 ? 'Recovery Complete!' : 'Up to Date',
          message,
          color: reprocessed > 0 ? 'lime' : 'cyan',
          loading: false,
          autoClose: 5000
        });

        // Refresh webhook status
        await checkGarminWebhookStatus();
      } else {
        notifications.update({
          id: 'garmin-recover',
          title: 'Recovery Failed',
          message: result.error || 'Could not recover activities.',
          color: 'red',
          loading: false,
          autoClose: 5000
        });
      }
    } catch (error) {
      console.error('Error recovering Garmin activities:', error);
      notifications.update({
        id: 'garmin-recover',
        title: 'Recovery Failed',
        message: error.message || 'Failed to recover activities',
        color: 'red',
        loading: false,
        autoClose: 5000
      });
    } finally {
      setGarminRecovering(false);
    }
  };

  const diagnoseGarmin = async () => {
    try {
      notifications.show({
        id: 'garmin-diagnose',
        title: 'Diagnosing',
        message: 'Checking database for activities and webhooks...',
        loading: true,
        autoClose: false
      });

      const result = await garminService.diagnose();
      setGarminDiagnosis(result);

      notifications.update({
        id: 'garmin-diagnose',
        title: 'Diagnosis Complete',
        message: `Found ${result.activities?.count || 0} activities, ${result.webhookEvents?.count || 0} webhook events`,
        color: 'cyan',
        loading: false,
        autoClose: 3000
      });
    } catch (error) {
      console.error('Error diagnosing Garmin:', error);
      notifications.update({
        id: 'garmin-diagnose',
        title: 'Diagnosis Failed',
        message: error.message,
        color: 'red',
        loading: false,
        autoClose: 5000
      });
    }
  };

  const syncGarminActivities = async () => {
    setGarminSyncing(true);
    try {
      notifications.show({
        id: 'garmin-sync',
        title: 'Syncing Garmin Activities',
        message: 'Fetching your recent activities from Garmin...',
        loading: true,
        autoClose: false
      });

      // Use direct API fetch to sync activities (more reliable than webhook backfill)
      // syncRecentActivities directly calls Garmin API instead of waiting for webhooks
      const result = await garminService.syncRecentActivities(30);

      if (result.success) {
        // Show detailed results from direct API fetch
        const storedCount = result.stored || 0;
        const cyclingCount = result.cyclingActivities || 0;
        const message = storedCount > 0
          ? `Synced ${storedCount} cycling ${storedCount === 1 ? 'activity' : 'activities'} from Garmin.`
          : cyclingCount === 0
            ? 'No new cycling activities found in the last 30 days.'
            : 'All activities already synced.';

        notifications.update({
          id: 'garmin-sync',
          title: storedCount > 0 ? 'Sync Complete!' : 'Up to Date',
          message,
          color: storedCount > 0 ? 'lime' : 'cyan',
          loading: false,
          autoClose: 5000
        });
      } else {
        // API call failed
        notifications.update({
          id: 'garmin-sync',
          title: 'Sync Failed',
          message: result.error || 'Could not fetch activities from Garmin.',
          color: 'red',
          loading: false,
          autoClose: 8000
        });
      }

      // Refresh webhook status
      await checkGarminWebhookStatus();

    } catch (error) {
      console.error('Error syncing Garmin:', error);
      notifications.update({
        id: 'garmin-sync',
        title: 'Sync Failed',
        message: error.message || 'Failed to sync activities',
        color: 'red',
        loading: false,
        autoClose: 5000
      });
    } finally {
      setGarminSyncing(false);
    }
  };

  const backfillGarminGps = async () => {
    setGarminBackfillingGps(true);
    try {
      notifications.show({
        id: 'garmin-gps',
        title: 'Backfilling GPS Data',
        message: 'Downloading GPS tracks from Garmin FIT files...',
        loading: true,
        autoClose: false
      });

      const result = await garminService.backfillGps(50);

      if (result.success) {
        const { stats } = result;
        let message = '';

        if (stats.success > 0) {
          message = `Updated ${stats.success} ${stats.success === 1 ? 'activity' : 'activities'} with GPS data.`;
        } else if (stats.total === 0) {
          message = 'All outdoor activities already have GPS data!';
        } else if (stats.triggeredBackfill > 0) {
          message = `Requested fresh GPS data from Garmin for ${stats.triggeredBackfill} activities. Run again in 2-3 minutes.`;
        } else {
          message = result.note || 'No GPS data could be extracted.';
        }

        notifications.update({
          id: 'garmin-gps',
          title: stats.success > 0 ? 'GPS Backfill Complete!' : 'GPS Backfill',
          message,
          color: stats.success > 0 ? 'lime' : stats.triggeredBackfill > 0 ? 'cyan' : 'yellow',
          loading: false,
          autoClose: 8000
        });
      } else {
        notifications.update({
          id: 'garmin-gps',
          title: 'GPS Backfill Failed',
          message: result.error || 'Could not backfill GPS data.',
          color: 'red',
          loading: false,
          autoClose: 5000
        });
      }
    } catch (error) {
      console.error('Error backfilling GPS:', error);
      notifications.update({
        id: 'garmin-gps',
        title: 'GPS Backfill Failed',
        message: error.message || 'Failed to backfill GPS data',
        color: 'red',
        loading: false,
        autoClose: 5000
      });
    } finally {
      setGarminBackfillingGps(false);
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
      <ImportWizard opened={showImportWizard} onClose={() => setShowImportWizard(false)} />
      <BulkGpxUploadModal
        opened={showBulkUploadModal}
        onClose={() => setShowBulkUploadModal(false)}
        onUploadComplete={(results) => {
          if (results.success?.length > 0) {
            notifications.show({
              title: 'Import Complete',
              message: `Successfully imported ${results.success.length} activities`,
              color: 'green',
            });
          }
        }}
      />

      {/* Strava Disconnect Confirmation Modal */}
      <Modal
        opened={showStravaDisconnectModal}
        onClose={() => setShowStravaDisconnectModal(false)}
        title={
          <Group gap="sm">
            <IconAlertTriangle size={24} color="orange" />
            <Text fw={600}>Disconnect Strava?</Text>
          </Group>
        }
        centered
        size="md"
      >
        <Stack gap="md">
          <Alert color="orange" variant="light" icon={<IconAlertTriangle size={18} />}>
            <Text size="sm" fw={500}>
              This action will permanently delete all your Strava-synced activities and speed profile data.
            </Text>
          </Alert>

          <Text size="sm">
            Due to Strava's API agreement, we are required to delete your Strava data when you disconnect.
            This includes all activities, route data, and calculated metrics.
          </Text>

          <Box
            style={{
              padding: tokens.spacing.md,
              backgroundColor: tokens.colors.bgTertiary,
              borderRadius: tokens.radius.md,
            }}
          >
            <Group gap="sm" mb="xs">
              <IconUpload size={18} color={tokens.colors.electricLime} />
              <Text size="sm" fw={500} style={{ color: tokens.colors.textPrimary }}>
                Want to keep your data?
              </Text>
            </Group>
            <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
              Before disconnecting, export your data from Strava and import it using the{' '}
              <Text
                component="span"
                style={{ color: tokens.colors.electricLime, cursor: 'pointer' }}
                onClick={() => {
                  setShowStravaDisconnectModal(false);
                  setShowBulkUploadModal(true);
                }}
              >
                Bulk Import
              </Text>
              . This way your activities will remain available even after disconnecting Strava.
            </Text>
          </Box>

          <Group justify="flex-end" gap="sm" mt="md">
            <Button
              variant="subtle"
              color="gray"
              onClick={() => setShowStravaDisconnectModal(false)}
            >
              Cancel
            </Button>
            <Button
              color="red"
              onClick={confirmStravaDisconnect}
            >
              Disconnect & Delete Data
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Container size="md" py="xl">
        <Stack gap="xl">
          <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
            <Box>
              <Title order={1} style={{ color: tokens.colors.textPrimary }}>
                Settings
              </Title>
              <Text style={{ color: tokens.colors.textSecondary }}>
                Manage your profile and connected services
              </Text>
            </Box>
            <Button
              variant="gradient"
              gradient={{ from: 'orange', to: 'cyan', deg: 90 }}
              onClick={() => setShowImportWizard(true)}
            >
              Import Wizard
            </Button>
          </Group>

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

              <Select
                label="Timezone"
                description="Used for training calendar and workout scheduling"
                placeholder="Select your timezone"
                value={timezone}
                onChange={setTimezone}
                data={TIMEZONE_OPTIONS}
                searchable
                nothingFoundMessage="No timezone found"
                maxDropdownHeight={300}
              />
              {timezone && (
                <Text size="xs" c="dimmed" mt="-xs">
                  Current offset: {getTimezoneOffset(timezone)}
                </Text>
              )}

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

              {/* Strava Info Box */}
              <Alert
                icon={<IconInfoCircle size={18} />}
                title="About Strava Integration"
                color="blue"
                variant="light"
              >
                <Stack gap="xs">
                  <Text size="sm">
                    You can connect Strava to sync your ride history. However, due to Strava's API terms,
                    <strong> disconnecting will permanently delete all Strava-synced activities</strong>.
                  </Text>
                  <Text size="sm" fw={500}>
                    Recommended: Export your data from Strava and use bulk import instead:
                  </Text>
                  <List size="sm" spacing="xs">
                    <List.Item icon={<ThemeIcon color="green" size={20} radius="xl"><IconCheck size={12} /></ThemeIcon>}>
                      Your data stays even if you disconnect Strava later
                    </List.Item>
                    <List.Item icon={<ThemeIcon color="green" size={20} radius="xl"><IconCheck size={12} /></ThemeIcon>}>
                      Full historical data with GPS tracks and power data
                    </List.Item>
                    <List.Item icon={<ThemeIcon color="green" size={20} radius="xl"><IconCheck size={12} /></ThemeIcon>}>
                      Not subject to Strava's API restrictions
                    </List.Item>
                  </List>
                  <Text size="xs" c="dimmed">
                    To export: Go to Strava.com → Settings → My Account → Download or Delete Your Account → Request Your Archive
                  </Text>
                  <Button
                    variant="light"
                    color="lime"
                    size="sm"
                    leftSection={<IconUpload size={16} />}
                    onClick={() => setShowBulkUploadModal(true)}
                    mt="xs"
                  >
                    Bulk Import from Strava Export
                  </Button>
                </Stack>
              </Alert>

              <ServiceConnection
                name="Strava"
                icon="🟠"
                connected={stravaStatus.connected}
                username={stravaStatus.username}
                loading={stravaStatus.loading}
                onConnect={connectStrava}
                onDisconnect={handleStravaDisconnectClick}
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
                onSync={syncGarminActivities}
                syncing={garminSyncing}
                onCheckWebhook={checkGarminWebhookStatus}
                webhookStatus={garminWebhookStatus}
                onRepair={repairGarminConnection}
                repairing={garminRepairing}
                onRecover={recoverGarminActivities}
                recovering={garminRecovering}
                onDiagnose={diagnoseGarmin}
                diagnosis={garminDiagnosis}
                onBackfillGps={backfillGarminGps}
                backfillingGps={garminBackfillingGps}
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
                <Switch color="gray" />
              </Group>

              <Divider />

              <Group justify="space-between">
                <Box>
                  <Text style={{ color: tokens.colors.textPrimary }}>Auto-sync Activities</Text>
                  <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                    Automatically import new activities
                  </Text>
                </Box>
                <Switch color="gray" defaultChecked />
              </Group>
            </Stack>
          </Card>

          {/* Data & Privacy */}
          <Card>
            <Stack gap="md">
              <Title order={3} style={{ color: tokens.colors.textPrimary }}>
                Data & Privacy
              </Title>
              <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                Manage your data and understand how we use it
              </Text>

              <Divider />

              {/* Strava Data Info */}
              {stravaStatus.connected && (
                <Box
                  style={{
                    padding: tokens.spacing.md,
                    backgroundColor: tokens.colors.bgTertiary,
                    borderRadius: tokens.radius.md,
                  }}
                >
                  <Group justify="space-between" align="flex-start">
                    <Box>
                      <Text fw={500} style={{ color: tokens.colors.textPrimary }}>
                        Strava Data
                      </Text>
                      <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                        We store your activity data to calculate training metrics and speed profiles.
                        Per Strava's API agreement, your data is never shared with third parties.
                      </Text>
                      <Text size="xs" style={{ color: tokens.colors.textMuted }} mt="xs">
                        Disconnecting Strava will permanently delete all your Strava activities and speed profile data.
                      </Text>
                    </Box>
                  </Group>
                </Box>
              )}

              {/* Privacy Links */}
              <Group gap="md">
                <Button
                  variant="subtle"
                  color="gray"
                  size="sm"
                  component="a"
                  href="/privacy"
                  target="_blank"
                >
                  Privacy Policy
                </Button>
                <Button
                  variant="subtle"
                  color="gray"
                  size="sm"
                  component="a"
                  href="/terms"
                  target="_blank"
                >
                  Terms of Service
                </Button>
                <Button
                  variant="subtle"
                  color="gray"
                  size="sm"
                  component="a"
                  href="https://www.strava.com/legal/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Strava Privacy Policy
                </Button>
              </Group>

              {/* Contact */}
              <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                Questions or concerns?{' '}
                <a
                  href="mailto:travis@tribos.studio"
                  style={{ color: tokens.colors.textSecondary, textDecoration: 'underline' }}
                >
                  Contact us
                </a>
              </Text>
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

function ServiceConnection({ name, icon, connected, username, loading, onConnect, onDisconnect, onSync, syncing, speedProfile, onCheckWebhook, webhookStatus, onRepair, repairing, onRecover, recovering, onDiagnose, diagnosis, onBackfillGps, backfillingGps }) {
  const isStrava = name === 'Strava';

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
          ) : isStrava ? (
            <ConnectWithStravaButton onClick={onConnect} />
          ) : (
            <Button variant="outline" color="lime" size="sm" onClick={onConnect}>
              Connect
            </Button>
          )}
        </Group>
      </Group>

      {/* Sync Activities Button */}
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
                <Stack gap={4}>
                  <Text size="xs" style={{ color: tokens.colors.textSecondary }}>
                    {speedProfile.rides_analyzed} rides analyzed • Avg: {speedProfile.average_speed?.toFixed(1)} km/h
                  </Text>
                  {isStrava && <PoweredByStrava variant="light" size="sm" />}
                </Stack>
              ) : (
                <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                  {onCheckWebhook ? 'Sync last 90 days of activities' : 'Sync to calculate your speed profile'}
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

      {/* GPS Backfill (for Garmin when connected) */}
      {connected && onBackfillGps && (
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
                GPS Data
              </Text>
              <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                Download GPS tracks for activities missing map data
              </Text>
            </Box>
            <Button
              size="xs"
              color="cyan"
              variant="light"
              onClick={onBackfillGps}
              loading={backfillingGps}
            >
              {backfillingGps ? 'Downloading...' : 'Backfill GPS'}
            </Button>
          </Group>
        </Box>
      )}

      {/* Webhook Status (for Garmin when connected) */}
      {connected && onCheckWebhook && (
        <Box
          style={{
            backgroundColor: tokens.colors.bgTertiary,
            padding: tokens.spacing.sm,
            borderRadius: tokens.radius.sm,
            marginLeft: '2.5rem'
          }}
        >
          <Stack gap="xs">
            <Group justify="space-between" align="flex-start">
              <Box>
                <Text size="sm" style={{ color: tokens.colors.textPrimary }}>
                  Webhook Status
                </Text>
                <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                  Auto-sync when you complete rides
                </Text>
              </Box>
              <Button
                size="xs"
                color="cyan"
                variant="light"
                onClick={onCheckWebhook}
              >
                Check Status
              </Button>
            </Group>
            {webhookStatus && (
              <Box
                style={{
                  backgroundColor: tokens.colors.bgSecondary,
                  padding: tokens.spacing.xs,
                  borderRadius: tokens.radius.xs,
                  fontSize: '12px'
                }}
              >
                <Stack gap={4}>
                  <Group gap="xs">
                    <Text size="xs" style={{ color: tokens.colors.textSecondary }}>Garmin User ID:</Text>
                    <Text size="xs" style={{ color: webhookStatus.integration?.hasGarminUserId ? tokens.colors.electricLime : 'red' }}>
                      {webhookStatus.integration?.hasGarminUserId ? '✓ Set' : '✗ Missing'}
                    </Text>
                  </Group>
                  <Group gap="xs">
                    <Text size="xs" style={{ color: tokens.colors.textSecondary }}>Token Valid:</Text>
                    <Text size="xs" style={{ color: webhookStatus.integration?.tokenValid ? tokens.colors.electricLime : 'red' }}>
                      {webhookStatus.integration?.tokenValid ? '✓ Yes' : '✗ Expired'}
                    </Text>
                  </Group>
                  <Group gap="xs">
                    <Text size="xs" style={{ color: tokens.colors.textSecondary }}>Webhooks Received:</Text>
                    <Text size="xs" style={{ color: tokens.colors.textPrimary }}>
                      {webhookStatus.webhookStats?.totalEvents || 0}
                    </Text>
                  </Group>
                  {webhookStatus.troubleshooting?.length > 0 && (
                    <Box style={{ marginTop: 4 }}>
                      {webhookStatus.troubleshooting.map((tip, i) => (
                        <Text key={i} size="xs" style={{ color: 'orange' }}>
                          {tip}
                        </Text>
                      ))}
                    </Box>
                  )}
                  {onRepair && (!webhookStatus.integration?.tokenValid || !webhookStatus.integration?.hasGarminUserId) && (
                    <Button
                      size="xs"
                      variant="outline"
                      color="yellow"
                      onClick={onRepair}
                      loading={repairing}
                      style={{ marginTop: 8 }}
                    >
                      🔧 Repair Connection
                    </Button>
                  )}
                  {onRecover && webhookStatus.integration?.tokenValid && (
                    <Button
                      size="xs"
                      variant="outline"
                      color="orange"
                      onClick={onRecover}
                      loading={recovering}
                      style={{ marginTop: 8 }}
                    >
                      🔄 Recover Failed Events
                    </Button>
                  )}
                  {onDiagnose && (
                    <Button
                      size="xs"
                      variant="outline"
                      color="grape"
                      onClick={onDiagnose}
                      style={{ marginTop: 8 }}
                    >
                      🔍 Diagnose Sync Issues
                    </Button>
                  )}
                  {diagnosis && (
                    <Box
                      style={{
                        backgroundColor: tokens.colors.bgPrimary,
                        padding: tokens.spacing.sm,
                        borderRadius: tokens.radius.sm,
                        marginTop: 8,
                        fontSize: '11px',
                        maxHeight: '300px',
                        overflow: 'auto'
                      }}
                    >
                      <Text size="xs" fw={600} style={{ color: tokens.colors.textPrimary, marginBottom: 4 }}>
                        Diagnosis Results:
                      </Text>
                      <Text size="xs" style={{ color: tokens.colors.electricLime }}>
                        Activities in DB: {diagnosis.activities?.count || 0}
                      </Text>
                      <Text size="xs" style={{ color: tokens.colors.textSecondary }}>
                        Webhook Events: {diagnosis.summary?.totalWebhooks || 0}
                      </Text>
                      <Text size="xs" style={{ color: tokens.colors.textSecondary }}>
                        • PUSH events: {diagnosis.summary?.pushEvents || 0}
                      </Text>
                      <Text size="xs" style={{ color: tokens.colors.textSecondary }}>
                        • PING events: {diagnosis.summary?.pingEvents || 0}
                      </Text>
                      <Text size="xs" style={{ color: tokens.colors.textSecondary }}>
                        • With errors: {diagnosis.summary?.withErrors || 0}
                      </Text>
                      <Text size="xs" style={{ color: tokens.colors.textSecondary }}>
                        • Imported: {diagnosis.summary?.imported || 0}
                      </Text>
                      {diagnosis.webhookEvents?.analysis?.length > 0 && (
                        <>
                          <Text size="xs" fw={600} style={{ color: tokens.colors.textPrimary, marginTop: 8 }}>
                            Recent Events:
                          </Text>
                          {diagnosis.webhookEvents.analysis.slice(0, 5).map((event, i) => (
                            <Box key={i} style={{ marginTop: 4, paddingLeft: 8, borderLeft: `2px solid ${event.error ? 'red' : tokens.colors.electricLime}` }}>
                              <Text size="xs" style={{ color: tokens.colors.textPrimary }}>
                                {event.activityName || event.activity_id || 'Unknown'} - {event.activityType || 'N/A'}
                              </Text>
                              <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                                {event.dataSource} | {event.distance || 'No distance'}
                              </Text>
                              {event.error && (
                                <Text size="xs" style={{ color: 'red' }}>
                                  Error: {event.error}
                                </Text>
                              )}
                            </Box>
                          ))}
                        </>
                      )}
                    </Box>
                  )}
                </Stack>
              </Box>
            )}
          </Stack>
        </Box>
      )}
    </Stack>
  );
}

export default Settings;
