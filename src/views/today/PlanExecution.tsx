import { Skeleton } from '@mantine/core';
import { ClusterCard } from './shared/ClusterCard';
import { ClusterHeader } from './shared/ClusterHeader';
import { MetricCell } from './shared/MetricCell';
import { MetricBar } from './shared/MetricBar';
import { PhaseStrip } from './shared/PhaseStrip';
import { DotRow } from './shared/DotRow';
import { EmptyBaseline } from './shared/EmptyBaseline';
import { useUnits } from '../../utils/units';
import { efiWord, tcasWord } from '../../utils/todayVocabulary';
import type { TodayData } from './hooks/useTodayData';

interface Props {
  data: TodayData;
}

function titleCase(s: string | null): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function PlanExecution({ data }: Props) {
  const { planExecution, loading } = data;
  const { formatDistance } = useUnits();
  const isLoading = loading.planExecution;

  const efi = efiWord(planExecution.efi28d);
  const tcas = tcasWord(planExecution.tcas);

  const phaseLabel =
    planExecution.plan.currentPhase && planExecution.plan.currentWeekInPlan
      ? `${titleCase(planExecution.plan.currentPhase)} · Wk ${planExecution.plan.currentWeekInPlan}`
      : 'No active plan';

  const planSubtitle =
    planExecution.race
      ? `${planExecution.race.daysUntil} D · ${planExecution.race.name.toUpperCase()}`
      : null;

  return (
    <ClusterCard>
      <ClusterHeader title="PLAN EXECUTION" subtitle="HOW THE WORK IS GOING" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {/* PLAN */}
        <MetricCell
          label="PLAN"
          visual={
            isLoading ? (
              <Skeleton height={8} />
            ) : planExecution.plan.phases.length === 0 ? (
              <EmptyBaseline />
            ) : (
              <PhaseStrip
                phases={planExecution.plan.phases}
                totalWeeks={planExecution.plan.totalWeeks}
                currentWeek={planExecution.plan.currentWeekInPlan}
              />
            )
          }
          word={phaseLabel}
          wordToken={planExecution.plan.phases.length === 0 ? 'gray' : 'teal'}
          subtitle={planSubtitle}
        />

        {/* EFI */}
        <MetricCell
          label="EFI · 28D"
          visual={
            isLoading ? (
              <Skeleton height={8} />
            ) : planExecution.efi28d == null ? (
              <EmptyBaseline />
            ) : (
              <MetricBar
                min={0}
                max={100}
                markerValue={planExecution.efi28d}
                zones={[
                  { start: 0, end: 35, token: 'coral' },
                  { start: 35, end: 60, token: 'orange' },
                  { start: 60, end: 85, token: 'gold' },
                  { start: 85, end: 100, token: 'teal' },
                ]}
              />
            )
          }
          word={efi.word}
          wordToken={efi.token}
          subtitle={
            planExecution.efi28d == null ? null : `${planExecution.efi28d.toFixed(0)} / 100`
          }
        />

        {/* TCAS */}
        <MetricCell
          label="TCAS · 6W"
          visual={
            isLoading ? (
              <Skeleton height={8} />
            ) : planExecution.tcas == null ? (
              <EmptyBaseline />
            ) : (
              <MetricBar
                min={0}
                max={100}
                markerValue={planExecution.tcas}
                zones={[
                  { start: 0, end: 30, token: 'coral' },
                  { start: 30, end: 60, token: 'orange' },
                  { start: 60, end: 85, token: 'gold' },
                  { start: 85, end: 100, token: 'teal' },
                ]}
              />
            )
          }
          word={tcas.word}
          wordToken={tcas.token}
          subtitle={
            planExecution.tcas == null ? null : `${planExecution.tcas.toFixed(0)} / 100`
          }
        />

        {/* THIS WK */}
        <MetricCell
          label="THIS WK"
          visual={
            isLoading ? (
              <Skeleton height={12} />
            ) : (
              <DotRow
                total={planExecution.weekRideCount.planned}
                completed={planExecution.weekRideCount.completed}
              />
            )
          }
          word={
            planExecution.weekRideCount.planned > 0
              ? `${planExecution.weekRideCount.completed} of ${planExecution.weekRideCount.planned}`
              : 'No plan this week'
          }
          wordToken={
            planExecution.weekRideCount.planned === 0
              ? 'gray'
              : planExecution.weekRideCount.completed >= planExecution.weekRideCount.planned
                ? 'teal'
                : 'gold'
          }
          subtitle={
            planExecution.weekDistanceKm > 0
              ? formatDistance(planExecution.weekDistanceKm)
              : null
          }
        />
      </div>
    </ClusterCard>
  );
}
