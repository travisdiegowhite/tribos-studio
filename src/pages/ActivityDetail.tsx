/**
 * ActivityDetail — dedicated full-page activity analysis view
 * (/activity/:activityId), mobile-first home of the flagship ActivityChart.
 *
 * Fetches its own data: one narrow activities select (explicit columns —
 * never select('*'); raw_data and fit_coach_context stay server-side) plus
 * the lazy /api/activity-streams payload for the chart. Canonical metric
 * columns are read with legacy fallback (rss ?? tss etc.) per the metrics
 * freeze policy.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ActionIcon,
  Alert,
  Box,
  Center,
  Container,
  Divider,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { ArrowLeft, Warning } from '@phosphor-icons/react';
import { supabase } from '../lib/supabase';
import { ActivityChart, useActivityStreams } from '../features/activity-chart';
import { decodePolyline, calculateBounds } from '../components/RideAnalysisModal';
import ColoredRouteMap from '../components/ColoredRouteMap';
import ActivityPowerCurve from '../components/ActivityPowerCurve';
import RideZonesChart from '../components/RideZonesChart';
import RidePacingChart from '../components/RidePacingChart';

// Explicit column list — canonical + legacy metric twins, no raw_data /
// fit_coach_context (the streams endpoint reads those server-side).
const ACTIVITY_COLUMNS = [
  'id',
  'user_id',
  'name',
  'type',
  'sport_type',
  'provider',
  'start_date',
  'start_date_local',
  'distance',
  'moving_time',
  'elapsed_time',
  'total_elevation_gain',
  'average_speed',
  'max_speed',
  'average_watts',
  'max_watts',
  'kilojoules',
  'average_heartrate',
  'max_heartrate',
  'average_cadence',
  'device_watts',
  'effective_power',
  'normalized_power',
  'ride_intensity',
  'intensity_factor',
  'rss',
  'tss',
  'power_curve_summary',
  'ride_analytics',
  'activity_streams',
  'map_summary_polyline',
].join(', ');

interface ActivityRow {
  id: string;
  user_id: string;
  name: string | null;
  type: string | null;
  provider: string | null;
  start_date_local: string | null;
  start_date: string | null;
  distance: number | null;
  moving_time: number | null;
  elapsed_time: number | null;
  total_elevation_gain: number | null;
  average_watts: number | null;
  max_watts: number | null;
  kilojoules: number | null;
  average_heartrate: number | null;
  max_heartrate: number | null;
  average_cadence: number | null;
  effective_power: number | null;
  normalized_power: number | null;
  ride_intensity: number | null;
  intensity_factor: number | null;
  rss: number | null;
  tss: number | null;
  power_curve_summary: Record<string, number> | null;
  ride_analytics: { pacing?: unknown; hr_zones?: unknown } | null;
  activity_streams: Record<string, unknown> | null;
  map_summary_polyline: string | null;
}

interface ProfileRow {
  ftp: number | null;
  weight_kg: number | null;
  power_zones: Record<string, { name?: string; min?: number; max?: number | null }> | null;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function StatTile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <Paper p="sm" withBorder>
      <Text size="xs" c="var(--color-text-muted)" tt="uppercase" style={{ letterSpacing: '0.04em' }}>
        {label}
      </Text>
      <Group gap={4} align="baseline">
        <Text size="xl" fw={700} ff="monospace">
          {value}
        </Text>
        {unit && (
          <Text size="xs" c="var(--color-text-muted)">
            {unit}
          </Text>
        )}
      </Group>
    </Paper>
  );
}

export default function ActivityDetail() {
  const { activityId } = useParams<{ activityId: string }>();
  const navigate = useNavigate();

  const [activity, setActivity] = useState<ActivityRow | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { streams, loading: streamsLoading, error: streamsError } = useActivityStreams(activityId);

  useEffect(() => {
    if (!activityId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth?.user?.id;
        if (!userId) throw new Error('Not signed in');

        const [activityRes, profileRes] = await Promise.all([
          supabase.from('activities').select(ACTIVITY_COLUMNS).eq('id', activityId).single(),
          supabase.from('user_profiles').select('ftp, weight_kg, power_zones').eq('id', userId).single(),
        ]);

        if (activityRes.error) throw new Error('Activity not found');
        if (cancelled) return;
        setActivity(activityRes.data as unknown as ActivityRow);
        if (!profileRes.error) setProfile(profileRes.data as ProfileRow);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activityId]);

  const ftp = profile?.ftp ?? null;

  const routeCoords = useMemo(
    () => decodePolyline(activity?.map_summary_polyline ?? null),
    [activity?.map_summary_polyline]
  );
  const bounds = useMemo(() => calculateBounds(routeCoords), [routeCoords]);
  const routeGeoJSON = useMemo(() => {
    if (routeCoords.length === 0) return null;
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: routeCoords },
    };
  }, [routeCoords]);

  const stats = useMemo(() => {
    if (!activity) return null;
    const distanceKm = activity.distance ? activity.distance / 1000 : 0;
    const load = activity.rss ?? activity.tss;
    const np = activity.effective_power ?? activity.normalized_power;
    return {
      distanceKm,
      duration: activity.moving_time ?? activity.elapsed_time,
      elevation: activity.total_elevation_gain,
      load: load != null ? Math.round(load) : null,
      avgPower: activity.average_watts,
      np,
      avgHr: activity.average_heartrate,
    };
  }, [activity]);

  const startDate = activity?.start_date_local ?? activity?.start_date;
  const hasPowerCurve =
    activity?.power_curve_summary && Object.keys(activity.power_curve_summary).length > 0;
  const showZones = Boolean(
    activity?.ride_analytics?.hr_zones ||
      (activity?.activity_streams as { heartRate?: unknown[]; power?: unknown[] } | null)?.heartRate ||
      (activity?.activity_streams as { power?: unknown[] } | null)?.power
  );

  if (loading) {
    return (
      <Center mih="60vh">
        <Loader />
      </Center>
    );
  }

  if (error || !activity) {
    return (
      <Container size="md" py="xl">
        <Alert icon={<Warning size={16} />} color="coral" title="Activity unavailable">
          {error ?? 'Activity not found'}
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="lg" py="md">
      <Stack gap="md">
        <Group gap="sm" wrap="nowrap">
          <ActionIcon variant="subtle" size="lg" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft size={20} />
          </ActionIcon>
          <Box style={{ minWidth: 0 }}>
            <Title order={3} lineClamp={1}>
              {activity.name || 'Activity'}
            </Title>
            <Text size="xs" c="var(--color-text-muted)">
              {startDate ? new Date(startDate).toLocaleString() : ''}
              {activity.provider ? ` · ${activity.provider}` : ''}
            </Text>
          </Box>
        </Group>

        {stats && (
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
            <StatTile label="Distance" value={stats.distanceKm.toFixed(1)} unit="km" />
            <StatTile label="Duration" value={formatDuration(stats.duration)} />
            <StatTile
              label="Elevation"
              value={stats.elevation != null ? Math.round(stats.elevation).toString() : '—'}
              unit="m"
            />
            <StatTile label="Load" value={stats.load != null ? String(stats.load) : '—'} unit="RSS" />
          </SimpleGrid>
        )}

        {/* Flagship chart */}
        {streamsLoading && (
          <Center h={280}>
            <Loader size="sm" />
          </Center>
        )}
        {!streamsLoading && streams && streams.tier !== 'summary' && (
          <ActivityChart streams={streams} ftp={ftp} profileZones={profile?.power_zones} />
        )}
        {!streamsLoading && (streamsError || streams?.tier === 'summary') && (
          <Text size="xs" c="var(--color-text-muted)" ta="center">
            No time-series data available for this activity.
          </Text>
        )}

        {routeCoords.length > 0 && (
          <ColoredRouteMap
            activityStreams={activity.activity_streams}
            routeCoords={routeCoords}
            routeGeoJSON={routeGeoJSON}
            bounds={bounds}
          />
        )}

        {hasPowerCurve && (
          <>
            <Divider label="Power Curve" labelPosition="center" />
            <ActivityPowerCurve
              powerCurveSummary={activity.power_curve_summary}
              ftp={ftp}
              weight={profile?.weight_kg ?? null}
            />
          </>
        )}

        {showZones && (
          <>
            <Divider label="Zone Distribution" labelPosition="center" />
            <RideZonesChart activity={activity} ftp={ftp} maxHr={activity.max_heartrate} />
          </>
        )}

        {activity.ride_analytics?.pacing ? (
          <>
            <Divider label="Pacing" labelPosition="center" />
            <RidePacingChart activity={activity} ftp={ftp} />
          </>
        ) : null}
      </Stack>
    </Container>
  );
}
