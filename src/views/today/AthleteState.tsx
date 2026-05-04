import { Box, SimpleGrid } from '@mantine/core';
import { ClusterCard } from './shared/ClusterCard';
import { ClusterHeader } from './shared/ClusterHeader';
import { MetricCell } from './shared/MetricCell';
import { MetricBar, type BarZone } from './shared/MetricBar';
import { MetricBarEmpty } from './shared/MetricBarEmpty';
import { FitnessSparkline } from './shared/FitnessSparkline';
import { todayColors } from '../../utils/todayVocabulary';
import type { AthleteState as AthleteStateData } from './useTodayData';

interface AthleteStateProps {
  data: AthleteStateData;
  /** Layout overrides — desktop uses 3, mobile uses 1 (vertical stack). */
  cols?: number;
  onCellClick?: (label: string) => void;
}

// Form Score visual range is [−30, +30]; the bar zones cover that span.
// 16% / 16% / 36% / 16% / 16% per spec. Sums to 100%.
const FORM_VISUAL_MIN = -30;
const FORM_VISUAL_MAX = 30;
const FORM_VISUAL_SPAN = FORM_VISUAL_MAX - FORM_VISUAL_MIN;

const FORM_ZONES: BarZone[] = [
  { fraction: 0.16, color: todayColors.coral },
  { fraction: 0.16, color: todayColors.orange },
  { fraction: 0.36, color: todayColors.teal },
  { fraction: 0.16, color: todayColors.gold },
  { fraction: 0.16, color: todayColors.gray },
];

// Personal-range fatigue zones: 25% / 45% / 18% / 12% per spec.
const FATIGUE_ZONES: BarZone[] = [
  { fraction: 0.25, color: todayColors.gray },
  { fraction: 0.45, color: todayColors.teal },
  { fraction: 0.18, color: todayColors.orange },
  { fraction: 0.12, color: todayColors.coral },
];

function formMarkerPos(score: number | null): number | null {
  if (score == null || !Number.isFinite(score)) return null;
  const clamped = Math.min(FORM_VISUAL_MAX, Math.max(FORM_VISUAL_MIN, score));
  return (clamped - FORM_VISUAL_MIN) / FORM_VISUAL_SPAN;
}

function formatSigned(value: number, suffix = ''): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${Math.round(value)}${suffix}`;
}

function arrowFor(delta: number): string {
  if (delta > 0.5) return '↗';
  if (delta < -0.5) return '↘';
  return '→';
}

export function AthleteState({ data, cols = 3, onCellClick }: AthleteStateProps) {
  // ── FORM ────────────────────────────────────────────────────────────────
  const formMarker = data.formEmpty ? null : formMarkerPos(data.formScore);
  const formVisual = data.formEmpty ? (
    <MetricBarEmpty />
  ) : (
    <MetricBar zones={FORM_ZONES} markerPos={formMarker} />
  );
  const formSubtitle = data.formEmpty
    ? '7-DAY HISTORY REQUIRED'
    : data.formScore != null
      ? `FS ${formatSigned(data.formScore)}`
      : null;

  // ── FITNESS ─────────────────────────────────────────────────────────────
  const fitnessVisual = (
    <Box style={{ paddingTop: 4 }}>
      <FitnessSparkline history={data.fitnessHistory} empty={data.fitnessEmpty} />
    </Box>
  );
  const fitnessSubtitle = data.fitnessEmpty
    ? `${data.fitnessDaysLogged} of 14 LOGGED`
    : data.fitnessCurrent != null
      ? `${Math.round(data.fitnessCurrent)} · ${arrowFor(data.fitnessDelta28d)} ${formatSigned(data.fitnessDelta28d)} / 28d`
      : null;

  // ── FATIGUE ─────────────────────────────────────────────────────────────
  const fatigueMarker = data.fatigueEmpty ? null : data.fatigueRelative;
  const fatigueVisual = data.fatigueEmpty ? (
    <MetricBarEmpty />
  ) : (
    <MetricBar zones={FATIGUE_ZONES} markerPos={fatigueMarker} />
  );
  const fatigueSubtitle = data.fatigueEmpty
    ? '7-DAY HISTORY REQUIRED'
    : data.fatigue != null
      ? `AFI ${Math.round(data.fatigue)}`
      : null;

  return (
    <ClusterCard>
      <ClusterHeader title="ATHLETE STATE" subtitle="HOW THE BODY IS" />
      <SimpleGrid cols={cols} spacing={14} verticalSpacing={14}>
        <MetricCell
          label="FORM"
          visual={formVisual}
          word={data.formWord}
          wordColor={data.formColor}
          subtitle={formSubtitle}
          onClick={onCellClick ? () => onCellClick('form') : undefined}
        />
        <MetricCell
          label="FITNESS"
          visual={fitnessVisual}
          word={data.fitnessWord}
          wordColor={data.fitnessColor}
          subtitle={fitnessSubtitle}
          onClick={onCellClick ? () => onCellClick('fitness') : undefined}
        />
        <MetricCell
          label="FATIGUE"
          visual={fatigueVisual}
          word={data.fatigueWord}
          wordColor={data.fatigueColor}
          subtitle={fatigueSubtitle}
          onClick={onCellClick ? () => onCellClick('fatigue') : undefined}
        />
      </SimpleGrid>
    </ClusterCard>
  );
}
