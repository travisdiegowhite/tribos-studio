/**
 * RoadPreferencesCard
 * Settings card for managing road segment extraction and routing preferences
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Stack,
  Title,
  Text,
  Group,
  Button,
  Box,
  Slider,
  Switch,
  Badge,
  Progress,
  Alert,
  Divider,
  Collapse,
  UnstyledButton,
  Tooltip,
} from '@mantine/core';
import {
  IconRoute,
  IconRefresh,
  IconCheck,
  IconAlertCircle,
  IconChevronDown,
  IconChevronRight,
  IconMap,
  IconCompass,
  IconInfoCircle,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { tokens } from '../../theme';
import { useAuth } from '../../contexts/AuthContext.jsx';

// Get the API base URL based on environment
const getApiBaseUrl = () => {
  if (import.meta.env.PROD) {
    return '';
  }
  return 'http://localhost:3000';
};

export default function RoadPreferencesCard() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Stats
  const [stats, setStats] = useState(null);
  const [unprocessedCount, setUnprocessedCount] = useState(0);
  const [apiError, setApiError] = useState(null);
  const [needsMigration, setNeedsMigration] = useState(false);

  // Preferences
  const [familiarityStrength, setFamiliarityStrength] = useState(50);
  const [exploreMode, setExploreMode] = useState(false);
  const [minRidesForFamiliar, setMinRidesForFamiliar] = useState(2);
  const [recencyWeight, setRecencyWeight] = useState(30);

  // Extraction progress
  const [extractionProgress, setExtractionProgress] = useState(null);

  // Load stats and preferences on mount
  useEffect(() => {
    if (session?.access_token) {
      loadData();
    }
  }, [session?.access_token]);

  const loadData = useCallback(async () => {
    if (!session?.access_token) return;

    setLoading(true);
    setApiError(null);
    setNeedsMigration(false);

    try {
      // Load stats and preferences in parallel
      const [statsRes, prefsRes] = await Promise.all([
        fetch(`${getApiBaseUrl()}/api/road-segments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ action: 'get_stats' })
        }),
        fetch(`${getApiBaseUrl()}/api/road-segments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ action: 'get_preferences' })
        })
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        console.log('Road segments stats:', statsData);
        setStats(statsData.stats);
        setUnprocessedCount(statsData.unprocessedActivities || 0);
        // Check if column migration is needed
        if (statsData.needsColumnMigration) {
          console.warn('segments_extracted_at column missing from activities table');
        }
      } else {
        const errorData = await statsRes.json().catch(() => ({}));
        console.error('Road segments API error:', errorData);
        // Check if it's a database migration issue
        if (errorData.needsMigration || errorData.error?.includes('relation') || errorData.error?.includes('does not exist') || errorData.error?.includes('function')) {
          setNeedsMigration(true);
        } else {
          setApiError(errorData.error || 'Failed to load statistics');
        }
      }

      if (prefsRes.ok) {
        const prefsData = await prefsRes.json();
        if (prefsData.preferences) {
          setFamiliarityStrength(prefsData.preferences.familiarity_strength ?? 50);
          setExploreMode(prefsData.preferences.explore_mode ?? false);
          setMinRidesForFamiliar(prefsData.preferences.min_rides_for_familiar ?? 2);
          setRecencyWeight(prefsData.preferences.recency_weight ?? 30);
        }
      }
    } catch (error) {
      console.error('Failed to load road preferences:', error);
      setApiError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  const handleExtractSegments = async () => {
    console.log('Extract segments clicked');
    console.log('Session:', session);
    console.log('Access token:', session?.access_token ? 'present' : 'missing');

    if (!session?.access_token) {
      console.error('No access token available');
      notifications.show({
        title: 'Authentication Error',
        message: 'Please sign in again to extract segments',
        color: 'red',
      });
      return;
    }

    setExtracting(true);
    setExtractionProgress({ processed: 0, total: unprocessedCount || 0, segments: 0 });

    const notificationId = 'segment-extraction';
    notifications.show({
      id: notificationId,
      title: 'Extracting Road Segments',
      message: 'Processing your activities...',
      loading: true,
      autoClose: false,
    });

    try {
      let totalProcessed = 0;
      let totalSegments = 0;
      let remaining = 1; // Start with 1 to enter the loop at least once
      let estimatedTotal = unprocessedCount || 0;

      // Process in batches until done
      while (remaining > 0) {
        console.log('Fetching batch, remaining:', remaining);
        const response = await fetch(`${getApiBaseUrl()}/api/road-segments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            action: 'extract_all',
            limit: 50
          })
        });

        console.log('Response status:', response.status);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('Extraction API error:', errorData);
          throw new Error(errorData.error || 'Extraction failed');
        }

        const data = await response.json();
        console.log('Extraction response:', data);

        totalProcessed += data.activitiesProcessed || 0;
        totalSegments += data.segmentsStored || 0;
        remaining = data.remaining || 0;

        // Update estimated total on first response
        if (estimatedTotal === 0 && data.remaining !== undefined) {
          estimatedTotal = totalProcessed + remaining;
        }

        setExtractionProgress({
          processed: totalProcessed,
          total: estimatedTotal || totalProcessed,
          segments: totalSegments
        });

        // If nothing was processed, we're done
        if (data.activitiesProcessed === 0) {
          remaining = 0;
        }

        // Small delay between batches
        if (remaining > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      if (totalProcessed === 0) {
        notifications.update({
          id: notificationId,
          title: 'No Activities to Process',
          message: 'All your activities have already been processed, or no GPS data is available.',
          color: 'blue',
          icon: <IconCheck size={16} />,
          loading: false,
          autoClose: 5000,
        });
      } else {
        notifications.update({
          id: notificationId,
          title: 'Extraction Complete',
          message: `Processed ${totalProcessed} activities, extracted ${totalSegments} road segments`,
          color: 'green',
          icon: <IconCheck size={16} />,
          loading: false,
          autoClose: 5000,
        });
      }

      // Reload stats
      await loadData();
    } catch (error) {
      console.error('Segment extraction failed:', error);
      notifications.update({
        id: notificationId,
        title: 'Extraction Failed',
        message: error.message || 'Failed to extract road segments',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
        loading: false,
        autoClose: 5000,
      });
    } finally {
      setExtracting(false);
      setExtractionProgress(null);
    }
  };

  const handleSavePreferences = async () => {
    if (!session?.access_token) return;

    setSavingPrefs(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/road-segments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          action: 'update_preferences',
          familiarity_strength: familiarityStrength,
          explore_mode: exploreMode,
          min_rides_for_familiar: minRidesForFamiliar,
          recency_weight: recencyWeight
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save preferences');
      }

      notifications.show({
        title: 'Preferences Saved',
        message: 'Your route preferences have been updated',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    } catch (error) {
      console.error('Failed to save preferences:', error);
      notifications.show({
        title: 'Save Failed',
        message: error.message || 'Failed to save preferences',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    } finally {
      setSavingPrefs(false);
    }
  };

  const getFamiliarityLabel = (value) => {
    if (value <= 20) return 'Minimal';
    if (value <= 40) return 'Low';
    if (value <= 60) return 'Moderate';
    if (value <= 80) return 'Strong';
    return 'Maximum';
  };

  return (
    <Card>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Box>
            <Group gap="xs">
              <IconRoute size={24} style={{ color: 'var(--tribos-accent)' }} />
              <Title order={3} style={{ color: 'var(--tribos-text-primary)' }}>
                Route Learning
              </Title>
            </Group>
            <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }} mt={4}>
              Learn your preferred roads from your riding history
            </Text>
          </Box>
          {stats && (
            <Badge color="lime" variant="light" size="lg">
              {stats.total_segments?.toLocaleString() || 0} segments learned
            </Badge>
          )}
        </Group>

        {/* Info Alert */}
        <Alert
          icon={<IconInfoCircle size={18} />}
          color="cyan"
          variant="light"
        >
          <Text size="sm">
            <strong>How it works:</strong> We analyze your past activities to learn which roads you prefer.
            When generating routes, we can prioritize familiar roads you've ridden before.
          </Text>
        </Alert>

        {/* Stats Summary */}
        {stats && stats.total_segments > 0 && (
          <Box
            style={{
              backgroundColor: 'var(--tribos-bg-tertiary)',
              padding: tokens.spacing.md,
              borderRadius: tokens.radius.sm
            }}
          >
            <Group justify="space-around">
              <Box style={{ textAlign: 'center' }}>
                <Text size="xl" fw={600} style={{ color: 'var(--tribos-accent)' }}>
                  {stats.total_segments?.toLocaleString() || 0}
                </Text>
                <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                  Road Segments
                </Text>
              </Box>
              <Box style={{ textAlign: 'center' }}>
                <Text size="xl" fw={600} style={{ color: 'var(--tribos-accent)' }}>
                  {stats.unique_km ? `${Math.round(stats.unique_km)}` : '0'}
                </Text>
                <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                  Unique km
                </Text>
              </Box>
              <Box style={{ textAlign: 'center' }}>
                <Text size="xl" fw={600} style={{ color: 'var(--tribos-accent)' }}>
                  {stats.most_ridden_count || 0}
                </Text>
                <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                  Max Repeats
                </Text>
              </Box>
              <Box style={{ textAlign: 'center' }}>
                <Text size="xl" fw={600} style={{ color: 'var(--tribos-accent)' }}>
                  {stats.recent_new_segments || 0}
                </Text>
                <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                  New (30 days)
                </Text>
              </Box>
            </Group>

            {/* Segment distribution */}
            {stats.segments_by_ride_count && (
              <Box mt="md">
                <Text size="xs" fw={500} mb="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                  Familiarity Distribution
                </Text>
                <Group gap="xs">
                  <Tooltip label="Ridden once">
                    <Badge color="gray" variant="light" size="sm">
                      1x: {stats.segments_by_ride_count['1_ride'] || 0}
                    </Badge>
                  </Tooltip>
                  <Tooltip label="Ridden 2-3 times">
                    <Badge color="yellow" variant="light" size="sm">
                      2-3x: {stats.segments_by_ride_count['2_3_rides'] || 0}
                    </Badge>
                  </Tooltip>
                  <Tooltip label="Ridden 4-10 times">
                    <Badge color="lime" variant="light" size="sm">
                      4-10x: {stats.segments_by_ride_count['4_10_rides'] || 0}
                    </Badge>
                  </Tooltip>
                  <Tooltip label="Ridden 10+ times">
                    <Badge color="green" variant="light" size="sm">
                      10+: {stats.segments_by_ride_count['10_plus_rides'] || 0}
                    </Badge>
                  </Tooltip>
                </Group>
              </Box>
            )}
          </Box>
        )}

        {/* Migration Required Alert */}
        {needsMigration && (
          <Alert
            icon={<IconAlertCircle size={18} />}
            color="orange"
            variant="light"
          >
            <Text size="sm">
              <strong>Database setup required:</strong> The road segments feature needs a database migration.
              Please run migration <code>035_user_road_segments.sql</code> in your Supabase SQL editor.
            </Text>
          </Alert>
        )}

        {/* API Error Alert */}
        {apiError && !needsMigration && (
          <Alert
            icon={<IconAlertCircle size={18} />}
            color="red"
            variant="light"
          >
            <Text size="sm">
              <strong>Error:</strong> {apiError}
            </Text>
          </Alert>
        )}

        {/* Extract Segments Button - Always show if no migration issues */}
        {!needsMigration && (
          <Box
            style={{
              backgroundColor: 'var(--tribos-bg-tertiary)',
              padding: tokens.spacing.md,
              borderRadius: tokens.radius.sm
            }}
          >
            <Group justify="space-between" align="flex-start">
              <Box>
                <Group gap="xs" mb={4}>
                  <IconMap size={20} style={{ color: 'var(--tribos-text-primary)' }} />
                  <Text fw={500} style={{ color: 'var(--tribos-text-primary)' }}>
                    Process Activity History
                  </Text>
                </Group>
                <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                  {unprocessedCount > 0
                    ? `${unprocessedCount} activities haven't been analyzed yet.`
                    : stats?.total_segments > 0
                      ? 'All activities processed! Click to check for new ones.'
                      : 'Extract road segments from your activities to enable route learning.'}
                </Text>
              </Box>
              <Button
                size="sm"
                color="lime"
                variant="light"
                onClick={handleExtractSegments}
                loading={extracting}
                leftSection={<IconRefresh size={16} />}
              >
                {extracting ? 'Extracting...' : unprocessedCount > 0 ? 'Extract Segments' : 'Scan Activities'}
              </Button>
            </Group>

            {/* Progress bar during extraction */}
            {extractionProgress && (
              <Box mt="md">
                <Group justify="space-between" mb="xs">
                  <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                    Processing activities...
                  </Text>
                  <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                    {extractionProgress.processed} / {extractionProgress.total || '?'}
                  </Text>
                </Group>
                {extractionProgress.total > 0 && (
                  <Progress
                    value={(extractionProgress.processed / extractionProgress.total) * 100}
                    color="lime"
                    size="sm"
                    animated
                  />
                )}
                <Text size="xs" mt="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                  {extractionProgress.segments} segments extracted
                </Text>
              </Box>
            )}
          </Box>
        )}

        <Divider label="Routing Preferences" labelPosition="center" />

        {/* Familiarity Strength Slider */}
        <Box>
          <Group justify="space-between" mb="xs">
            <Box>
              <Text size="sm" fw={500} style={{ color: 'var(--tribos-text-primary)' }}>
                Familiar Road Preference
              </Text>
              <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                How strongly should routes favor roads you've ridden before?
              </Text>
            </Box>
            <Badge color="cyan" variant="light">
              {getFamiliarityLabel(familiarityStrength)}
            </Badge>
          </Group>
          <Slider
            value={familiarityStrength}
            onChange={setFamiliarityStrength}
            min={0}
            max={100}
            step={10}
            color="lime"
            marks={[
              { value: 0, label: 'Off' },
              { value: 50, label: 'Balanced' },
              { value: 100, label: 'Max' },
            ]}
            styles={{
              markLabel: { color: 'var(--tribos-text-secondary)', fontSize: 10 }
            }}
          />
        </Box>

        {/* Explore Mode Toggle */}
        <Group justify="space-between">
          <Box>
            <Group gap="xs">
              <IconCompass size={18} style={{ color: 'var(--tribos-text-primary)' }} />
              <Text size="sm" fw={500} style={{ color: 'var(--tribos-text-primary)' }}>
                Explore Mode
              </Text>
            </Group>
            <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
              Intentionally favor new roads you haven't ridden yet
            </Text>
          </Box>
          <Switch
            checked={exploreMode}
            onChange={(e) => setExploreMode(e.currentTarget.checked)}
            color="lime"
            size="md"
          />
        </Group>

        {/* Advanced Settings */}
        <Box
          style={{
            backgroundColor: 'var(--tribos-bg-tertiary)',
            padding: tokens.spacing.sm,
            borderRadius: tokens.radius.sm,
          }}
        >
          <UnstyledButton
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              width: '100%',
            }}
          >
            {showAdvanced ? (
              <IconChevronDown size={16} style={{ color: 'var(--tribos-text-secondary)' }} />
            ) : (
              <IconChevronRight size={16} style={{ color: 'var(--tribos-text-secondary)' }} />
            )}
            <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
              Advanced Settings
            </Text>
          </UnstyledButton>
          <Collapse in={showAdvanced}>
            <Stack gap="md" mt="sm">
              {/* Min Rides for Familiar */}
              <Box>
                <Group justify="space-between" mb="xs">
                  <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                    Minimum Rides for "Familiar"
                  </Text>
                  <Badge color="gray" variant="light">
                    {minRidesForFamiliar} rides
                  </Badge>
                </Group>
                <Slider
                  value={minRidesForFamiliar}
                  onChange={setMinRidesForFamiliar}
                  min={1}
                  max={5}
                  step={1}
                  color="cyan"
                  marks={[
                    { value: 1, label: '1' },
                    { value: 2, label: '2' },
                    { value: 3, label: '3' },
                    { value: 4, label: '4' },
                    { value: 5, label: '5' },
                  ]}
                  styles={{
                    markLabel: { color: 'var(--tribos-text-secondary)', fontSize: 10 }
                  }}
                />
                <Text size="xs" mt="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                  How many times must you ride a road before it's considered familiar?
                </Text>
              </Box>

              {/* Recency Weight */}
              <Box>
                <Group justify="space-between" mb="xs">
                  <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                    Recency Weight
                  </Text>
                  <Badge color="gray" variant="light">
                    {recencyWeight}%
                  </Badge>
                </Group>
                <Slider
                  value={recencyWeight}
                  onChange={setRecencyWeight}
                  min={0}
                  max={100}
                  step={10}
                  color="cyan"
                  marks={[
                    { value: 0, label: 'None' },
                    { value: 50, label: 'Medium' },
                    { value: 100, label: 'High' },
                  ]}
                  styles={{
                    markLabel: { color: 'var(--tribos-text-secondary)', fontSize: 10 }
                  }}
                />
                <Text size="xs" mt="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                  Favor roads you've ridden recently over roads from months ago?
                </Text>
              </Box>
            </Stack>
          </Collapse>
        </Box>

        {/* Save Button */}
        <Button
          color="lime"
          onClick={handleSavePreferences}
          loading={savingPrefs}
          leftSection={<IconCheck size={16} />}
        >
          Save Preferences
        </Button>
      </Stack>
    </Card>
  );
}
