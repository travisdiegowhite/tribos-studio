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
  Zap
} from 'lucide-react';
import wahooService from '../utils/wahooService';
import { supabase } from '../supabase';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const WahooIntegration = () => {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [integration, setIntegration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [lastSync, setLastSync] = useState(null);

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      setLoading(true);
      const isConnected = await wahooService.isConnected();
      setConnected(isConnected);

      if (isConnected) {
        const integrationData = await wahooService.getIntegration();
        setIntegration(integrationData);
        await checkLastSync();
      }
    } catch (error) {
      console.error('Error checking Wahoo connection:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkLastSync = async () => {
    try {
      const history = await wahooService.getSyncHistory(1);
      if (history && history.length > 0) {
        setLastSync(history[0]);
      }
    } catch (error) {
      console.error('Error checking last sync:', error);
    }
  };

  const handleConnect = () => {
    if (!wahooService.isConfigured()) {
      toast.error('Wahoo integration not configured. Please check your environment variables.');
      return;
    }

    try {
      const authUrl = wahooService.getAuthorizationUrl();
      console.log('🔗 Redirecting to Wahoo auth:', authUrl);
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error generating Wahoo auth URL:', error);
      toast.error('Failed to initiate Wahoo connection');
    }
  };

  const handleDisconnect = async () => {
    try {
      await wahooService.disconnect();
      setConnected(false);
      setIntegration(null);
      setLastSync(null);
      toast.success('Disconnected from Wahoo Fitness');
    } catch (error) {
      console.error('Error disconnecting Wahoo:', error);
      toast.error('Failed to disconnect from Wahoo');
    }
  };

  const handleSync = async () => {
    if (!connected) {
      toast.error('Please connect to Wahoo first');
      return;
    }

    try {
      setSyncing(true);
      setSyncProgress(10);

      console.log('🚴 Starting Wahoo activity sync...');

      const result = await wahooService.syncWorkouts();

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
      console.error('Error syncing Wahoo activities:', error);
      toast.error('Failed to sync activities from Wahoo');
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
            Wahoo integration requires deployment to work. The OAuth API routes are serverless functions that only run on Vercel.
            Deploy to production to test the Wahoo connection.
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
            backgroundColor: '#00D4FF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Zap size={24} color="white" />
          </div>
          <div>
            <Text size="lg" fw={600}>Wahoo Fitness</Text>
            <Text size="sm" c="dimmed">ELEMNT • ROAM • BOLT</Text>
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
              backgroundColor: '#00D4FF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Zap size={48} color="white" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <Text size="xl" fw={600} mb="xs">Connect Your Wahoo Device</Text>
              <Text size="sm" c="dimmed" mb="lg">
                Automatically sync rides from your ELEMNT, ROAM, or BOLT computer to get personalized insights and route recommendations.
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
              leftSection={<ExternalLink size={20} />}
              onClick={handleConnect}
              style={{
                backgroundColor: '#00D4FF',
                color: 'white'
              }}
            >
              Connect to Wahoo
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
                  backgroundColor: '#00D4FF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Zap size={32} color="white" />
                </div>
                <div>
                  <Text size="lg" fw={600}>
                    {integration?.provider_user_data?.first} {integration?.provider_user_data?.last}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {integration?.provider_user_data?.email}
                  </Text>
                  <Group gap="xs" mt="xs">
                    <Badge size="sm" variant="light" color="blue">
                      <Activity size={12} /> Wahoo Connected
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
              <Text size="md" fw={600} mb="xs">Sync Workouts</Text>
              <Text size="sm" c="dimmed" mb="md">
                Import your rides from Wahoo Fitness Cloud
              </Text>
            </div>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <Tooltip label="Sync recent workouts from Wahoo">
                <Button
                  leftSection={syncing ? <Loader size={16} /> : <Download size={16} />}
                  onClick={handleSync}
                  loading={syncing}
                  disabled={syncing}
                  variant="filled"
                  fullWidth
                  style={{
                    backgroundColor: '#00D4FF',
                    color: 'white'
                  }}
                >
                  {syncing ? 'Syncing...' : 'Sync Workouts'}
                </Button>
              </Tooltip>

              <Tooltip label="Force refresh all workouts">
                <Button
                  leftSection={syncing ? <Loader size={16} /> : <RefreshCw size={16} />}
                  onClick={handleSync}
                  loading={syncing}
                  disabled={syncing}
                  variant="outline"
                  color="cyan"
                  fullWidth
                >
                  {syncing ? 'Syncing...' : 'Refresh All'}
                </Button>
              </Tooltip>
            </SimpleGrid>

            {syncing && (
              <Progress value={syncProgress} size="sm" mt="md" color="cyan" />
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
          <Card withBorder p="md" bg="cyan.0">
            <Text size="sm" fw={600} mb="xs">Supported Devices</Text>
            <Text size="sm" c="dimmed">
              • ELEMNT BOLT (all versions)
              <br />
              • ELEMNT ROAM (all versions)
              <br />
              • ELEMNT (original)
              <br />
              • ELEMNT RIVAL watch
            </Text>
            <Text size="xs" c="dimmed" mt="sm">
              Make sure your device is connected to WiFi and has synced to Wahoo Cloud
            </Text>
          </Card>
        </Stack>
      )}
    </Stack>
  );
};

export default WahooIntegration;
