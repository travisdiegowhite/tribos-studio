/**
 * FSTargetBadge — event-type-aware Form Score target display.
 *
 * Spec §3.6 FS_TARGETS: when a race is within 21 days, surface the
 * target FS range for the race type alongside the athlete's current FS.
 *
 * Rendered standalone so it can be slotted into the dashboard next to
 * the FORM cell in StatusBar or into a race-ready banner. Takes the
 * current FS and the upcoming race as props; returns null if the race
 * is > 21 days out or undefined.
 */
import { Box, Text } from '@mantine/core';

export type RaceEventType =
  | 'criterium'
  | 'road_race'
  | 'gran_fondo'
  | 'stage_race'
  | 'gravel_race'
  | 'default';

export interface FSTarget {
  min: number;
  max: number;
  label: string;
}

// Spec §3.6 FS_TARGETS — event-type-aware target bands.
export const FS_TARGETS: Record<RaceEventType, FSTarget> = {
  criterium: { min: 15, max: 25, label: 'Very fresh — top-end snap required' },
  road_race: { min: 5, max: 20, label: 'Fresh — balance of fitness and pop' },
  gran_fondo: { min: 0, max: 15, label: 'Moderate — aerobic engine matters more than freshness' },
  stage_race: { min: -5, max: 10, label: 'Slight fatigue OK — save fitness for later stages' },
  gravel_race: { min: 5, max: 15, label: 'Fresh — long sustained effort' },
  default: { min: 5, max: 20, label: 'General race readiness' },
};

interface Props {
  /** Current Form Score. */
  currentFS: number | null;
  /** Next upcoming race — pass null when no race is scheduled. */
  nextRace: {
    name: string;
    /** ISO date (YYYY-MM-DD). */
    date: string;
    /** Normalized race-type key — one of FS_TARGETS keys. */
    type: RaceEventType | null;
  } | null;
  /** Today's ISO date (YYYY-MM-DD). Defaults to `new Date()`. */
  today?: string;
}

function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(fromISO).getTime();
  const to = new Date(toISO).getTime();
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

export default function FSTargetBadge({ currentFS, nextRace, today }: Props) {
  if (currentFS == null || !nextRace?.date) return null;

  const todayStr = today ?? new Date().toISOString().split('T')[0];
  const daysOut = daysBetween(todayStr, nextRace.date);
  if (daysOut < 0 || daysOut > 21) return null;

  const target = FS_TARGETS[nextRace.type ?? 'default'] ?? FS_TARGETS.default;
  const inBand = currentFS >= target.min && currentFS <= target.max;

  const fsLabel = currentFS > 0 ? `+${currentFS}` : String(currentFS);
  const rangeLabel = `${target.min > 0 ? '+' : ''}${target.min} to ${target.max > 0 ? '+' : ''}${target.max}`;

  return (
    <Box
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 14px',
        border: '0.5px solid var(--color-border)',
        backgroundColor: 'var(--color-card)',
      }}
    >
      <Text
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '2px',
          textTransform: 'uppercase',
          color: 'var(--color-text-muted)',
        }}
      >
        FS
      </Text>
      <Text
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 15,
          fontWeight: 700,
          color: 'var(--color-text-primary)',
        }}
      >
        {fsLabel}
      </Text>
      <Text
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 13,
          letterSpacing: '0.5px',
          color: 'var(--color-text-muted)',
        }}
      >
        | Target for {nextRace.name}: {rangeLabel} {inBand ? '✓' : ''}
      </Text>
    </Box>
  );
}
