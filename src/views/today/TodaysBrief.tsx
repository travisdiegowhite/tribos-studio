import { useCallback, useState } from 'react';
import { Box, Button, Group, Loader, Skeleton, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useNavigate } from 'react-router-dom';
import { Sparkle, PaperPlaneTilt, Play } from '@phosphor-icons/react';
import { ClusterCard } from './shared/ClusterCard';
import { ClusterHeader } from './shared/ClusterHeader';
import { decodePolyline } from './shared/decodePolyline';
import garminService from '../../utils/garminService';
import type { TodayBrief } from './useTodayData';

interface TodaysBriefProps {
  brief: TodayBrief;
  loading: boolean;
  onSendToGarmin?: () => void;
  onRideToday?: () => void;
}

const ACTION_BAR_BG = '#F4F4F2';

export function TodaysBrief({
  brief,
  loading,
  onSendToGarmin,
  onRideToday,
}: TodaysBriefProps) {
  const navigate = useNavigate();
  const [pushing, setPushing] = useState(false);

  const personaLabel = `COACH · ${brief.coachPersona.name.toUpperCase()}`;

  const handleSendToGarmin = useCallback(async () => {
    if (!brief.route?.polyline) {
      notifications.show({
        title: 'No route to send',
        message: 'Match a route to today’s workout first.',
        color: 'orange',
      });
      return;
    }
    setPushing(true);
    try {
      const coordinates = decodePolyline(brief.route.polyline);
      const result = await garminService.pushRoute({
        name: brief.route.name,
        description: brief.workout
          ? `${brief.workout.name} (${brief.workout.durationMin} min)`
          : 'Tribos route',
        coordinates,
        distanceKm: brief.route.distanceKm,
        elevationGainM: brief.route.elevationGainM,
        elevationLossM: 0,
      });
      if (result?.success) {
        notifications.show({
          title: 'Sent to Garmin',
          message: `${brief.route.name} is queued for your device.`,
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
  }, [brief, onSendToGarmin]);

  const handleRideToday = useCallback(() => {
    onRideToday?.();
    navigate('/ride');
  }, [navigate, onRideToday]);

  return (
    <ClusterCard flush>
      <Box p="14px 16px 12px 16px">
        <ClusterHeader title="TODAY'S BRIEF" subtitle="PRESCRIBED RIDE & THE COACH'S TAKE" />
      </Box>

      {/* Action bar */}
      <Box
        style={{
          backgroundColor: ACTION_BAR_BG,
          borderTop: '1px solid #DDDDD8',
          borderBottom: '1px solid #DDDDD8',
          padding: '12px 16px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr auto',
          alignItems: 'center',
          gap: 16,
        }}
      >
        {/* Ride */}
        <Box
          style={{
            paddingRight: 16,
            borderRight: '1px solid #DDDDD8',
          }}
        >
          <Text
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              color: '#7A7970',
              marginBottom: 4,
            }}
          >
            RIDE
          </Text>
          {loading ? (
            <Skeleton height={18} width={160} />
          ) : brief.workout ? (
            <Group gap={8} align="baseline">
              <Text fw={600} style={{ fontSize: 15, color: '#141410' }}>
                {brief.workout.name}
              </Text>
              <Text
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 13,
                  color: '#7A7970',
                }}
              >
                {brief.workout.durationMin} min
              </Text>
            </Group>
          ) : (
            <Text style={{ fontSize: 15, color: '#7A7970', fontStyle: 'italic' }}>
              Rest day
            </Text>
          )}
        </Box>

        {/* Route + match pill */}
        <Box style={{ paddingRight: 16, borderRight: '1px solid #DDDDD8' }}>
          <Text
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              color: '#7A7970',
              marginBottom: 4,
            }}
          >
            ROUTE
          </Text>
          {loading ? (
            <Skeleton height={18} width={220} />
          ) : brief.route ? (
            <Group gap={10} align="baseline">
              <Text fw={600} style={{ fontSize: 15, color: '#141410' }}>
                {brief.route.name}
              </Text>
              <Text
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 13,
                  color: '#7A7970',
                }}
              >
                {brief.route.distanceKm.toFixed(1)} km
              </Text>
              <Box
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '1px',
                  color: '#FFFFFF',
                  backgroundColor: '#2A8C82',
                  padding: '2px 6px',
                }}
              >
                {Math.round(brief.route.matchPct)}% MATCH
              </Box>
            </Group>
          ) : (
            <Text style={{ fontSize: 14, color: '#7A7970', fontStyle: 'italic' }}>
              No matched route yet
            </Text>
          )}
        </Box>

        {/* Buttons */}
        <Group gap={8}>
          <Button
            variant="outline"
            color="gray"
            size="sm"
            leftSection={pushing ? <Loader size={12} /> : <PaperPlaneTilt size={14} />}
            onClick={handleSendToGarmin}
            disabled={loading || pushing || !brief.route?.polyline}
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
            disabled={loading || !brief.workout}
            styles={{ root: { borderRadius: 0 } }}
          >
            RIDE TODAY
          </Button>
        </Group>
      </Box>

      {/* Coach header */}
      <Box style={{ padding: '14px 16px 8px 16px' }}>
        <Group gap={8} align="center">
          <Box
            style={{
              width: 22,
              height: 22,
              backgroundColor: '#FBF6F2',
              border: '1px solid #DDDDD8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkle size={12} color="#2A8C82" weight="fill" />
          </Box>
          <Text
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '2px',
              textTransform: 'uppercase',
              color: '#2A8C82',
            }}
          >
            {personaLabel}
          </Text>
        </Group>
      </Box>

      {/* Coach message */}
      <Box style={{ padding: '0 16px 16px 16px' }}>
        <Box
          style={{
            backgroundColor: '#FBF6F2',
            borderLeft: '3px solid #2A8C82',
            padding: '12px 14px',
          }}
        >
          {loading ? (
            <Skeleton height={50} />
          ) : brief.coachMessage ? (
            <Text
              style={{
                fontSize: 15,
                lineHeight: 1.6,
                color: '#3D3C36',
              }}
            >
              {brief.coachMessage}
            </Text>
          ) : (
            <Text
              style={{
                fontSize: 14,
                fontStyle: 'italic',
                color: '#7A7970',
                lineHeight: 1.5,
              }}
            >
              Your coach is warming up. Once you have a few rides logged, your daily brief will appear here.
            </Text>
          )}
        </Box>
      </Box>
    </ClusterCard>
  );
}
