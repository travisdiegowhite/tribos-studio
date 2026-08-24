import { Box, SimpleGrid, Skeleton } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { MetricCitation } from '../ui/MetricCitation';
import { getTodayString, toDateKey, weekRangeKeys } from '../../utils/dateUtils';

/**
 * The week's plan-vs-actual citation row.
 *
 * Every figure here is scoped to the SAME Monday–Sunday week, compared as
 * date KEYS. Three separate mismatches used to live in this component:
 *   • the window was built from local `Date` bounds but compared against
 *     `new Date('YYYY-MM-DD')` (UTC midnight), which admitted an 8th day;
 *   • the RSS numerator came from `weeklyStats`, which is scoped to the
 *     dashboard's 30-day timeRange selector, not to the week;
 *   • the "X of Y" counted activities over planned rows, so three rides
 *     against two planned sessions read 150%.
 * Keep all four metrics on one window — this row sits directly above
 * CheckInWeekBar, and any divergence between them is visible to the athlete.
 */
function WeekSummaryGrid({ actualWeeklyStats, plannedWorkouts, formatTime, loading }) {
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

  // Monday–Sunday of the current week, as date keys.
  const week = weekRangeKeys(getTodayString());
  const inWeek = (dateish) => {
    const key = toDateKey(dateish);
    return !!(week && key && key >= week.startKey && key <= week.endKeyInclusive);
  };

  // A rest day is not a session — the plan's own `workouts_total` excludes
  // them too (api/coach.js handleActivateArc), so the counts agree.
  const weekSessions = (plannedWorkouts || []).filter(
    (w) => inWeek(w.scheduled_date) && w.workout_type !== 'rest'
  );

  // Canonical target_rss first, legacy target_tss fallback (planned_workouts
  // has no `tss` column — reading it made plannedTSS silently always 0).
  const plannedTSS = weekSessions.reduce(
    (sum, w) => sum + (Number(w.target_rss ?? w.target_tss) || 0),
    0
  );
  const plannedCount = weekSessions.length;
  const completedCount = weekSessions.filter((w) => w.completed === true).length;
  const compliance = plannedCount > 0
    ? Math.round((completedCount / plannedCount) * 100)
    : 0;

  // Actual load and time for THIS week (not the timeRange selector's window).
  const weeklyTSS = actualWeeklyStats?.totalTSS || 0;
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
