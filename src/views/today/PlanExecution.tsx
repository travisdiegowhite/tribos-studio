import { SimpleGrid } from '@mantine/core';
import { ClusterCard } from './shared/ClusterCard';
import { ClusterHeader } from './shared/ClusterHeader';
import { MetricCell } from './shared/MetricCell';
import { MetricBar, type BarZone } from './shared/MetricBar';
import { DotRow } from './shared/DotRow';
import { PhaseStrip } from './shared/PhaseStrip';
import { todayColors } from '../../utils/todayVocabulary';
import type { PlanExecution as PlanExecutionData } from './useTodayData';

interface PlanExecutionProps {
  data: PlanExecutionData;
  cols?: number;
  onCellClick?: (label: string) => void;
}

const EFI_ZONES: BarZone[] = [
  { fraction: 0.35, color: todayColors.coral },
  { fraction: 0.25, color: todayColors.orange },
  { fraction: 0.25, color: todayColors.gold },
  { fraction: 0.15, color: todayColors.teal },
];

const TCAS_ZONES: BarZone[] = [
  { fraction: 0.30, color: todayColors.coral },
  { fraction: 0.30, color: todayColors.orange },
  { fraction: 0.25, color: todayColors.gold },
  { fraction: 0.15, color: todayColors.teal },
];

function clamped01(value: number | null, max = 100): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value / max));
}

function formatPhaseWord(phase: string, weekInPhase: number): string {
  const titled = phase.charAt(0).toUpperCase() + phase.slice(1);
  return `${titled} · Wk ${Math.max(1, weekInPhase)}`;
}

function deriveWeekInPhase(
  phases: PlanExecutionData['phases'],
  currentWeek: number,
): number {
  let cumulative = 0;
  for (const p of phases) {
    cumulative += p.weeks;
    if (currentWeek <= cumulative) {
      const phaseStart = cumulative - p.weeks;
      return currentWeek - phaseStart;
    }
  }
  return currentWeek;
}

export function PlanExecution({ data, cols = 4, onCellClick }: PlanExecutionProps) {
  const efiMarker = clamped01(data.efi28d);
  const tcasMarker = clamped01(data.tcas);
  const weekInPhase = deriveWeekInPhase(data.phases, data.currentWeekInPlan);

  const planSubtitle = data.daysToRace != null && data.raceName
    ? `${data.daysToRace} D · ${data.raceName.toUpperCase()}`
    : null;
  const efiSubtitle = data.efi28d == null ? null : `${Math.round(data.efi28d)} / 100`;
  const tcasSubtitle = data.tcas == null ? null : `${Math.round(data.tcas)} / 100`;
  const weekSubtitle = data.weekDistanceMi > 0
    ? `${data.weekDistanceMi.toFixed(1)} mi`
    : null;
  const weekWord = data.weekRideCount.planned > 0
    ? `${data.weekRideCount.completed} of ${data.weekRideCount.planned}`
    : 'Building baseline';
  const weekColor = data.weekRideCount.planned > 0
    ? data.weekRideCount.completed >= data.weekRideCount.planned
      ? todayColors.teal
      : data.weekRideCount.completed === 0
        ? todayColors.gray
        : todayColors.orange
    : todayColors.gray;

  return (
    <ClusterCard>
      <ClusterHeader title="PLAN EXECUTION" subtitle="HOW THE WORK IS GOING" />
      <SimpleGrid cols={cols} spacing={14} verticalSpacing={14}>
        <MetricCell
          label="PLAN"
          visual={
            <PhaseStrip
              phases={data.phases}
              currentWeek={data.currentWeekInPlan}
              totalWeeks={data.totalWeeks}
            />
          }
          word={
            data.phases.length > 0
              ? formatPhaseWord(data.currentPhase, weekInPhase)
              : 'Building baseline'
          }
          wordColor={
            data.phases.length > 0
              ? data.phases.find((p) => p.name === data.currentPhase)?.color ?? todayColors.teal
              : todayColors.gray
          }
          subtitle={planSubtitle}
          onClick={onCellClick ? () => onCellClick('plan') : undefined}
        />
        <MetricCell
          label="EFI · 28D"
          visual={<MetricBar zones={EFI_ZONES} markerPos={efiMarker} />}
          word={data.efiWord}
          wordColor={data.efiColor}
          subtitle={efiSubtitle}
          onClick={onCellClick ? () => onCellClick('efi') : undefined}
        />
        <MetricCell
          label="TCAS · 6W"
          visual={<MetricBar zones={TCAS_ZONES} markerPos={tcasMarker} />}
          word={data.tcasWord}
          wordColor={data.tcasColor}
          subtitle={tcasSubtitle}
          onClick={onCellClick ? () => onCellClick('tcas') : undefined}
        />
        <MetricCell
          label="THIS WK"
          visual={
            <DotRow
              total={Math.max(data.weekRideCount.planned, 5)}
              completed={data.weekRideCount.completed}
            />
          }
          word={weekWord}
          wordColor={weekColor}
          subtitle={weekSubtitle}
          onClick={onCellClick ? () => onCellClick('this_week') : undefined}
        />
      </SimpleGrid>
    </ClusterCard>
  );
}
