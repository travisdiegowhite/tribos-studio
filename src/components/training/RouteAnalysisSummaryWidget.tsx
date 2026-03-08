/**
 * RouteAnalysisSummaryWidget - Dashboard summary card for route analysis
 * Shows route matches for today's workout or analysis stats overview
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Card,
  Text,
  Group,
  Stack,
  Badge,
  Button,
  Box,
  Skeleton,
  ThemeIcon,
} from '@mantine/core';
import {
  IconRoute,
  IconChevronRight,
  IconMountain,
  IconTarget,
} from '@tabler/icons-react';
import { supabase } from '../../lib/supabase';

interface RouteMatch {
  activity: {
    id: string;
    name: string;
    distance: number;
    total_elevation_gain: number;
  };
  matchScore: number;
  matchReasons: string[];
  analysis: {
    terrain_type: string;
    best_for: string[];
  };
}

interface AnalysisSummary {
  count: number;
  topCategories: string[];
}

interface TodayWorkout {
  id?: string;
  workout_type?: string;
  title?: string;
  duration_minutes?: number;
  category?: string;
}

interface RouteAnalysisSummaryWidgetProps {
  userId: string | undefined;
  todayWorkout: TodayWorkout | null;
  loading?: boolean;
}

const TERRAIN_LABELS: Record<string, string> = {
  flat: 'Flat',
  rolling: 'Rolling',
  hilly: 'Hilly',
  mountainous: 'Mountainous',
};

// Shared card style — gradient bg + terracotta accent border
const cardStyle = {
  background: 'linear-gradient(135deg, var(--color-bg-secondary) 0%, var(--color-bg-secondary) 100%)',
  border: '1px solid var(--color-teal)30',
};

const monoStyle = {
  fontFamily: "'DM Mono', monospace",
  letterSpacing: '1.5px',
  textTransform: 'uppercase' as const,
  color: 'var(--color-text-muted)',
};

function getMatchColor(score: number): string {
  if (score >= 85) return 'teal';
  if (score >= 70) return 'green';
  if (score >= 50) return 'yellow';
  return 'gray';
}

function formatDistance(meters: number): string {
  return (meters / 1000).toFixed(1) + ' km';
}

function RouteAnalysisSummaryWidget({ userId, todayWorkout, loading = false }: RouteAnalysisSummaryWidgetProps) {
  const [widgetLoading, setWidgetLoading] = useState(true);
  const [analysisSummary, setAnalysisSummary] = useState<AnalysisSummary | null>(null);
  const [topMatches, setTopMatches] = useState<RouteMatch[]>([]);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    async function fetchData() {
      setWidgetLoading(true);
      try {
        // Get analysis count and top categories
        const { data: analyses, count } = await supabase
          .from('activity_route_analysis')
          .select('best_for, terrain_type', { count: 'exact' })
          .eq('user_id', userId)
          .order('analyzed_at', { ascending: false })
          .limit(20);

        if (cancelled) return;

        if (!analyses || count === 0) {
          setAnalysisSummary(null);
          setWidgetLoading(false);
          return;
        }

        // Summarize top categories
        const categoryCounts: Record<string, number> = {};
        for (const a of analyses) {
          if (a.best_for) {
            for (const cat of a.best_for) {
              categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
            }
          }
        }
        const topCategories = Object.entries(categoryCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([cat]) => cat);

        setAnalysisSummary({ count: count || 0, topCategories });

        // If there's a today's workout, get matches
        if (todayWorkout) {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) {
            setWidgetLoading(false);
            return;
          }

          const workoutCategory = todayWorkout.workout_type || todayWorkout.category || 'endurance';
          const workoutId = todayWorkout.id || 'today';

          const res = await fetch('/api/route-analysis', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'get_matches',
              workouts: [{
                id: workoutId,
                name: todayWorkout.title || todayWorkout.workout_type || 'Today\'s Workout',
                category: workoutCategory,
                duration: todayWorkout.duration_minutes || 60,
              }],
            }),
          });

          if (cancelled) return;

          if (res.ok) {
            const data = await res.json();
            const matches = data.matches?.[workoutId] || [];
            setTopMatches(matches.slice(0, 3));
          }
        }
      } catch (err) {
        console.error('RouteAnalysisSummaryWidget fetch error:', err);
      } finally {
        if (!cancelled) setWidgetLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [userId, todayWorkout?.id]);

  if (loading || widgetLoading) {
    return (
      <Card padding="md" radius="md" style={cardStyle}>
        <Stack gap="sm">
          <Skeleton height={20} width="60%" />
          <Skeleton height={40} />
          <Skeleton height={20} width="80%" />
        </Stack>
      </Card>
    );
  }

  // No analyses — CTA state
  if (!analysisSummary) {
    return (
      <Card padding="md" radius="md" style={cardStyle}>
        <Stack gap="sm">
          <Group gap="xs">
            <ThemeIcon size="sm" variant="light" color="teal">
              <IconRoute size={14} />
            </ThemeIcon>
            <Text size="sm" fw={600}>
              Route Intelligence
            </Text>
          </Group>
          <Text size="xs" style={monoStyle}>
            Your training roads
          </Text>
          <Text size="sm" c="dimmed">
            Discover which of your past rides are best for each type of workout.
          </Text>
          <Button
            component={Link}
            to="/training?tab=routes"
            variant="filled"
            color="teal"
            size="sm"
            leftSection={<IconTarget size={16} />}
          >
            Analyze Routes
          </Button>
        </Stack>
      </Card>
    );
  }

  // Has today's workout matches
  if (todayWorkout && topMatches.length > 0) {
    return (
      <Card padding="md" radius="md" style={cardStyle}>
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start">
            <Group gap="xs">
              <ThemeIcon size="sm" variant="light" color="teal">
                <IconRoute size={14} />
              </ThemeIcon>
              <Text size="sm" fw={600}>
                Routes for Today
              </Text>
            </Group>
            <Badge size="xs" variant="light" color="teal">
              {analysisSummary.count} analyzed
            </Badge>
          </Group>
          <Text size="xs" style={monoStyle}>
            Matched to your workout
          </Text>

          <Stack gap={6}>
            {topMatches.map((match, i) => (
              <Group
                key={match.activity.id}
                justify="space-between"
                gap="xs"
                style={{
                  padding: '6px 8px',
                  borderRadius: 0,
                  backgroundColor: i === 0 ? 'var(--color-bg-secondary)' : 'transparent',
                  borderLeft: i === 0 ? '3px solid var(--color-teal)' : '3px solid transparent',
                }}
              >
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" fw={i === 0 ? 600 : 400} truncate>
                    {match.activity.name}
                  </Text>
                  <Group gap="xs">
                    <Text size="xs" c="dimmed">
                      {formatDistance(match.activity.distance)}
                    </Text>
                    {match.activity.total_elevation_gain > 0 && (
                      <Text size="xs" c="dimmed">
                        <IconMountain size={10} style={{ verticalAlign: 'middle' }} />{' '}
                        {Math.round(match.activity.total_elevation_gain)}m
                      </Text>
                    )}
                    {match.analysis?.terrain_type && (
                      <Text size="xs" c="dimmed">
                        {TERRAIN_LABELS[match.analysis.terrain_type] || match.analysis.terrain_type}
                      </Text>
                    )}
                  </Group>
                </Box>
                <Badge
                  size="sm"
                  variant={i === 0 ? 'filled' : 'light'}
                  color={getMatchColor(match.matchScore)}
                >
                  {match.matchScore}%
                </Badge>
              </Group>
            ))}
          </Stack>

          <Button
            component={Link}
            to="/training?tab=routes"
            variant="subtle"
            size="xs"
            rightSection={<IconChevronRight size={14} />}
            style={{ color: 'var(--color-text-secondary)' }}
          >
            View all matches
          </Button>
        </Stack>
      </Card>
    );
  }

  // Has analyses but no today's workout — summary stats
  return (
    <Card padding="md" radius="md" style={cardStyle}>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Group gap="xs">
            <ThemeIcon size="sm" variant="light" color="teal">
              <IconRoute size={14} />
            </ThemeIcon>
            <Text size="sm" fw={600}>
              Route Intelligence
            </Text>
          </Group>
          <Badge size="xs" variant="light" color="teal">
            {analysisSummary.count} routes
          </Badge>
        </Group>
        <Text size="xs" style={monoStyle}>
          Your training roads
        </Text>

        {analysisSummary.topCategories.length > 0 && (
          <Box>
            <Text size="xs" c="dimmed" mb={4}>
              Your routes are best for
            </Text>
            <Group gap={4}>
              {analysisSummary.topCategories.map((cat) => (
                <Badge key={cat} size="sm" variant="light" color="teal">
                  {cat}
                </Badge>
              ))}
            </Group>
          </Box>
        )}

        <Button
          component={Link}
          to="/training?tab=routes"
          variant="subtle"
          size="xs"
          rightSection={<IconChevronRight size={14} />}
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Explore route analysis
        </Button>
      </Stack>
    </Card>
  );
}

export default RouteAnalysisSummaryWidget;
