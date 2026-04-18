import { useEffect, useState } from 'react';
import { Box, SimpleGrid, Stack, Text } from '@mantine/core';
import { supabase } from '../../lib/supabase';

/**
 * Small, flat strip rendered beneath the TodayHero. Three columns:
 *   - Yesterday: last completed ride
 *   - Today: today's planned workout (if any)
 *   - Next: the rider's next anchor (priority race within 42d, else next
 *     planned workout)
 *
 * Deliberately terse. Full metrics live in FullMetricsDrawer — this strip
 * is for situational awareness, not numbers.
 */

const RACE_ANCHOR_CUTOFF_DAYS = 42;

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

function Column({ label, headline, sublabel, empty }) {
  return (
    <Box
      style={{
        padding: '14px 16px',
        border: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-card)',
        minHeight: 90,
      }}
    >
      <Text
        fw={600}
        style={{
          fontFamily: "'Barlow Condensed', 'Barlow', sans-serif",
          fontSize: 11,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--color-text-muted)',
          marginBottom: 8,
        }}
      >
        {label}
      </Text>
      {empty ? (
        <Text
          style={{
            fontFamily: "'Barlow', sans-serif",
            fontSize: 14,
            color: 'var(--color-text-muted)',
            fontStyle: 'italic',
          }}
        >
          {empty}
        </Text>
      ) : (
        <Stack gap={2}>
          <Text
            style={{
              fontFamily: "'Barlow', sans-serif",
              fontSize: 15,
              lineHeight: 1.35,
              color: 'var(--color-text-primary)',
              fontWeight: 500,
            }}
          >
            {headline}
          </Text>
          {sublabel ? (
            <Text
              size="xs"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                color: 'var(--color-text-muted)',
              }}
            >
              {sublabel}
            </Text>
          ) : null}
        </Stack>
      )}
    </Box>
  );
}

export default function YesterdayTodayAhead({
  userId,
  lastRide,
  todayWorkout,
  activePlanIds,
  formatDist,
}) {
  const [nextAnchor, setNextAnchor] = useState(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function loadAnchor() {
      try {
        // 1. Try priority race within the cutoff window.
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
            setNextAnchor({ kind: 'race', ...race });
            return;
          }
        }

        // 2. Fall back to the next planned workout across active plans.
        if (!activePlanIds || activePlanIds.length === 0) {
          if (!cancelled) setNextAnchor(null);
          return;
        }
        const { data: nextW } = await supabase
          .from('planned_workouts')
          .select('name, scheduled_date, workout_type, target_rss, target_tss')
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

  // Yesterday column
  let yesterdayContent;
  if (lastRide) {
    const distKm = (lastRide.distance_meters || lastRide.distance || 0) / 1000;
    const dur = formatDuration(lastRide.duration_seconds || lastRide.moving_time);
    const parts = [];
    if (distKm > 0 && formatDist) parts.push(formatDist(distKm));
    if (dur) parts.push(dur);
    yesterdayContent = {
      headline: lastRide.name || (lastRide.type || 'Ride'),
      sublabel: parts.join(' · '),
    };
  } else {
    yesterdayContent = { empty: 'No ride in the last few days.' };
  }

  // Today column
  let todayContent;
  if (todayWorkout) {
    const title = todayWorkout.title || todayWorkout.name || todayWorkout.workout_type || 'Planned workout';
    const targetRss = todayWorkout.target_rss || todayWorkout.target_tss;
    const sub = [];
    if (todayWorkout.duration_minutes) sub.push(`${todayWorkout.duration_minutes} min`);
    if (targetRss) sub.push(`RSS ${targetRss}`);
    todayContent = {
      headline: title,
      sublabel: sub.join(' · '),
    };
  } else {
    todayContent = { empty: 'Rest day — or pick a ride.' };
  }

  // Next column
  let nextContent;
  if (nextAnchor?.kind === 'race') {
    const dateLabel = formatDateShort(nextAnchor.race_date);
    nextContent = {
      headline: nextAnchor.name,
      sublabel: [nextAnchor.race_type || 'Race', dateLabel, nextAnchor.priority ? `P${nextAnchor.priority}` : null]
        .filter(Boolean).join(' · '),
    };
  } else if (nextAnchor?.kind === 'workout') {
    nextContent = {
      headline: nextAnchor.name || nextAnchor.workout_type || 'Planned workout',
      sublabel: formatDateShort(nextAnchor.scheduled_date),
    };
  } else {
    nextContent = { empty: 'Nothing scheduled yet.' };
  }

  return (
    <SimpleGrid cols={{ base: 1, sm: 3 }} spacing={10}>
      <Column label="Yesterday" {...yesterdayContent} />
      <Column label="Today" {...todayContent} />
      <Column label="Next" {...nextContent} />
    </SimpleGrid>
  );
}
