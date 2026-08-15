import { Box, SimpleGrid, Skeleton } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { MetricCitation } from '../ui/MetricCitation';

function WeekSummaryGrid({ weeklyStats, actualWeeklyStats, plannedWorkouts, formatDist, formatTime, loading }) {
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

  // Canonical target_rss first, legacy target_tss fallback (planned_workouts
  // has no `tss` column — reading it made plannedTSS silently always 0).
  const plannedTSS = weekPlanned.reduce(
    (sum, w) => sum + (Number(w.target_rss ?? w.target_tss) || 0),
    0
  );
  const plannedCount = weekPlanned.length;
  const completedCount = actualWeeklyStats?.activityCount || 0;
  const compliance = plannedCount > 0
    ? Math.round((completedCount / plannedCount) * 100)
    : 0;

  // Total duration this week
  const totalTime = actualWeeklyStats?.totalTime || 0;
  const formattedTime = formatTime ? formatTime(totalTime) : `${Math.round(totalTime / 3600)}h`;

  // The sentence carries the cell row (thesis P2); the numbers cite it.
  const remaining = Math.max(0, plannedCount - completedCount);
  let sentence;
  if (plannedCount > 0) {
    sentence =
      remaining === 0
        ? `All ${plannedCount} planned sessions done — the week's work is banked.`
        : `You're ${completedCount} of ${plannedCount} sessions into the week's plan, with ${remaining} still ahead.`;
  } else if (weeklyTSS > 0 || totalTime > 0) {
    sentence = `An unplanned week so far — ${formattedTime} of riding logged.`;
  } else {
    sentence = 'Nothing logged yet this week.';
  }

  const metrics = [
    {
      label: 'RSS',
      value: plannedTSS > 0 ? `${Math.round(weeklyTSS)}/${Math.round(plannedTSS)}` : String(Math.round(weeklyTSS)),
    },
    { label: 'TIME', value: formattedTime },
    { label: 'WORKOUTS', value: `${completedCount}/${plannedCount}` },
    { label: 'COMPLIANCE', value: plannedCount > 0 ? `${compliance}%` : '--' },
  ];

  return (
    <Box
      style={{
        padding: '14px 16px',
        border: '0.5px solid var(--color-border)',
        backgroundColor: 'var(--color-card)',
      }}
    >
      <MetricCitation
        sentence={sentence}
        color="var(--color-text-primary)"
        metrics={metrics}
        sentenceStyle={{ fontSize: isMobile ? 16 : 18 }}
        chipStyle={{ fontFamily: "'DM Mono', monospace", color: 'var(--color-text-muted)', flexWrap: 'wrap' }}
      />
    </Box>
  );
}

export default WeekSummaryGrid;
