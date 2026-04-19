import { useEffect, useState } from 'react';
import { Box, SimpleGrid, Stack, Text } from '@mantine/core';
import { supabase } from '../../lib/supabase';

/**
 * Context strip — spec §5.
 *
 * Three equal-width cards directly beneath the coach paragraph. Each card:
 *   - 3px top border in a role-specific color
 *   - DM Mono 10px uppercase meta label
 *   - Barlow Condensed 18px bold title
 *   - DM Mono 11px metadata line
 */

const RACE_ANCHOR_CUTOFF_DAYS = 42;

const ROLE_COLOR = {
  yesterday: 'var(--color-text-muted, #7A7970)',
  today: 'var(--color-teal, #2A8C82)',
  race: 'var(--color-coral, #C43C2A)',
  milestone: 'var(--color-gold, #C49A0A)',
  workout: 'var(--color-text-muted, #7A7970)',
  empty: 'var(--color-text-muted, #7A7970)',
};

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDateShort(value) {
  if (!value) return '';
  try {
    const d = typeof value === 'string' ? new Date(`${value}T12:00:00Z`) : value;
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function StripCard({ topColor, meta, title, metadata, emphasised }) {
  return (
    <Box
      style={{
        borderTop: `3px solid ${topColor}`,
        borderRight: '1px solid var(--color-border, #DDDDD8)',
        borderBottom: '1px solid var(--color-border, #DDDDD8)',
        borderLeft: '1px solid var(--color-border, #DDDDD8)',
        backgroundColor: 'var(--color-card, #FFFFFF)',
        padding: '14px 16px 16px',
        minHeight: 104,
      }}
    >
      <Text
        fw={600}
        style={{
          fontFamily: "'JetBrains Mono', 'DM Mono', monospace",
          fontSize: 10,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: 'var(--color-text-muted, #7A7970)',
          marginBottom: 10,
        }}
      >
        {meta}
      </Text>
      <Stack gap={4}>
        <Text
          style={{
            fontFamily: "'Barlow Condensed', 'Barlow', sans-serif",
            fontSize: 18,
            fontWeight: 700,
            lineHeight: 1.2,
            color: emphasised ? topColor : 'var(--color-ink, #141410)',
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
          }}
        >
          {title}
        </Text>
        {metadata ? (
          <Text
            style={{
              fontFamily: "'JetBrains Mono', 'DM Mono', monospace",
              fontSize: 11,
              letterSpacing: '0.06em',
              color: 'var(--color-text-muted, #7A7970)',
            }}
          >
            {metadata}
          </Text>
        ) : null}
      </Stack>
    </Box>
  );
}

export default function YesterdayTodayAhead({
  userId,
  lastRide,
  todayWorkout,
  todayRouteMatch,
  activePlanIds,
  formatDist,
}) {
  const [nextAnchor, setNextAnchor] = useState(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function loadAnchor() {
      try {
        const { data: race } = await supabase
          .from('race_goals')
          .select('name, race_date, race_type, priority')
          .eq('user_id', userId)
          .eq('status', 'upcoming')
          .order('priority', { ascending: true })
          .order('race_date', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!cancelled && race?.race_date) {
          const days = Math.round(
            (new Date(`${race.race_date}T12:00:00Z`).getTime()
              - new Date(`${todayIso()}T12:00:00Z`).getTime()) / 86400000,
          );
          if (days >= 0 && days <= RACE_ANCHOR_CUTOFF_DAYS) {
            setNextAnchor({ kind: 'race', days, ...race });
            return;
          }
        }

        if (!activePlanIds || activePlanIds.length === 0) {
          if (!cancelled) setNextAnchor(null);
          return;
        }
        const { data: nextW } = await supabase
          .from('planned_workouts')
          .select('name, scheduled_date, workout_type, target_tss')
          .in('plan_id', activePlanIds)
          .gt('scheduled_date', todayIso())
          .eq('completed', false)
          .order('scheduled_date', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!cancelled) {
          setNextAnchor(nextW ? { kind: 'workout', ...nextW } : null);
        }
      } catch {
        if (!cancelled) setNextAnchor(null);
      }
    }
    loadAnchor();
    return () => { cancelled = true; };
  }, [userId, activePlanIds]);

  // --- Yesterday card ---
  let yesterday;
  if (lastRide) {
    const distKm = (lastRide.distance_meters || lastRide.distance || 0) / 1000;
    const dur = formatDuration(lastRide.duration_seconds || lastRide.moving_time);
    const rss = lastRide.rss ?? lastRide.tss;
    const metaParts = [];
    if (distKm > 0 && formatDist) metaParts.push(formatDist(distKm));
    if (dur) metaParts.push(dur);
    if (rss) metaParts.push(`RSS ${rss}`);
    yesterday = {
      topColor: ROLE_COLOR.yesterday,
      meta: 'YESTERDAY',
      title: lastRide.name || lastRide.type || 'Ride',
      metadata: metaParts.join(' · '),
    };
  } else {
    yesterday = {
      topColor: ROLE_COLOR.yesterday,
      meta: 'YESTERDAY',
      title: 'REST DAY',
      metadata: 'no session logged',
    };
  }

  // --- Today card ---
  let today;
  if (todayWorkout) {
    const name = todayWorkout.title || todayWorkout.name || todayWorkout.workout_type || 'Planned workout';
    const parts = [];
    if (todayWorkout.duration_minutes) parts.push(`${todayWorkout.duration_minutes} min`);
    const target = todayWorkout.target_rss || todayWorkout.target_tss;
    if (target) parts.push(`target RSS ${target}`);
    if (todayRouteMatch?.route?.name || todayRouteMatch?.name) {
      const routeName = todayRouteMatch?.route?.name || todayRouteMatch?.name;
      parts.push(`route: ${routeName}`);
    }
    today = {
      topColor: ROLE_COLOR.today,
      meta: `TODAY · ${name}`.toUpperCase(),
      title: name,
      metadata: parts.join(' · '),
      emphasised: true,
    };
  } else {
    today = {
      topColor: ROLE_COLOR.today,
      meta: 'TODAY',
      title: 'OPEN DAY',
      metadata: 'ask your coach for a session',
      emphasised: true,
    };
  }

  // --- Next card ---
  let next;
  if (nextAnchor?.kind === 'race') {
    const dateLabel = formatDateShort(nextAnchor.race_date);
    const daysOut = typeof nextAnchor.days === 'number' ? `${nextAnchor.days}d out` : null;
    next = {
      topColor: ROLE_COLOR.race,
      meta: 'NEXT · RACE',
      title: nextAnchor.name,
      metadata: [nextAnchor.race_type || 'Race', dateLabel, daysOut, nextAnchor.priority ? `P${nextAnchor.priority}` : null]
        .filter(Boolean).join(' · '),
    };
  } else if (nextAnchor?.kind === 'workout') {
    const name = nextAnchor.name || nextAnchor.workout_type || 'Planned workout';
    const target = nextAnchor.target_tss;
    next = {
      topColor: ROLE_COLOR.workout,
      meta: 'NEXT · WORKOUT',
      title: name,
      metadata: [formatDateShort(nextAnchor.scheduled_date), target ? `target RSS ${target}` : null]
        .filter(Boolean).join(' · '),
    };
  } else {
    next = {
      topColor: ROLE_COLOR.empty,
      meta: 'NEXT',
      title: 'NOTHING SCHEDULED',
      metadata: 'plan a ride to fill this slot',
    };
  }

  return (
    <SimpleGrid cols={{ base: 1, sm: 3 }} spacing={10}>
      <StripCard {...yesterday} />
      <StripCard {...today} />
      <StripCard {...next} />
    </SimpleGrid>
  );
}
