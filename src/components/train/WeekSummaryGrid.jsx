import { Box, Group, Text, SimpleGrid, Skeleton } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';

function WeekSummaryGrid({ weeklyStats, actualWeeklyStats, plannedWorkouts, formatDist, formatTime, loading, trainingMetrics }) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  if (loading) {
    return (
      <SimpleGrid cols={isMobile ? 2 : 4} spacing={0}>
        {[1, 2, 3, 4].map((i) => (
          <Box
            key={i}
            style={{
              padding: '12px 16px',
              border: '0.5px solid var(--color-border)',
              backgroundColor: 'var(--color-card)',
            }}
          >
            <Skeleton height={10} width={60} mb={6} />
            <Skeleton height={20} width={50} />
          </Box>
        ))}
      </SimpleGrid>
    );
  }

  // Calculate weekly TSS from weeklyStats
  const weeklyTSS = weeklyStats?.totalTSS || 0;

  // Calculate planned TSS for current week
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const thisMonday = new Date(now);
  thisMonday.setDate(thisMonday.getDate() + mondayOffset);
  thisMonday.setHours(0, 0, 0, 0);
  const thisSunday = new Date(thisMonday);
  thisSunday.setDate(thisSunday.getDate() + 6);
  thisSunday.setHours(23, 59, 59, 999);

  const weekPlanned = (plannedWorkouts || []).filter(w => {
    const d = new Date(w.scheduled_date);
    return d >= thisMonday && d <= thisSunday;
  });

  const plannedTSS = weekPlanned.reduce((sum, w) => sum + (w.tss || 0), 0);
  const plannedCount = weekPlanned.length;
  const completedCount = actualWeeklyStats?.activityCount || 0;
  const compliance = plannedCount > 0
    ? Math.round((completedCount / plannedCount) * 100)
    : 0;

  // Total duration this week
  const totalTime = actualWeeklyStats?.totalTime || 0;
  const formattedTime = formatTime ? formatTime(totalTime) : `${Math.round(totalTime / 3600)}h`;

  // Planned duration for the week
  const plannedDurationMin = weekPlanned.reduce((sum, w) => sum + (w.target_duration || w.duration_minutes || 0), 0);
  const plannedHours = Math.floor(plannedDurationMin / 60);
  const plannedMins = plannedDurationMin % 60;
  const plannedDurationStr = plannedHours > 0 ? `${plannedHours}h ${plannedMins}m` : `${plannedMins}m`;

  // Form / TSB
  const tsb = trainingMetrics?.tsb ?? null;
  const tsbDisplay = tsb !== null ? String(Math.round(tsb)) : '--';
  const tsbColor = tsb === null ? 'var(--color-text-muted)' : tsb >= 0 ? 'var(--color-teal)' : 'var(--color-orange)';

  const cells = [
    {
      label: 'PLANNED TSS',
      value: String(plannedTSS || '--'),
      color: 'var(--color-teal)',
    },
    {
      label: 'DURATION',
      value: plannedDurationMin > 0 ? plannedDurationStr : formattedTime,
      color: 'var(--color-text-primary)',
    },
    {
      label: 'WORKOUTS',
      value: `${completedCount} / ${plannedCount}`,
      color: 'var(--color-teal)',
    },
    {
      label: 'FORM (TSB)',
      value: tsbDisplay,
      color: tsbColor,
    },
  ];

  return (
    <SimpleGrid cols={isMobile ? 2 : 4} spacing={0}>
      {cells.map((cell) => (
        <Box
          key={cell.label}
          style={{
            padding: '12px 16px',
            border: '0.5px solid var(--color-border)',
            backgroundColor: 'var(--color-card)',
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
              marginBottom: 4,
            }}
          >
            {cell.label}
          </Text>
          <Text
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 20,
              fontWeight: 700,
              color: cell.color,
              lineHeight: 1.2,
            }}
          >
            {cell.value}
          </Text>
        </Box>
      ))}
    </SimpleGrid>
  );
}

export default WeekSummaryGrid;
