import { Link } from 'react-router-dom';
import { SimpleGrid, Text } from '@mantine/core';
import { ClusterCard } from './shared/ClusterCard';
import { ClusterHeader } from './shared/ClusterHeader';
import { MetricCell } from './shared/MetricCell';
import { MetricBar, type BarZone } from './shared/MetricBar';
import { MetricBarEmpty } from './shared/MetricBarEmpty';
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
  // ── PLAN cell ───────────────────────────────────────────────────────────
  const weekInPhase = deriveWeekInPhase(data.phases, data.currentWeekInPlan);
  const planSubtitle =
    data.daysToRace != null && data.raceName
      ? `${data.daysToRace} D · ${data.raceName.toUpperCase()}`
      : null;

  let planVisual: React.ReactNode;
  let planWord: string;
  let planColor: string;
  let planSub: React.ReactNode;

  if (data.planEmpty) {
    planVisual = <PhaseStrip phases={[]} currentWeek={0} totalWeeks={0} empty />;
    planWord = 'No active plan';
    planColor = todayColors.gray;
    planSub = (
      <Text
        component={Link}
        to="/train"
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
          color: todayColors.teal,
          textDecoration: 'none',
        }}
      >
        START A PLAN →
      </Text>
    );
  } else if (data.planStartsInDays != null) {
    planVisual = (
      <PhaseStrip
        phases={data.phases}
        currentWeek={1}
        totalWeeks={data.totalWeeks}
      />
    );
    planWord = `${data.currentPhase || 'Plan'} starts soon`;
    planColor = todayColors.teal;
    planSub = (
      <Text
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          color: '#7A7970',
        }}
      >
        {`${data.planStartsInDays} D · STARTS`}
      </Text>
    );
  } else {
    planVisual = (
      <PhaseStrip
        phases={data.phases}
        currentWeek={data.currentWeekInPlan}
        totalWeeks={data.totalWeeks}
      />
    );
    planWord = formatPhaseWord(data.currentPhase, weekInPhase);
    planColor =
      data.phases.find((p) => p.name === data.currentPhase)?.color ?? todayColors.teal;
    planSub = planSubtitle ? (
      <Text
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          color: '#7A7970',
        }}
      >
        {planSubtitle}
      </Text>
    ) : null;
  }

  // ── EFI cell ────────────────────────────────────────────────────────────
  const efiVisual = data.efiEmpty ? (
    <MetricBarEmpty />
  ) : (
    <MetricBar zones={EFI_ZONES} markerPos={clamped01(data.efi28d)} />
  );
  const efiWord = data.efiEmpty
    ? data.efiRidesNeeded > 0
      ? `Need ${data.efiRidesNeeded} more rides`
      : 'Building history'
    : data.efiWord;
  const efiSubtitle = data.efiEmpty
    ? 'BUILDING EFI HISTORY'
    : data.efi28d != null
      ? `${Math.round(data.efi28d)} / 100`
      : null;

  // ── TCAS cell ───────────────────────────────────────────────────────────
  const tcasVisual = data.tcasEmpty ? (
    <MetricBarEmpty />
  ) : (
    <MetricBar zones={TCAS_ZONES} markerPos={clamped01(data.tcas)} />
  );
  const tcasWeeksNeeded = Math.max(0, 4 - data.tcasWeeksLogged);
  const tcasWord = data.tcasEmpty
    ? tcasWeeksNeeded > 0
      ? `Need ${tcasWeeksNeeded} more week${tcasWeeksNeeded === 1 ? '' : 's'}`
      : 'Building history'
    : data.tcasWord;
  const tcasSubtitle = data.tcasEmpty
    ? `${data.tcasWeeksLogged} of 4 LOGGED`
    : data.tcas != null
      ? `${Math.round(data.tcas)} / 100`
      : null;

  // ── THIS WK cell ────────────────────────────────────────────────────────
  let weekVisual: React.ReactNode;
  let weekWord: string;
  let weekColor: string;
  let weekSubtitle: string | null;

  if (data.weekEmpty) {
    weekVisual = <DotRow total={5} completed={0} />;
    weekWord = 'No rides planned';
    weekColor = todayColors.gray;
    weekSubtitle = data.weekIsRestWeek ? 'REST WEEK' : 'OPEN WEEK';
  } else {
    weekVisual = (
      <DotRow
        total={Math.max(data.weekRideCount.planned, 5)}
        completed={data.weekRideCount.completed}
      />
    );
    weekWord = `${data.weekRideCount.completed} of ${data.weekRideCount.planned}`;
    weekColor =
      data.weekRideCount.completed >= data.weekRideCount.planned
        ? todayColors.teal
        : data.weekRideCount.completed === 0
          ? todayColors.gray
          : todayColors.orange;
    weekSubtitle = data.weekDistanceMi > 0 ? `${data.weekDistanceMi.toFixed(1)} mi` : null;
  }

  return (
    <ClusterCard>
      <ClusterHeader title="PLAN EXECUTION" subtitle="HOW THE WORK IS GOING" />
      <SimpleGrid cols={cols} spacing={14} verticalSpacing={14}>
        <MetricCell
          label="PLAN"
          visual={planVisual}
          word={planWord}
          wordColor={planColor}
          subtitle={planSub}
          onClick={onCellClick ? () => onCellClick('plan') : undefined}
        />
        <MetricCell
          label="EFI · 28D"
          visual={efiVisual}
          word={efiWord}
          wordColor={data.efiEmpty ? todayColors.gray : data.efiColor}
          subtitle={efiSubtitle}
          onClick={onCellClick ? () => onCellClick('efi') : undefined}
        />
        <MetricCell
          label="TCAS · 6W"
          visual={tcasVisual}
          word={tcasWord}
          wordColor={data.tcasEmpty ? todayColors.gray : data.tcasColor}
          subtitle={tcasSubtitle}
          onClick={onCellClick ? () => onCellClick('tcas') : undefined}
        />
        <MetricCell
          label="THIS WK"
          visual={weekVisual}
          word={weekWord}
          wordColor={weekColor}
          subtitle={weekSubtitle}
          onClick={onCellClick ? () => onCellClick('this_week') : undefined}
        />
      </SimpleGrid>
    </ClusterCard>
  );
}
