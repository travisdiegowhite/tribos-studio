/**
 * GlanceRail — the right ~42% rail for the normal (matched/generated/
 * generating) hero states. Everything here that depends only on the
 * prescription, coach take, and clearance paints immediately; the route line
 * streams in via <Suspense> + RouteMatch. Send-to-Garmin awaits the deferred
 * route on click rather than blocking render.
 */

import { Suspense, use, useCallback, useState } from 'react';
import { Box, Button, Group, Loader, Skeleton, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useNavigate } from 'react-router-dom';
import { PaperPlaneTilt, Play, Sparkle } from '@phosphor-icons/react';
import garminService from '../../utils/garminService';
import { decodePolyline } from '../today/shared/decodePolyline';
import { C, FONT } from './tokens';
import { ClearanceBand } from './ClearanceBand';
import { RouteMatch } from './RouteMatch';
import { formatDurationMin } from './units';
import type { UnitsPreference } from './units';
import type { Today, TodayRoute } from './types';

interface GlanceRailProps {
  today: Today;
  routePromise: Promise<TodayRoute | null>;
  coachPromise: Promise<string | null>;
  units: UnitsPreference;
  onSendToGarmin?: () => void;
  onRideToday?: () => void;
}

/** Streams the persona fitness take in once /api/fitness-summary resolves. */
function CoachTakeText({ coachPromise }: { coachPromise: Promise<string | null> }) {
  const take = use(coachPromise);
  return (
    <Text style={{ fontFamily: FONT.body, fontSize: 14, lineHeight: 1.5, color: C.text2 }}>
      {take ?? 'Your coach is warming up — log a few rides for a daily take.'}
    </Text>
  );
}

export function GlanceRail({
  today,
  routePromise,
  coachPromise,
  units,
  onSendToGarmin,
  onRideToday,
}: GlanceRailProps) {
  const navigate = useNavigate();
  const [pushing, setPushing] = useState(false);
  const { prescription, coach, athleteState, heroState } = today;

  const statsLine = prescription
    ? [
        formatDurationMin(prescription.durationMin),
        prescription.targetRSS != null ? `${Math.round(prescription.targetRSS)} RSS` : null,
      ]
        .filter(Boolean)
        .join('  ·  ')
    : '';

  const handleSendToGarmin = useCallback(async () => {
    setPushing(true);
    try {
      const route = await routePromise;
      if (!route?.polyline) {
        notifications.show({
          title: 'No route to send',
          message: 'Match a route to today’s workout first.',
          color: 'orange',
        });
        return;
      }
      const coordinates = decodePolyline(route.polyline);
      const result = await garminService.pushRoute({
        name: route.name,
        description: prescription ? `${prescription.title} (${prescription.durationMin} min)` : 'Tribos route',
        coordinates,
        distanceKm: route.distanceKm,
        elevationGainM: route.elevationGainM,
        elevationLossM: 0,
      });
      if (result?.success) {
        notifications.show({
          title: 'Sent to Garmin',
          message: `${route.name} is queued for your device.`,
          color: 'teal',
        });
      } else {
        notifications.show({
          title: 'Send to Garmin failed',
          message: result?.error || 'Garmin Connect rejected the route.',
          color: 'red',
        });
      }
      onSendToGarmin?.();
    } catch (err) {
      notifications.show({
        title: 'Send to Garmin failed',
        message: err instanceof Error ? err.message : 'Network error',
        color: 'red',
      });
    } finally {
      setPushing(false);
    }
  }, [routePromise, prescription, onSendToGarmin]);

  const handleRideToday = useCallback(() => {
    onRideToday?.();
    navigate('/ride');
  }, [navigate, onRideToday]);

  return (
    <Stack gap={16} style={{ height: '100%' }}>
      {/* Workout title + stats */}
      <Box>
        <Text style={{ fontFamily: FONT.heading, fontSize: 28, fontWeight: 700, lineHeight: 1.05, color: C.text }}>
          {prescription?.title ?? 'Rest day'}
        </Text>
        {statsLine && (
          <Text style={{ fontFamily: FONT.mono, fontSize: 13, color: C.text3, marginTop: 4 }}>
            {statsLine}
          </Text>
        )}
      </Box>

      {/* Route match (deferred) */}
      <Suspense fallback={<Skeleton height={40} radius={0} />}>
        <RouteMatch routePromise={routePromise} units={units} heroState={heroState} />
      </Suspense>

      {/* Coach take — one line, persona-labeled */}
      <Box style={{ backgroundColor: '#FBF6F2', borderLeft: `3px solid ${C.teal}`, padding: '10px 12px' }}>
        <Group gap={6} mb={4} align="center">
          <Sparkle size={12} color={C.teal} weight="fill" />
          <Text
            style={{
              fontFamily: FONT.mono,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              color: C.teal,
            }}
          >
            Coach · {coach.personaName}
          </Text>
        </Group>
        <Suspense fallback={<Skeleton height={36} radius={0} />}>
          <CoachTakeText coachPromise={coachPromise} />
        </Suspense>
      </Box>

      {/* Clearance */}
      <ClearanceBand state={athleteState} />

      {/* Primary actions */}
      <Group gap={8} mt="auto">
        <Button
          variant="outline"
          color="gray"
          size="sm"
          leftSection={pushing ? <Loader size={12} /> : <PaperPlaneTilt size={14} />}
          onClick={handleSendToGarmin}
          disabled={pushing || !prescription}
          styles={{ root: { borderRadius: 0 } }}
        >
          SEND TO GARMIN
        </Button>
        <Button
          variant="filled"
          color="teal"
          size="sm"
          leftSection={<Play size={14} weight="fill" />}
          onClick={handleRideToday}
          disabled={!prescription}
          styles={{ root: { borderRadius: 0 } }}
        >
          RIDE TODAY
        </Button>
      </Group>
    </Stack>
  );
}
