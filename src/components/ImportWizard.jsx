import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Modal,
  Stepper,
  Button,
  Group,
  Text,
  Stack,
  Paper,
  Alert,
  Radio,
  Progress,
  Card,
  Badge,
  SimpleGrid,
  List,
  ThemeIcon,
  Loader,
} from '@mantine/core';
import {
  IconCheck,
  IconDownload,
  IconBolt,
  IconCalendar,
  IconAlertCircle,
  IconTrendingUp,
  IconCircleCheck,
  IconBrandStrava,
  IconDeviceWatch,
} from '@tabler/icons-react';
import { stravaService } from '../utils/stravaService';
import { garminService } from '../utils/garminService';
import { wahooService } from '../utils/wahooService';
import { tokens } from '../theme';

/**
 * Smart Import Wizard - Guides users through hybrid Strava + Device setup
 *
 * Step 1: Welcome + explain strategy
 * Step 2: Strava historical import
 * Step 3: Device auto-sync setup (Garmin or Wahoo)
 * Step 4: Complete
 */
const ImportWizard = ({ opened, onClose }) => {
  const navigate = useNavigate();
  const [active, setActive] = useState(0);
  const [historicalPeriod, setHistoricalPeriod] = useState('1_year');
  const [selectedDevice, setSelectedDevice] = useState('garmin');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState(null);
  const [importStatus, setImportStatus] = useState('');

  // Connection states
  const [stravaConnected, setStravaConnected] = useState(false);
  const [garminConnected, setGarminConnected] = useState(false);
  const [wahooConnected, setWahooConnected] = useState(false);
  const [checkingConnections, setCheckingConnections] = useState(true);

  useEffect(() => {
    if (opened) {
      checkConnections();
    }
  }, [opened]);

  const checkConnections = async () => {
    setCheckingConnections(true);
    try {
      const [strava, garmin, wahoo] = await Promise.all([
        stravaService.isConnected().catch(() => false),
        garminService.isConnected().catch(() => false),
        wahooService.getConnectionStatus().then(s => s.connected).catch(() => false),
      ]);
      setStravaConnected(strava);
      setGarminConnected(garmin);
      setWahooConnected(wahoo);
    } catch (error) {
      console.error('Error checking connections:', error);
    } finally {
      setCheckingConnections(false);
    }
  };

  const nextStep = () => setActive((current) => (current < 3 ? current + 1 : current));
  const prevStep = () => setActive((current) => (current > 0 ? current - 1 : current));

  const handleStravaConnect = () => {
    const authUrl = stravaService.getAuthorizationUrl();
    window.location.href = authUrl;
  };

  const handleDeviceConnect = async () => {
    try {
      if (selectedDevice === 'garmin') {
        const authUrl = await garminService.getAuthorizationUrl();
        window.location.href = authUrl;
      } else {
        const authUrl = wahooService.getAuthorizationUrl();
        window.location.href = authUrl;
      }
    } catch (error) {
      console.error('Error getting auth URL:', error);
    }
  };

  const handleStravaImport = async () => {
    setImporting(true);
    setImportProgress(5);
    setImportResults(null);
    setImportStatus('Connecting to Strava...');

    try {
      // Calculate date range
      let startDate = new Date();
      switch (historicalPeriod) {
        case '3_months':
          startDate.setMonth(startDate.getMonth() - 3);
          break;
        case '6_months':
          startDate.setMonth(startDate.getMonth() - 6);
          break;
        case '1_year':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        case '2_years':
          startDate.setFullYear(startDate.getFullYear() - 2);
          break;
        case 'all':
          startDate = new Date('2010-01-01');
          break;
        default:
          break;
      }

      setImportStatus('Syncing activities from Strava...');
      setImportProgress(20);

      // Use the sync all activities method
      let totalSynced = 0;
      const result = await stravaService.syncAllActivities((progress) => {
        setImportProgress(20 + (progress.page * 10));
        setImportStatus(`Syncing page ${progress.page}... (${progress.totalSynced} activities)`);
        totalSynced = progress.totalSynced;
      });

      setImportProgress(100);
      setImportStatus('Import complete!');
      setImportResults({
        imported: result.totalSynced,
        skipped: 0,
        errors: 0,
        totalActivities: result.totalSynced
      });

      if (result.totalSynced > 0) {
        setTimeout(() => nextStep(), 2000);
      }

    } catch (error) {
      console.error('Import error:', error);
      setImportResults({
        imported: 0,
        skipped: 0,
        errors: 1,
        errorMessage: error.message
      });
    } finally {
      setImporting(false);
      setImportStatus('');
    }
  };

  const deviceConnected = selectedDevice === 'garmin' ? garminConnected : wahooConnected;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Import Your Cycling History"
      size="lg"
      centered
      styles={{
        header: { backgroundColor: tokens.colors.bgPrimary },
        body: { backgroundColor: tokens.colors.bgPrimary },
        content: { backgroundColor: tokens.colors.bgPrimary },
      }}
    >
      {checkingConnections ? (
        <Stack align="center" py="xl">
          <Loader size="lg" />
          <Text size="sm" c="dimmed">Checking connections...</Text>
        </Stack>
      ) : (
        <Stepper active={active} onStepClick={setActive} size="sm">
          {/* Step 1: Welcome */}
          <Stepper.Step label="Welcome" description="Get started">
            <Stack gap="lg" mt="xl">
              <Alert color="blue" variant="light" icon={<IconTrendingUp size={20} />}>
                <Text size="sm" fw={600} mb={4}>
                  Smart Import Strategy
                </Text>
                <Text size="xs">
                  We'll help you import your complete cycling history and set up automatic syncing for future rides.
                </Text>
              </Alert>

              <Card withBorder p="md">
                <SimpleGrid cols={2} spacing="md">
                  <Stack gap="xs">
                    <Group gap="xs">
                      <ThemeIcon size="lg" radius="xl" color="orange" variant="light">
                        <IconDownload size={18} />
                      </ThemeIcon>
                      <div>
                        <Text size="sm" fw={600}>Step 1: Strava</Text>
                        <Text size="xs" c="dimmed">Import History</Text>
                      </div>
                    </Group>
                    <List size="xs" spacing="xs">
                      <List.Item>Import rides from any date</List.Item>
                      <List.Item>Up to 2 years of data</List.Item>
                      <List.Item>One-time setup</List.Item>
                    </List>
                  </Stack>

                  <Stack gap="xs">
                    <Group gap="xs">
                      <ThemeIcon size="lg" radius="xl" color="blue" variant="light">
                        <IconBolt size={18} />
                      </ThemeIcon>
                      <div>
                        <Text size="sm" fw={600}>Step 2: Device</Text>
                        <Text size="xs" c="dimmed">Auto-Sync</Text>
                      </div>
                    </Group>
                    <List size="xs" spacing="xs">
                      <List.Item>Automatic sync after rides</List.Item>
                      <List.Item>Garmin or Wahoo</List.Item>
                      <List.Item>Detailed metrics</List.Item>
                    </List>
                  </Stack>
                </SimpleGrid>
              </Card>

              <Alert color="cyan" variant="light" icon={<IconAlertCircle size={20} />}>
                <Text size="xs">
                  <strong>Why both?</strong> Strava excels at importing historical data, while your device
                  provides automatic real-time syncing. Together, you get complete history + effortless future updates!
                </Text>
              </Alert>

              <Group justify="flex-end" mt="xl">
                <Button onClick={nextStep} size="md" color="orange">
                  Get Started
                </Button>
              </Group>
            </Stack>
          </Stepper.Step>

          {/* Step 2: Strava Import */}
          <Stepper.Step label="Import History" description="From Strava">
            <Stack gap="md" mt="xl">
              {!stravaConnected ? (
                <>
                  <Alert color="orange" variant="light" icon={<IconBrandStrava size={20} />}>
                    <Text size="sm" fw={600}>Connect to Strava</Text>
                    <Text size="xs">
                      Connect your Strava account to import your historical rides.
                    </Text>
                  </Alert>
                  <Button
                    onClick={handleStravaConnect}
                    size="md"
                    fullWidth
                    style={{ backgroundColor: '#FC4C02', color: 'white' }}
                    leftSection={<IconBrandStrava size={18} />}
                  >
                    Connect Strava
                  </Button>
                </>
              ) : (
                <>
                  <Alert color="green" variant="light" icon={<IconCircleCheck size={20} />}>
                    <Text size="sm" fw={600}>Strava Connected</Text>
                  </Alert>

                  <Text size="sm" fw={500}>
                    How far back do you want to import activities?
                  </Text>

                  <Radio.Group value={historicalPeriod} onChange={setHistoricalPeriod}>
                    <Stack gap="xs">
                      <Radio value="3_months" label="Last 3 months" />
                      <Radio value="6_months" label="Last 6 months" />
                      <Radio
                        value="1_year"
                        label={
                          <Group gap="xs">
                            <Text>Last 1 year</Text>
                            <Badge size="xs" color="blue">Recommended</Badge>
                          </Group>
                        }
                      />
                      <Radio value="2_years" label="Last 2 years" />
                      <Radio value="all" label="All time (everything from Strava)" />
                    </Stack>
                  </Radio.Group>

                  {importing && (
                    <Paper withBorder p="md">
                      <Stack gap="xs">
                        <Group justify="space-between" align="center">
                          <Text size="sm" fw={500}>
                            Importing from Strava...
                          </Text>
                          <Badge color="orange" variant="light" size="sm">
                            {importProgress}%
                          </Badge>
                        </Group>
                        <Progress value={importProgress} animated color="orange" />
                        <Text size="xs" c="dimmed">
                          {importStatus || 'Fetching activities...'}
                        </Text>
                      </Stack>
                    </Paper>
                  )}

                  {importResults && importResults.imported > 0 && (
                    <Alert color="green" variant="light" icon={<IconCircleCheck size={20} />}>
                      <Text size="sm" fw={600}>Import Successful!</Text>
                      <Text size="xs">
                        Imported {importResults.imported} rides
                      </Text>
                    </Alert>
                  )}

                  {importResults && importResults.errors > 0 && (
                    <Alert color="red" variant="light" icon={<IconAlertCircle size={20} />}>
                      <Text size="sm" fw={600}>Import Failed</Text>
                      <Text size="xs">
                        {importResults.errorMessage || 'An error occurred during import.'}
                      </Text>
                    </Alert>
                  )}

                  <Button
                    onClick={handleStravaImport}
                    loading={importing}
                    disabled={importing}
                    size="md"
                    fullWidth
                    style={{ backgroundColor: '#FC4C02', color: 'white' }}
                  >
                    Start Import
                  </Button>
                </>
              )}

              <Group justify="space-between" mt="xl">
                <Button variant="subtle" onClick={prevStep}>
                  Back
                </Button>
                <Button variant="subtle" onClick={nextStep}>
                  Skip for Now
                </Button>
              </Group>
            </Stack>
          </Stepper.Step>

          {/* Step 3: Device Setup */}
          <Stepper.Step label="Auto-Sync" description="Device Setup">
            <Stack gap="md" mt="xl">
              {importResults && importResults.imported > 0 && (
                <Alert color="green" variant="light" icon={<IconCheck size={20} />}>
                  <Text size="sm" fw={600}>Historical rides imported from Strava</Text>
                  <Text size="xs">
                    Found {importResults.imported} rides from your selected time period
                  </Text>
                </Alert>
              )}

              <Text size="sm" fw={500}>
                Select your cycling computer for automatic syncing:
              </Text>

              <Radio.Group value={selectedDevice} onChange={setSelectedDevice}>
                <Stack gap="xs">
                  <Radio
                    value="garmin"
                    label={
                      <Group gap="xs">
                        <Text>Garmin Connect</Text>
                        {garminConnected && <Badge size="xs" color="green">Connected</Badge>}
                      </Group>
                    }
                    description="Edge devices, Fenix watches, and more"
                  />
                  <Radio
                    value="wahoo"
                    label={
                      <Group gap="xs">
                        <Text>Wahoo Fitness</Text>
                        {wahooConnected && <Badge size="xs" color="green">Connected</Badge>}
                      </Group>
                    }
                    description="ELEMNT BOLT, ROAM, RIVAL"
                  />
                </Stack>
              </Radio.Group>

              <Card withBorder p="md">
                <Stack gap="md">
                  <Group gap="xs">
                    <ThemeIcon size="xl" radius="xl" color="blue" variant="light">
                      <IconDeviceWatch size={24} />
                    </ThemeIcon>
                    <div>
                      <Text size="md" fw={600}>
                        {selectedDevice === 'garmin' ? 'Garmin' : 'Wahoo'} Auto-Sync
                      </Text>
                      <Text size="xs" c="dimmed">Automatic after each activity</Text>
                    </div>
                  </Group>

                  <List size="sm" spacing="xs">
                    <List.Item icon={<IconCheck size={16} color="green" />}>
                      Rides appear automatically after syncing your device
                    </List.Item>
                    <List.Item icon={<IconCheck size={16} color="green" />}>
                      No manual sync button needed
                    </List.Item>
                    <List.Item icon={<IconCheck size={16} color="green" />}>
                      Detailed metrics (power, cadence, heart rate)
                    </List.Item>
                  </List>
                </Stack>
              </Card>

              <Alert color="yellow" variant="light">
                <Text size="xs">
                  <strong>Note:</strong> Device auto-sync only works for activities from today forward.
                  That's why we imported your history from Strava first!
                </Text>
              </Alert>

              {!deviceConnected ? (
                <Button
                  onClick={handleDeviceConnect}
                  size="md"
                  fullWidth
                  color={selectedDevice === 'garmin' ? 'blue' : 'cyan'}
                  leftSection={<IconDeviceWatch size={18} />}
                >
                  Connect {selectedDevice === 'garmin' ? 'Garmin' : 'Wahoo'}
                </Button>
              ) : (
                <Alert color="green" variant="light" icon={<IconCircleCheck size={20} />}>
                  <Text size="sm" fw={600}>
                    {selectedDevice === 'garmin' ? 'Garmin' : 'Wahoo'} Connected
                  </Text>
                  <Text size="xs">
                    Your rides will sync automatically!
                  </Text>
                </Alert>
              )}

              <Group justify="space-between" mt="xl">
                <Button variant="subtle" onClick={prevStep}>
                  Back
                </Button>
                <Group>
                  <Button variant="subtle" onClick={nextStep}>
                    Skip for Now
                  </Button>
                  {deviceConnected && (
                    <Button onClick={nextStep} color="blue">
                      Continue
                    </Button>
                  )}
                </Group>
              </Group>
            </Stack>
          </Stepper.Step>

          {/* Step 4: Complete */}
          <Stepper.Completed>
            <Stack gap="lg" mt="xl" align="center">
              <ThemeIcon size={80} radius={80} color="green" variant="light">
                <IconCircleCheck size={48} />
              </ThemeIcon>

              <div style={{ textAlign: 'center' }}>
                <Text size="xl" fw={600} mb="xs">
                  You're All Set!
                </Text>
                <Text size="sm" c="dimmed">
                  Your cycling history is imported and auto-sync is configured
                </Text>
              </div>

              <Paper withBorder p="lg" w="100%">
                <Stack gap="md">
                  <Group>
                    <ThemeIcon size="lg" color={stravaConnected ? 'green' : 'gray'} variant="light">
                      <IconCheck size={20} />
                    </ThemeIcon>
                    <Text size="sm" fw={500}>
                      {importResults?.imported || 0} historical rides from Strava
                    </Text>
                  </Group>

                  <Group>
                    <ThemeIcon size="lg" color={deviceConnected ? 'green' : 'gray'} variant="light">
                      <IconCheck size={20} />
                    </ThemeIcon>
                    <Text size="sm" fw={500}>
                      {deviceConnected
                        ? `${selectedDevice === 'garmin' ? 'Garmin' : 'Wahoo'} auto-sync enabled`
                        : 'Device sync not configured'}
                    </Text>
                  </Group>
                </Stack>
              </Paper>

              <Alert color="blue" variant="light" w="100%">
                <Text size="xs">
                  Future rides will sync automatically when you upload them to your device app.
                  No manual sync needed!
                </Text>
              </Alert>

              <Button
                onClick={() => {
                  onClose();
                  navigate('/training');
                }}
                size="md"
                fullWidth
                color="blue"
              >
                View My Rides
              </Button>
            </Stack>
          </Stepper.Completed>
        </Stepper>
      )}
    </Modal>
  );
};

export default ImportWizard;
