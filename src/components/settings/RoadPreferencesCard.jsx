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
        setStats(statsData.stats);
        setUnprocessedCount(statsData.unprocessedActivities || 0);
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
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  const handleExtractSegments = async () => {
    if (!session?.access_token) return;

    setExtracting(true);
    setExtractionProgress({ processed: 0, total: unprocessedCount, segments: 0 });

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
      let remaining = unprocessedCount;

      // Process in batches until done
      while (remaining > 0) {
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

        if (!response.ok) {
          throw new Error('Extraction failed');
        }

        const data = await response.json();
        totalProcessed += data.activitiesProcessed || 0;
        totalSegments += data.segmentsStored || 0;
        remaining = data.remaining || 0;

        setExtractionProgress({
          processed: totalProcessed,
          total: unprocessedCount,
          segments: totalSegments
        });

        // Small delay between batches
        if (remaining > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      notifications.update({
        id: notificationId,
        title: 'Extraction Complete',
        message: `Processed ${totalProcessed} activities, extracted ${totalSegments} road segments`,
        color: 'green',
        icon: <IconCheck size={16} />,
        loading: false,
        autoClose: 5000,
      });

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

        {/* Extract Segments Button */}
        {unprocessedCount > 0 && (
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
                  {unprocessedCount} activities haven't been analyzed yet.
                  Extract road segments to improve route recommendations.
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
                {extracting ? 'Extracting...' : 'Extract Segments'}
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
                    {extractionProgress.processed} / {extractionProgress.total}
                  </Text>
                </Group>
                <Progress
                  value={(extractionProgress.processed / extractionProgress.total) * 100}
                  color="lime"
                  size="sm"
                  animated
                />
                <Text size="xs" mt="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                  {extractionProgress.segments} segments extracted
                </Text>
              </Box>
            )}
          </Box>
        )}

        {/* No activities message */}
        {!loading && (!stats || stats.total_segments === 0) && unprocessedCount === 0 && (
          <Alert color="gray" variant="light">
            <Text size="sm">
              No activities with GPS data found. Sync your activities from Strava or Garmin to start
              learning your preferred roads.
            </Text>
          </Alert>
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
