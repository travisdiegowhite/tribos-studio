import { Box, Text, Skeleton } from '@mantine/core';

function getCoachMessage(tsb, todayWorkout) {
  const workoutType = todayWorkout?.title || todayWorkout?.workout_type || 'session';

  if (!todayWorkout && tsb === 0) {
    return 'Connect your training data to get personalized insights.';
  }

  if (!todayWorkout) {
    return 'Rest day — recovery is training too. Your body adapts during rest, not during the ride.';
  }

  if (tsb > 25) {
    return `You're fresh and ready. Today's ${workoutType} will be quality work. Make it count.`;
  }
  if (tsb > 5) {
    return `Good form. You're in a strong position for today's ${workoutType}. Trust the process.`;
  }
  if (tsb > -10) {
    return `Balanced training load. Stay consistent with today's ${workoutType} and you'll keep building.`;
  }
  if (tsb > -30) {
    return `Building fatigue — this is normal during a training block. Today's ${workoutType} keeps the stimulus going.`;
  }
  return `High fatigue detected. Consider reducing today's intensity or swapping for an easier session.`;
}

function CoachStrip({ tsb, todayWorkout, loading }) {
  if (loading) {
    return (
      <Box
        style={{
          borderLeft: '3px solid var(--color-teal)',
          padding: '14px 16px',
          backgroundColor: 'var(--color-card)',
        }}
      >
        <Skeleton height={14} width="80%" />
      </Box>
    );
  }

  const message = getCoachMessage(tsb, todayWorkout);

  return (
    <Box
      style={{
        borderLeft: '3px solid var(--color-teal)',
        padding: '14px 16px',
        backgroundColor: 'var(--color-card)',
      }}
    >
      <Text
        style={{
          fontFamily: "'Barlow', sans-serif",
          fontSize: 13,
          lineHeight: 1.55,
          color: 'var(--color-text-secondary)',
        }}
      >
        {message}
      </Text>
    </Box>
  );
}

export default CoachStrip;
