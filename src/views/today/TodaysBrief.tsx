import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { usePostHog } from 'posthog-js/react';
import { Sparkle, Play } from '@phosphor-icons/react';
import { ClusterCard } from './shared/ClusterCard';
import { ClusterHeader } from './shared/ClusterHeader';
import { useUnits } from '../../utils/units';
import { garminService } from '../../utils/garminService';
import { decodePolyline } from '../../utils/activityRouteAnalyzer';
import { captureToday } from './utils/todayInstrumentation';
import type { TodayData } from './hooks/useTodayData';

interface Props {
  data: TodayData;
}

export function TodaysBrief({ data }: Props) {
  const navigate = useNavigate();
  const posthog = usePostHog();
  const { formatDistance } = useUnits();
  const dwellRef = useRef<number | null>(null);
  const dwellFiredRef = useRef<boolean>(false);

  const { brief, persona, loading } = data;

  // Track 3+ second dwell on the coach paragraph as "message read".
  useEffect(() => {
    if (!brief.coachMessage || dwellFiredRef.current) return;
    dwellRef.current = window.setTimeout(() => {
      dwellFiredRef.current = true;
      captureToday(posthog, 'today_view.coach_message_read', {
        cached: brief.cached,
        persona: persona.id,
      });
    }, 3000);
    return () => {
      if (dwellRef.current != null) window.clearTimeout(dwellRef.current);
    };
  }, [brief.coachMessage, brief.cached, persona.id, posthog]);

  const handleSendToGarmin = async () => {
    if (!brief.route?.polyline) {
      notifications.show({
        title: 'No route',
        message: 'No route is matched for today\'s workout.',
        color: 'gray',
      });
      return;
    }
    try {
      const coordinates: [number, number][] = decodePolyline(brief.route.polyline).map(
        (c) => [c.lng, c.lat]
      );
      const result = await garminService.pushRoute({
        name: brief.route.name,
        description: `${brief.route.name} — ${brief.route.matchPct}% match`,
        coordinates,
        distanceKm: brief.route.distanceKm,
        routeType: 'cycling',
      });
      captureToday(posthog, 'today_view.route_sent_to_garmin', {
        route_id: brief.route.id,
        match_pct: brief.route.matchPct,
        success: Boolean(result?.success),
      });
      notifications.show({
        title: result?.success ? 'Sent to Garmin' : 'Send failed',
        message:
          result?.success
            ? `${brief.route.name} pushed to your Garmin device.`
            : result?.error || 'Could not send route.',
        color: result?.success ? 'teal' : 'orange',
      });
    } catch (err) {
      notifications.show({
        title: 'Send failed',
        message: err instanceof Error ? err.message : 'Unexpected error.',
        color: 'orange',
      });
    }
  };

  const handleRideToday = () => {
    captureToday(posthog, 'today_view.ride_today_clicked', {
      route_id: brief.route?.id ?? null,
      workout_id: brief.workout?.id ?? null,
    });
    navigate('/ride');
  };

  const personaLabel = `COACH · ${persona.name.toUpperCase()}`;

  return (
    <ClusterCard>
      <ClusterHeader title="TODAY'S BRIEF" subtitle="PRESCRIBED RIDE & THE COACH'S TAKE" />

      {/* Action bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: 0,
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          minHeight: 56,
        }}
      >
        <BriefZone label="RIDE">
          {brief.workout ? (
            <>
              <span style={zoneValueStyle}>{brief.workout.name}</span>
              <span style={zoneSubStyle}>{brief.workout.durationMin} min</span>
            </>
          ) : (
            <span style={zoneEmptyStyle}>Rest day</span>
          )}
        </BriefZone>
        <BriefDivider />
        <BriefZone label="ROUTE">
          {brief.route ? (
            <>
              <span style={zoneValueStyle}>{brief.route.name}</span>
              <span style={zoneSubStyle}>
                {formatDistance(brief.route.distanceKm)}
                <span style={{ marginLeft: 8, color: 'var(--color-teal)', fontWeight: 600 }}>
                  · {brief.route.matchPct}% MATCH
                </span>
              </span>
            </>
          ) : (
            <span style={zoneEmptyStyle}>No matched route</span>
          )}
        </BriefZone>
        <BriefDivider />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 14px',
          }}
        >
          <button
            type="button"
            onClick={handleSendToGarmin}
            disabled={!brief.route?.polyline}
            style={{ ...secondaryButtonStyle, opacity: brief.route?.polyline ? 1 : 0.4 }}
          >
            SEND TO GARMIN
          </button>
          <button
            type="button"
            onClick={handleRideToday}
            style={primaryButtonStyle}
          >
            <Play size={14} weight="fill" />
            <span>RIDE TODAY</span>
          </button>
        </div>
      </div>

      {/* Coach header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            background: 'var(--tribos-warm-bg)',
            border: '1px solid var(--color-border)',
          }}
        >
          <Sparkle size={14} color="var(--color-teal)" weight="fill" />
        </span>
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.12em',
            color: 'var(--color-teal)',
          }}
        >
          {personaLabel}
        </span>
      </div>

      {/* Coach message */}
      <div
        style={{
          background: 'var(--tribos-warm-bg)',
          borderLeft: '3px solid var(--color-teal)',
          padding: '12px 14px',
          minHeight: 72,
        }}
      >
        {loading.brief && !brief.coachMessage ? (
          <>
            <Skeleton height={12} mb={8} />
            <Skeleton height={12} mb={8} width="92%" />
            <Skeleton height={12} width="78%" />
          </>
        ) : brief.coachMessage ? (
          <p
            style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.55,
              color: 'var(--color-text-primary)',
            }}
          >
            {brief.coachMessage}
          </p>
        ) : (
          <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 13 }}>
            Your coach will weigh in once today's metrics are available.
          </p>
        )}
      </div>
    </ClusterCard>
  );
}

const zoneValueStyle = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  lineHeight: 1.2,
} as const;

const zoneSubStyle = {
  fontFamily: "'DM Mono', monospace",
  fontSize: 11,
  color: 'var(--color-text-muted)',
  letterSpacing: '0.04em',
} as const;

const zoneEmptyStyle = {
  fontSize: 13,
  color: 'var(--color-text-muted)',
  fontStyle: 'italic',
} as const;

const primaryButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 14px',
  background: 'var(--color-teal)',
  color: '#FFFFFF',
  border: 'none',
  fontFamily: "'DM Mono', monospace",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  cursor: 'pointer',
} as const;

const secondaryButtonStyle = {
  padding: '8px 12px',
  background: 'transparent',
  color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border)',
  fontFamily: "'DM Mono', monospace",
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  cursor: 'pointer',
} as const;

function BriefZone({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        padding: '10px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 9,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--color-text-muted)',
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function BriefDivider() {
  return <div style={{ width: 1, background: 'var(--color-border)' }} />;
}
