import { Skeleton } from '@mantine/core';
import { ClusterCard } from './shared/ClusterCard';
import { ClusterHeader } from './shared/ClusterHeader';
import RecentRidesMap from '../../components/RecentRidesMap.jsx';
import { useUnits } from '../../utils/units';
import type { TodayData } from './hooks/useTodayData';

interface Props {
  data: TodayData;
}

function formatRideTime(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatShortDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function RecentRides({ data }: Props) {
  const { recentRides, loading } = data;
  const { formatDistance, formatElevation } = useUnits();

  return (
    <ClusterCard>
      <ClusterHeader title="RECENT RIDES" subtitle="THE LAST 5 RIDES" />

      <div style={{ height: 200, position: 'relative' }}>
        <RecentRidesMap
          activities={recentRides.rides}
          loading={loading.recentRides}
          formatDist={formatDistance}
          formatElev={formatElevation}
        />
      </div>

      {/* Ride list — top 3 only for the dashboard surface */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {loading.recentRides && recentRides.rides.length === 0 ? (
          <>
            <Skeleton height={20} mb={8} />
            <Skeleton height={20} mb={8} />
            <Skeleton height={20} />
          </>
        ) : recentRides.rides.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 13 }}>
            Import a ride to see your map.
          </p>
        ) : (
          recentRides.rides.slice(0, 3).map((ride, idx) => (
            <div
              key={ride.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 0',
                borderTop: idx === 0 ? 'none' : '1px solid var(--color-border)',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  background: 'var(--color-teal)',
                  flex: '0 0 auto',
                }}
              />
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  color: 'var(--color-text-primary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {ride.name || 'Untitled ride'}
              </span>
              <span
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 11,
                  color: 'var(--color-text-muted)',
                  letterSpacing: '0.04em',
                }}
              >
                {formatShortDate(ride.start_date)} · {formatDistance((ride.distance ?? 0) / 1000)} ·{' '}
                {formatRideTime(ride.moving_time ?? 0)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* 7-day rollup */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          paddingTop: 10,
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <RollupCell label="7-DAY DIST" value={formatDistance(recentRides.rollup.distanceKm)} />
        <RollupCell label="ELEVATION" value={formatElevation(recentRides.rollup.elevationM)} />
        <RollupCell label="RIDE TIME" value={formatRideTime(recentRides.rollup.movingTimeSec)} />
      </div>
    </ClusterCard>
  );
}

function RollupCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
      <span
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          letterSpacing: '0.04em',
        }}
      >
        {value}
      </span>
    </div>
  );
}
