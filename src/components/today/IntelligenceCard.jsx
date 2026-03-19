import { Link } from 'react-router-dom';
import { Box, Group, Text, Button, Badge, Skeleton, SimpleGrid } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Path, Play, CalendarBlank } from '@phosphor-icons/react';

function IntelligenceCard({ workout, plan, routeMatch, loading, formatDist }) {
  const isMobile = useMediaQuery('(max-width: 768px)');

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
          TODAY&apos;S FOCUS
        </Text>
        <Text
          fw={600}
          style={{
            fontSize: 20,
            color: 'var(--color-text-primary)',
            marginBottom: 4,
          }}
        >
          No active training plan
        </Text>
        <Text size="sm" style={{ color: 'var(--color-text-secondary)', marginBottom: 16 }}>
          Set up a plan to get personalized workouts and matched routes
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
          TODAY&apos;S FOCUS
        </Text>
        <Text
          fw={600}
          style={{
            fontSize: 20,
            color: 'var(--color-text-primary)',
            marginBottom: 4,
          }}
        >
          Rest Day
        </Text>
        <Text size="sm" style={{ color: 'var(--color-text-secondary)' }}>
          Recovery is part of the plan. Take it easy today.
        </Text>
      </Box>
    );
  }

  // Active workout + optional route match
  return (
    <Box
      style={{
        border: '1px solid var(--color-teal-border)',
        backgroundColor: 'var(--color-card)',
      }}
    >
      {/* Two-column content */}
      <SimpleGrid cols={isMobile ? 1 : 2} spacing={0}>
        {/* Left: Workout details */}
        <Box style={{ padding: 16, borderRight: isMobile ? 'none' : '0.5px solid var(--color-border)' }}>
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
            TODAY&apos;S FOCUS
          </Text>
          <Text
            fw={700}
            style={{
              fontSize: 20,
              color: 'var(--color-text-primary)',
              marginBottom: 6,
            }}
          >
            {workout.title || workout.workout_type || 'Workout'}
          </Text>
          <Group gap="md">
            {workout.duration_minutes && (
              <Text
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 16,
                  color: 'var(--color-text-secondary)',
                }}
              >
                {workout.duration_minutes} min
              </Text>
            )}
            {workout.tss && (
              <Text
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 16,
                  color: 'var(--color-text-muted)',
                }}
              >
                TSS {workout.tss}
              </Text>
            )}
          </Group>
        </Box>

        {/* Right: Route match */}
        <Box style={{ padding: 16 }}>
          {routeMatch ? (
            <>
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
              <Group gap="sm" align="center" mb={6}>
                <Path size={16} color="var(--color-teal)" />
                <Text
                  fw={600}
                  style={{
                    fontSize: 16,
                    color: 'var(--color-text-primary)',
                  }}
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
                {routeMatch.activity?.distance && formatDist && (
                  <Text
                    style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 14,
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {formatDist(routeMatch.activity.distance / 1000)}
                  </Text>
                )}
              </Group>
            </>
          ) : (
            <>
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
            </>
          )}
        </Box>
      </SimpleGrid>

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
        <Button
          component={Link}
          to="/train/planner"
          variant="outline"
          color="gray"
          size="sm"
        >
          VIEW PLAN
        </Button>
        <Button
          component={Link}
          to="/ride"
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
