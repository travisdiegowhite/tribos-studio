import { Link } from 'react-router-dom';
import { Box, Group, Text, Button } from '@mantine/core';
import { ArrowRight, Path } from '@phosphor-icons/react';

function BuilderPromptBar({ todayWorkout, medianDistanceKm, formatDist }) {
  // Build context string from today's workout
  let contextText = 'Plan a new ride from scratch, build from a past ride, or let AI suggest one.';
  let routeLink = '/ride/new';

  if (todayWorkout) {
    const workoutType = todayWorkout.title || todayWorkout.workout_type || 'workout';
    const duration = todayWorkout.duration_minutes;
    contextText = `Today's plan calls for ${workoutType}${duration ? ` — ${duration} min` : ''}. Build a route to match.`;
    const params = new URLSearchParams({ mode: 'ai' });
    if (todayWorkout.duration_minutes) params.set('duration', String(todayWorkout.duration_minutes));
    routeLink = `/ride/new?${params.toString()}`;
  } else if (medianDistanceKm) {
    contextText = `Your typical ride is ${formatDist ? formatDist(medianDistanceKm) : `${medianDistanceKm} km`}. Build something new.`;
  }

  return (
    <Box
      style={{
        backgroundColor: '#141410',
        padding: '20px 24px',
        border: '1px solid var(--color-border)',
      }}
    >
      <Group justify="space-between" align="center" wrap="wrap" gap="md">
        <Box style={{ flex: 1, minWidth: 200 }}>
          <Group gap="sm" mb={6}>
            <Path size={18} color="var(--color-teal)" />
            <Text
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '2px',
                textTransform: 'uppercase',
                color: '#FFFFFF',
              }}
            >
              BUILD A NEW ROUTE
            </Text>
          </Group>
          <Text
            style={{
              fontFamily: "'Barlow', sans-serif",
              fontSize: 14,
              color: '#9A9990',
              lineHeight: 1.4,
            }}
          >
            {contextText}
          </Text>
        </Box>
        <Button
          component={Link}
          to={routeLink}
          variant="filled"
          color="teal"
          rightSection={<ArrowRight size={16} />}
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
          }}
        >
          CONFIGURE
        </Button>
      </Group>
    </Box>
  );
}

export default BuilderPromptBar;
