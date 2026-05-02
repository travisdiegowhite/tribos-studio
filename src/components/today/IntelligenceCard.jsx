import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Box, Group, Text, Button, Badge, Skeleton, Loader } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Path, Play, CalendarBlank, CloudArrowUp, Check } from '@phosphor-icons/react';
import { garminService } from '../../utils/garminService';
import { decodePolyline } from '../../utils/activityRouteAnalyzer';
import { trackFeature, EventType } from '../../utils/activityTracking';

const VIEW_VERSION = 'today_v2_reflow';

function captureEvent(name, props = {}) {
  if (typeof window === 'undefined') return;
  window.posthog?.capture?.(name, { view_version: VIEW_VERSION, ...props });
}

/**
 * IntelligenceCard — the "Today's Ride" card on the Today view.
 *
 * Vertical layout: workout name + duration → matched route name +
 * distance + match score → action buttons (Send to Garmin secondary,
 * Ride Today primary).
 *
 * The Send to Garmin button mirrors the production push flow used by
 * RouteExportMenu.jsx — decodes the matched activity's polyline and
 * POSTs through garminService.pushRoute. Button is hidden when Garmin
 * isn't connected or when the routeMatch lacks a polyline (no payload
 * to send).
 */
function IntelligenceCard({ workout, plan, routeMatch, loading, formatDist }) {
  const [garminConnected, setGarminConnected] = useState(false);
  const [sendingToGarmin, setSendingToGarmin] = useState(false);

  // Probe Garmin connection once on mount. Same pattern as RouteExportMenu.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await garminService.getConnectionStatus();
        if (!cancelled) setGarminConnected(Boolean(status?.connected));
      } catch {
        if (!cancelled) setGarminConnected(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <Box
        style={{
          border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-card)',
          padding: 16,
        }}
      >
        <Skeleton height={120} />
      </Box>
    );
  }

  // Empty state: no plan
  if (!plan) {
    return (
      <Box
        style={{
          border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-card)',
          padding: 16,
        }}
      >
        <Text
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: 'var(--color-text-muted)',
            marginBottom: 8,
          }}
        >
          TODAY&apos;S RIDE
        </Text>
        <Text fw={600} style={{ fontSize: 20, color: 'var(--color-text-primary)', marginBottom: 4 }}>
          No active training plan
        </Text>
        <Text size="sm" style={{ color: 'var(--color-text-secondary)', marginBottom: 16 }}>
          Set up a plan to get personalized workouts and matched routes.
        </Text>
        <Button
          component={Link}
          to="/train/planner?tab=browse"
          variant="filled"
          color="teal"
          leftSection={<CalendarBlank size={16} />}
        >
          BROWSE PLANS
        </Button>
      </Box>
    );
  }

  // Rest day
  if (!workout) {
    return (
      <Box
        style={{
          border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-card)',
          padding: 16,
        }}
      >
        <Text
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: 'var(--color-text-muted)',
            marginBottom: 8,
          }}
        >
          TODAY&apos;S RIDE
        </Text>
        <Text fw={600} style={{ fontSize: 20, color: 'var(--color-text-primary)', marginBottom: 4 }}>
          Rest Day
        </Text>
        <Text size="sm" style={{ color: 'var(--color-text-secondary)' }}>
          Recovery is part of the plan. Take it easy today.
        </Text>
      </Box>
    );
  }

  // Build a Garmin push payload from the matched activity. Returns null
  // when there's no polyline — the button hides in that case.
  const buildGarminPayload = () => {
    const activity = routeMatch?.activity;
    if (!activity) return null;
    const encoded = activity.map_summary_polyline || activity.summary_polyline;
    if (!encoded) return null;

    const coords = decodePolyline(encoded);
    if (!coords.length) return null;

    return {
      name: activity.name || workout.title || 'Today Route',
      description: workout.title ? `Today's ride: ${workout.title}` : undefined,
      coordinates: coords.map((c) => [c.lng, c.lat]),
      distanceKm: typeof activity.distance === 'number' ? activity.distance / 1000 : undefined,
      elevationGainM: activity.total_elevation_gain ?? undefined,
      elevationLossM: undefined,
      routeType: activity.route_type ?? undefined,
      surfaceType: activity.surface_type ?? undefined,
    };
  };

  const garminPayload = garminConnected ? buildGarminPayload() : null;
  const showSendToGarmin = Boolean(garminPayload);

  const handleSendToGarmin = async () => {
    if (!garminPayload) return;
    setSendingToGarmin(true);
    try {
      const result = await garminService.pushRoute(garminPayload);
      if (result?.success) {
        captureEvent('today_view.route_sent_to_garmin', {
          route_name: garminPayload.name,
          match_score: routeMatch?.matchScore ?? null,
        });
        trackFeature(EventType.ROUTE_SEND_TO_GARMIN, {
          routeName: garminPayload.name,
          source: 'today_view',
          success: true,
        });
        notifications.show({
          title: 'Sent to Garmin',
          message: result.message || 'Route sent. Sync your device to download it.',
          color: 'green',
          icon: <Check size={16} />,
          autoClose: 5000,
        });
      } else {
        const errorMsg = result?.details ? `${result.error}: ${result.details}` : result?.error || 'Failed to send route';
        throw new Error(errorMsg);
      }
    } catch (err) {
      notifications.show({
        title: 'Send failed',
        message: err.message || 'Failed to send route to Garmin',
        color: 'red',
        autoClose: 8000,
      });
    } finally {
      setSendingToGarmin(false);
    }
  };

  const handleRideToday = () => {
    captureEvent('today_view.ride_today_clicked', {
      workout: workout?.title || workout?.workout_type || null,
      has_route_match: Boolean(routeMatch),
    });
  };

  // Active workout + optional route match — vertical layout
  return (
    <Box
      style={{
        border: '1px solid var(--color-teal-border)',
        backgroundColor: 'var(--color-card)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <Box style={{ padding: 16, flex: 1 }}>
        {/* Workout header */}
        <Text
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: 'var(--color-teal)',
            marginBottom: 8,
          }}
        >
          TODAY&apos;S RIDE
        </Text>
        <Text
          fw={700}
          style={{ fontSize: 22, color: 'var(--color-text-primary)', marginBottom: 6 }}
        >
          {workout.title || workout.workout_type || 'Workout'}
        </Text>
        <Group gap="md" mb={routeMatch ? 18 : 0}>
          {workout.duration_minutes && (
            <Text style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, color: 'var(--color-text-secondary)' }}>
              {workout.duration_minutes} min
            </Text>
          )}
          {workout.tss && (
            <Text style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, color: 'var(--color-text-muted)' }}>
              TSS {workout.tss}
            </Text>
          )}
        </Group>

        {/* Matched route block */}
        {routeMatch ? (
          <Box style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: 14 }}>
            <Text
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '2px',
                textTransform: 'uppercase',
                color: 'var(--color-text-muted)',
                marginBottom: 8,
              }}
            >
              BEST ROUTE MATCH
            </Text>
            <Group gap="sm" align="center" mb={8}>
              <Path size={16} color="var(--color-teal)" />
              <Text
                fw={600}
                style={{ fontSize: 16, color: 'var(--color-text-primary)' }}
                lineClamp={1}
              >
                {routeMatch.activity?.name || 'Matched Route'}
              </Text>
            </Group>
            <Group gap="sm">
              <Badge
                variant="light"
                color="teal"
                size="sm"
                style={{ fontFamily: "'DM Mono', monospace" }}
              >
                {routeMatch.matchScore}% MATCH
              </Badge>
              {routeMatch.activity?.distance != null && formatDist && (
                <Text style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, color: 'var(--color-text-muted)' }}>
                  {formatDist(routeMatch.activity.distance / 1000)}
                </Text>
              )}
            </Group>
          </Box>
        ) : (
          <Box style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: 14 }}>
            <Text
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '2px',
                textTransform: 'uppercase',
                color: 'var(--color-text-muted)',
                marginBottom: 8,
              }}
            >
              ROUTE MATCH
            </Text>
            <Text size="sm" style={{ color: 'var(--color-text-muted)' }}>
              No matched routes yet. Analyze your rides to get route suggestions.
            </Text>
          </Box>
        )}
      </Box>

      {/* Footer CTAs */}
      <Box
        style={{
          borderTop: '0.5px solid var(--color-border)',
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 10,
        }}
      >
        {showSendToGarmin && (
          <Button
            onClick={handleSendToGarmin}
            disabled={sendingToGarmin}
            variant="outline"
            color="gray"
            size="sm"
            leftSection={sendingToGarmin ? <Loader size={14} /> : <CloudArrowUp size={16} />}
          >
            {sendingToGarmin ? 'SENDING…' : 'SEND TO GARMIN'}
          </Button>
        )}
        <Button
          component={Link}
          to="/ride"
          onClick={handleRideToday}
          variant="filled"
          color="teal"
          size="sm"
          leftSection={<Play size={16} />}
        >
          RIDE TODAY
        </Button>
      </Box>
    </Box>
  );
}

export default IntelligenceCard;
