import { Box, Divider } from '@mantine/core';
import PlanProgressBar from './PlanProgressBar.jsx';
import WeekSummaryGrid from './WeekSummaryGrid.jsx';

/**
 * The plan strip and the week's plan-vs-actual row in ONE bordered card.
 *
 * They used to be two stacked cards on /train, and the CALENDAR tab then
 * repeated both of them inside TrainingCalendar — the same plan name, week
 * count and RSS/compliance figures three times before the calendar itself.
 * One frame, one set of numbers; the calendar below shows none of it.
 */
function PlanWeekCard({ activePlan, plannedWorkouts, actualWeeklyStats, formatTime, loading }) {
  return (
    <Box
      data-testid="plan-week-card"
      style={{
        border: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-card)',
        padding: '16px 20px',
      }}
    >
      <PlanProgressBar
        activePlan={activePlan}
        plannedWorkouts={plannedWorkouts}
        loading={loading}
        frameless
      />
      <Divider my="md" color="var(--color-border)" />
      <WeekSummaryGrid
        actualWeeklyStats={actualWeeklyStats}
        plannedWorkouts={plannedWorkouts}
        formatTime={formatTime}
        loading={loading}
        frameless
      />
    </Box>
  );
}

export default PlanWeekCard;
