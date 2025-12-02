import React, { useState, useEffect } from 'react';
import {
  Paper,
  Text,
  Button,
  Group,
  Stack,
  Card,
  Badge,
  Alert,
  Loader,
  Center,
  Progress,
  Avatar,
  Tooltip,
  SimpleGrid,
  Modal,
  Select,
  NumberInput,
} from '@mantine/core';
import {
  Activity,
  MapPin,
  Calendar,
  TrendingUp,
  Download,
  RefreshCw,
  ExternalLink,
  CheckCircle,
  XCircle,
  Watch,
  History
} from 'lucide-react';
import garminService from '../utils/garminService';
import { supabase } from '../supabase';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const GarminIntegration = () => {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [integration, setIntegration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [lastSync, setLastSync] = useState(null);
  const [connecting, setConnecting] = useState(false);

  // Historical import modal state
  const [showHistoricalModal, setShowHistoricalModal] = useState(false);
  const [historicalPeriod, setHistoricalPeriod] = useState('1_year');
  const [customYears, setCustomYears] = useState(2);

  // Webhook diagnostics state
  const [webhookStats, setWebhookStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    checkConnection();
  }, []);

  const fetchWebhookStats = async () => {
    if (!connected) return;

    try {
      setLoadingStats(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/garmin-webhook-status', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        setWebhookStats(result.stats);
      }
    } catch (error) {
      console.error('Error fetching webhook stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    if (connected) {
      fetchWebhookStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  const checkConnection = async () => {
    try {
      setLoading(true);
      const isConnected = await garminService.isConnected();
      setConnected(isConnected);

      if (isConnected) {
        const integrationData = await garminService.getIntegration();
        setIntegration(integrationData);
        await checkLastSync();
      }
    } catch (error) {
      console.error('Error checking Garmin connection:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkLastSync = async () => {
    try {
      const history = await garminService.getSyncHistory(1);
      if (history && history.length > 0) {
        setLastSync(history[0]);
      }
    } catch (error) {
      console.error('Error checking last sync:', error);
    }
  };

  const handleConnect = async () => {
    if (!garminService.isConfigured()) {
      toast.error('Garmin integration not configured. Please check your environment variables.');
      return;
    }

    try {
      setConnecting(true);
      const authUrl = await garminService.initiateAuth();
      console.log('🔗 Redirecting to Garmin auth:', authUrl);
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error generating Garmin auth URL:', error);
      toast.error('Failed to initiate Garmin connection');
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await garminService.disconnect();
      setConnected(false);
      setIntegration(null);
      setLastSync(null);
      toast.success('Disconnected from Garmin Connect');
    } catch (error) {
      console.error('Error disconnecting Garmin:', error);
      toast.error('Failed to disconnect from Garmin');
    }
  };

  const handleSync = async () => {
    if (!connected) {
      toast.error('Please connect to Garmin first');
      return;
    }

    try {
      setSyncing(true);
      setSyncProgress(10);

      console.log('🚴 Starting Garmin activity sync...');

      const result = await garminService.syncActivities();

      setSyncProgress(100);

      if (result.imported === 0 && result.skipped === 0) {
        toast.info('No new activities found to import');
      } else {
        toast.success(
          `Successfully imported ${result.imported} new activities! (${result.skipped} skipped as duplicates)`
        );
      }

      await checkLastSync();

    } catch (error) {
      console.error('Error syncing Garmin activities:', error);
      toast.error('Failed to sync activities from Garmin');
    } finally {
      setSyncing(false);
      setSyncProgress(0);
    }
  };

  const handleHistoricalImport = async () => {
    if (!connected) {
      toast.error('Please connect to Garmin first');
      return;
    }

    try {
      setSyncing(true);
      setSyncProgress(10);
      setShowHistoricalModal(false);

      // Calculate date range based on selection
      let startDate;
      const endDate = new Date();

      switch (historicalPeriod) {
        case '3_months':
          startDate = new Date();
          startDate.setMonth(startDate.getMonth() - 3);
          break;
        case '6_months':
          startDate = new Date();
          startDate.setMonth(startDate.getMonth() - 6);
          break;
        case '1_year':
          startDate = new Date();
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        case '2_years':
          startDate = new Date();
          startDate.setFullYear(startDate.getFullYear() - 2);
          break;
        case 'custom':
          startDate = new Date();
          startDate.setFullYear(startDate.getFullYear() - customYears);
          break;
        default:
          startDate = new Date();
          startDate.setFullYear(startDate.getFullYear() - 1);
      }

      console.log(`🕐 Importing historical activities from ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}...`);

      toast.loading(`Requesting activities from ${startDate.toLocaleDateString()}...`, { id: 'historical-sync' });

      const result = await garminService.syncActivities({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });

      setSyncProgress(100);

      toast.dismiss('historical-sync');

      const totalDays = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));

      if (result.accepted > 0) {
        toast.success(
          `Backfill request sent for ${totalDays} days! Activities will appear as Garmin processes them. This may take several minutes.`,
          { duration: 8000 }
        );
      } else if (result.duplicate > 0) {
        toast.info('Backfill already in progress. Please wait for Garmin to process your activities.');
      } else if (result.errors > 0) {
        toast.error('Some backfill requests failed. Check console for details.');
      }

      await checkLastSync();

    } catch (error) {
      console.error('Error importing historical activities:', error);
      toast.error('Failed to request historical activities from Garmin');
    } finally {
      setSyncing(false);
      setSyncProgress(0);
    }
  };

  if (loading) {
    return (
      <Paper shadow="sm" p="md">
        <Center>
          <Loader />
        </Center>
      </Paper>
    );
  }

  const isDevelopment = process.env.NODE_ENV === 'development';

  return (
    <Stack gap="lg">
      {/* Development Mode Warning */}
      {isDevelopment && (
        <Alert color="yellow" title="Development Mode" variant="light">
          <Text size="sm">
            Garmin integration requires deployment to work. The OAuth API routes are serverless functions that only run on Vercel.
            Deploy to production to test the Garmin connection.
          </Text>
        </Alert>
      )}

      {/* Header */}
      <Group justify="space-between" align="center">
        <Group>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            backgroundColor: '#007CC3',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Watch size={24} color="white" />
          </div>
          <div>
            <Text size="lg" fw={600}>Garmin Connect</Text>
            <Text size="sm" c="dimmed">Edge • Forerunner • Fenix</Text>
          </div>
        </Group>

        {connected ? (
          <Badge color="green" leftSection={<CheckCircle size={12} />}>
            Connected
          </Badge>
        ) : (
          <Badge color="gray" leftSection={<XCircle size={12} />}>
            Not Connected
          </Badge>
        )}
      </Group>

      {!connected ? (
        /* Connection Card */
        <Card withBorder p="lg">
          <Stack align="center" gap="md">
            <div style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              backgroundColor: '#007CC3',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Watch size={48} color="white" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <Text size="xl" fw={600} mb="xs">Connect Your Garmin Device</Text>
              <Text size="sm" c="dimmed" mb="lg">
                Automatically sync rides from your Edge, Forerunner, or Fenix device to get personalized insights and route recommendations.
              </Text>
            </div>

            <Group gap="lg" style={{ textAlign: 'center' }}>
              <div>
                <MapPin size={20} color="#666" />
                <Text size="xs" mt="xs">GPS Routes</Text>
              </div>
              <div>
                <TrendingUp size={20} color="#666" />
                <Text size="xs" mt="xs">Power Data</Text>
              </div>
              <div>
                <Calendar size={20} color="#666" />
                <Text size="xs" mt="xs">Ride History</Text>
              </div>
            </Group>

            <Button
              size="lg"
              leftSection={connecting ? <Loader size={20} /> : <ExternalLink size={20} />}
              onClick={handleConnect}
              loading={connecting}
              disabled={connecting}
              style={{
                backgroundColor: '#007CC3',
                color: 'white'
              }}
            >
              {connecting ? 'Connecting...' : 'Connect to Garmin'}
            </Button>

            <Text size="xs" c="dimmed" style={{ textAlign: 'center' }}>
              We'll only access your workout data. Your privacy is our priority.
            </Text>
          </Stack>
        </Card>
      ) : (
        /* Connected State */
        <Stack gap="md">
          {/* Connection Info */}
          <Card withBorder p="md">
            <Group justify="space-between">
              <Group>
                <div style={{
                  width: 60,
                  height: 60,
                  borderRadius: '50%',
                  backgroundColor: '#007CC3',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Watch size={32} color="white" />
                </div>
                <div>
                  <Text size="lg" fw={600}>
                    Garmin Connected
                  </Text>
                  <Text size="sm" c="dimmed">
                    {integration?.provider_user_data?.email || 'Connected to Garmin Connect'}
                  </Text>
                  <Group gap="xs" mt="xs">
                    <Badge size="sm" variant="light" color="blue">
                      <Activity size={12} /> Garmin Connect
                    </Badge>
                  </Group>
                </div>
              </Group>

              <Button
                variant="light"
                color="red"
                onClick={handleDisconnect}
              >
                Disconnect
              </Button>
            </Group>
          </Card>

          {/* Sync Activities */}
          <Card withBorder p="md">
            <div>
              <Text size="md" fw={600} mb="xs">Sync Activities</Text>
              <Text size="sm" c="dimmed" mb="md">
                Import your rides from Garmin Connect
              </Text>
            </div>

            <Stack gap="md">
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <Tooltip label="Sync recent activities from Garmin (last 30 days)">
                  <Button
                    leftSection={syncing ? <Loader size={16} /> : <Download size={16} />}
                    onClick={handleSync}
                    loading={syncing}
                    disabled={syncing}
                    variant="filled"
                    fullWidth
                    style={{
                      backgroundColor: '#007CC3',
                      color: 'white'
                    }}
                  >
                    {syncing ? 'Syncing...' : 'Sync Recent'}
                  </Button>
                </Tooltip>

                <Tooltip label="Import activities from past months/years">
                  <Button
                    leftSection={<History size={16} />}
                    onClick={() => setShowHistoricalModal(true)}
                    disabled={syncing}
                    variant="outline"
                    color="blue"
                    fullWidth
                  >
                    Import Historical
                  </Button>
                </Tooltip>
              </SimpleGrid>

              <Alert color="blue" variant="light" icon={<Calendar size={16} />}>
                <Text size="xs">
                  <strong>Note:</strong> Garmin processes backfill requests in batches.
                  Historical activities may take 5-10 minutes to appear after requesting.
                </Text>
              </Alert>
            </Stack>

            {syncing && (
              <Progress value={syncProgress} size="sm" mt="md" color="blue" />
            )}

            {lastSync && (
              <Alert color="blue" variant="light" mt="md">
                <Text size="sm">
                  Last sync: {new Date(lastSync.synced_at).toLocaleString()}
                  {lastSync.activities_imported > 0 &&
                    ` (${lastSync.activities_imported} activities imported)`
                  }
                </Text>
              </Alert>
            )}
          </Card>

          {/* Import Status */}
          <Card withBorder p="md">
            <Group justify="space-between" mb="sm">
              <Text size="md" fw={600}>Auto-Import Status</Text>
              {loadingStats ? (
                <Loader size="xs" />
              ) : (
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={fetchWebhookStats}
                >
                  <RefreshCw size={14} />
                </Button>
              )}
            </Group>

            {webhookStats ? (
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Status:</Text>
                  {webhookStats.totalEvents > 0 ? (
                    <Badge size="sm" leftSection={<CheckCircle size={10} />} color="green">
                      Receiving Activities
                    </Badge>
                  ) : (
                    <Badge size="sm" leftSection={<XCircle size={10} />} color="orange">
                      Waiting for Activities
                    </Badge>
                  )}
                </Group>

                {webhookStats.processedEvents > 0 && (
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">Activities Imported:</Text>
                    <Text size="sm" fw={500} c="green">{webhookStats.processedEvents}</Text>
                  </Group>
                )}

                {webhookStats.recentEvents24h > 0 && (
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">Last 24 Hours:</Text>
                    <Text size="sm" fw={500}>{webhookStats.recentEvents24h}</Text>
                  </Group>
                )}

                {webhookStats.lastWebhook && (
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">Last Activity:</Text>
                    <Text size="sm" fw={500}>
                      {new Date(webhookStats.lastWebhook.receivedAt).toLocaleDateString()}
                    </Text>
                  </Group>
                )}

                {webhookStats.totalEvents === 0 && (
                  <Alert color="blue" variant="light" mt="xs">
                    <Text size="xs">
                      New activities will automatically import when you sync your Garmin device.
                      Complete a ride and sync to Garmin Connect to see it appear here.
                    </Text>
                  </Alert>
                )}

                <Alert color="gray" variant="light" mt="xs">
                  <Text size="xs" c="dimmed">
                    <strong>Note:</strong> Virtual rides (Zwift, TrainerRoad, etc.) are uploaded directly
                    to Garmin Connect and don't trigger auto-import. Use "Sync Recent" to manually
                    import these activities.
                  </Text>
                </Alert>
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">Loading import status...</Text>
            )}
          </Card>

          {/* Features */}
          <Card withBorder p="md">
            <Text size="md" fw={600} mb="sm">What you'll get:</Text>
            <Stack gap="xs">
              <Group>
                <CheckCircle size={16} color="green" />
                <Text size="sm">Complete GPS track data from your rides</Text>
              </Group>
              <Group>
                <CheckCircle size={16} color="green" />
                <Text size="sm">Power, heart rate, and cadence metrics</Text>
              </Group>
              <Group>
                <CheckCircle size={16} color="green" />
                <Text size="sm">Automatic route suggestions based on your riding style</Text>
              </Group>
              <Group>
                <CheckCircle size={16} color="green" />
                <Text size="sm">Performance analysis and insights</Text>
              </Group>
            </Stack>
          </Card>

          {/* Device Info */}
          <Card withBorder p="md" bg="blue.0">
            <Text size="sm" fw={600} mb="xs">Supported Devices</Text>
            <Text size="sm" c="dimmed">
              • Edge (all models)
              <br />
              • Forerunner (cycling activities)
              <br />
              • Fenix (cycling activities)
              <br />
              • Venu (cycling activities)
              <br />
              • All Garmin Connect compatible devices
            </Text>
            <Text size="xs" c="dimmed" mt="sm">
              Make sure your activities have synced to Garmin Connect
            </Text>
          </Card>
        </Stack>
      )}

      {/* Historical Import Modal */}
      <Modal
        opened={showHistoricalModal}
        onClose={() => setShowHistoricalModal(false)}
        title="Import Historical Activities"
        size="md"
      >
        <Stack gap="md">
          <Alert color="blue" variant="light">
            <Text size="sm">
              Select how far back you want to import activities from Garmin Connect.
              Activities will be sent via webhooks and may take several minutes to process.
            </Text>
          </Alert>

          <Alert color="orange" variant="light">
            <Text size="xs" fw={600} mb={4}>⚠️ Garmin Backfill Limitation:</Text>
            <Text size="xs">
              Garmin only allows backfill from the date you <strong>first registered your webhook</strong>.
              If you just connected recently, you can only import activities from that date forward.
              Check your Garmin Developer dashboard for your webhook registration date.
            </Text>
          </Alert>

          <Select
            label="Time Period"
            description="How far back to import activities"
            value={historicalPeriod}
            onChange={(value) => setHistoricalPeriod(value)}
            data={[
              { value: '3_months', label: 'Last 3 Months (if webhook registered 3+ months ago)' },
              { value: '6_months', label: 'Last 6 Months (if webhook registered 6+ months ago)' },
              { value: '1_year', label: 'Last 1 Year (if webhook registered 1+ year ago)' },
              { value: '2_years', label: 'Last 2 Years (if webhook registered 2+ years ago)' },
              { value: 'custom', label: 'Custom Period' }
            ]}
          />

          {historicalPeriod === 'custom' && (
            <NumberInput
              label="Years"
              description="Number of years to import"
              value={customYears}
              onChange={(value) => setCustomYears(value)}
              min={1}
              max={10}
              step={1}
            />
          )}

          <Alert color="yellow" variant="light">
            <Text size="xs">
              <strong>Processing Time:</strong> Garmin processes backfill requests in 30-day chunks.
              Large date ranges may take 10-30 minutes. The system adds delays between chunks to
              avoid rate limiting. Activities will appear gradually as Garmin sends them.
            </Text>
          </Alert>

          <Group justify="flex-end">
            <Button
              variant="subtle"
              onClick={() => setShowHistoricalModal(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleHistoricalImport}
              style={{
                backgroundColor: '#007CC3',
                color: 'white'
              }}
            >
              Start Import
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
};

export default GarminIntegration;
