import { Link } from 'react-router-dom';
import { Box, Group, Text, Badge, Progress, Button, Skeleton } from '@mantine/core';
import { CaretRight, CalendarBlank, Trophy } from '@phosphor-icons/react';

function PlanProgressBar({ activePlan, plannedWorkouts, loading }) {
  if (loading) {
    return (
      <Box
        style={{
          border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-card)',
          padding: '16px 20px',
        }}
      >
        <Skeleton height={14} width="40%" mb={10} />
        <Skeleton height={8} mb={8} />
        <Skeleton height={12} width="30%" />
      </Box>
    );
  }

  if (!activePlan) {
    return (
      <Box
        style={{
          border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-card)',
          padding: '16px 20px',
        }}
      >
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <CalendarBlank size={18} color="var(--color-text-muted)" />
            <Text
              style={{
                fontSize: 14,
                color: 'var(--color-text-secondary)',
              }}
            >
              No active training plan
            </Text>
          </Group>
          <Button
            component={Link}
            to="/train/planner?tab=browse"
            variant="light"
            color="teal"
            size="compact-sm"
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              fontSize: 11,
            }}
          >
            BROWSE PLANS
          </Button>
        </Group>
      </Box>
    );
  }

  // Calculate plan progress
  const now = new Date();
  const startDate = activePlan.started_at ? new Date(activePlan.started_at) : null;
  const targetDate = activePlan.target_event_date ? new Date(activePlan.target_event_date) : null;

  let progressPercent = 0;
  let currentWeekNum = 0;
  let totalWeeks = 0;
  let daysToEvent = null;

  if (startDate) {
    const daysSinceStart = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
    currentWeekNum = Math.floor(daysSinceStart / 7) + 1;

    if (targetDate) {
      const totalDays = Math.floor((targetDate - startDate) / (1000 * 60 * 60 * 24));
      totalWeeks = Math.ceil(totalDays / 7);
      progressPercent = Math.min(Math.max((daysSinceStart / totalDays) * 100, 0), 100);
      daysToEvent = Math.max(Math.floor((targetDate - now) / (1000 * 60 * 60 * 24)), 0);
    } else if (activePlan.duration_weeks) {
      totalWeeks = activePlan.duration_weeks;
      progressPercent = Math.min(Math.max((currentWeekNum / totalWeeks) * 100, 0), 100);
    }
  }

  // Determine current phase from plan metadata
  const currentPhase = activePlan.current_phase || activePlan.phase || null;

  return (
    <Box
      style={{
        border: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-card)',
        padding: '16px 20px',
      }}
    >
      {/* Plan name and phase */}
      <Group justify="space-between" align="center" mb={10}>
        <Group gap="sm">
          <Text
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: '1px',
              textTransform: 'uppercase',
              color: 'var(--color-text-primary)',
            }}
          >
            {activePlan.name}
          </Text>
          {currentPhase && (
            <Badge
              variant="light"
              color="teal"
              size="sm"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase' }}
            >
              {currentPhase}
            </Badge>
          )}
        </Group>
        <Group gap="md">
          {totalWeeks > 0 && (
            <Text
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: 12,
                color: 'var(--color-text-muted)',
              }}
            >
              WK {currentWeekNum}/{totalWeeks}
            </Text>
          )}
          {daysToEvent !== null && (
            <Group gap={4}>
              <Trophy size={14} color="var(--color-gold)" />
              <Text
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--color-gold)',
                }}
              >
                {daysToEvent}D
              </Text>
            </Group>
          )}
          <Button
            component={Link}
            to="/train/planner"
            variant="subtle"
            color="gray"
            size="compact-xs"
            rightSection={<CaretRight size={12} />}
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
            }}
          >
            EDIT
          </Button>
        </Group>
      </Group>

      {/* Progress bar */}
      <Progress
        value={progressPercent}
        color="teal"
        size="sm"
        radius={0}
      />
    </Box>
  );
}

export default PlanProgressBar;
