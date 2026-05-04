import { Box, SimpleGrid } from '@mantine/core';
import { ClusterCard } from './shared/ClusterCard';
import { ClusterHeader } from './shared/ClusterHeader';
import { MetricCell } from './shared/MetricCell';
import { MetricBar, type BarZone } from './shared/MetricBar';
import { TrendVisual } from './shared/TrendVisual';
import { todayColors } from '../../utils/todayVocabulary';
import type { AthleteState as AthleteStateData } from './useTodayData';

interface AthleteStateProps {
  data: AthleteStateData;
  /** Layout overrides — used by mobile (2x2) and desktop (1x4). */
  cols?: number;
  onCellClick?: (label: string) => void;
}

// Form Score zones cover -30 to +30 (visual range). Total span = 60.
const FORM_VISUAL_MIN = -30;
const FORM_VISUAL_MAX = 30;
const FORM_VISUAL_SPAN = FORM_VISUAL_MAX - FORM_VISUAL_MIN;

const FORM_ZONES: BarZone[] = [
  // -30 to -20 (drained), -20 to -10 (loaded), -10 to 5 (sweet),
  // 5 to 15 (sharp), 15 to 30 (stale)
  { fraction: 10 / FORM_VISUAL_SPAN, color: todayColors.coral },
  { fraction: 10 / FORM_VISUAL_SPAN, color: todayColors.orange },
  { fraction: 15 / FORM_VISUAL_SPAN, color: todayColors.teal },
  { fraction: 10 / FORM_VISUAL_SPAN, color: todayColors.gold },
  { fraction: 15 / FORM_VISUAL_SPAN, color: todayColors.gray },
];

const FATIGUE_ZONES: BarZone[] = [
  { fraction: 0.25, color: todayColors.gray },
  { fraction: 0.45, color: todayColors.teal },
  { fraction: 0.18, color: todayColors.orange },
  { fraction: 0.12, color: todayColors.coral },
];

const FITNESS_ZONES: BarZone[] = [
  { fraction: 1, color: todayColors.teal },
];

function formMarkerPos(score: number | null): number | null {
  if (score == null || !Number.isFinite(score)) return null;
  const clamped = Math.min(FORM_VISUAL_MAX, Math.max(FORM_VISUAL_MIN, score));
  return (clamped - FORM_VISUAL_MIN) / FORM_VISUAL_SPAN;
}

function formatSubtitle(value: number | null, suffix = ''): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${Math.round(value)}${suffix}`;
}

export function AthleteState({ data, cols = 4, onCellClick }: AthleteStateProps) {
  const formMarker = formMarkerPos(data.formScore);
  const fitnessMarker = data.fitness != null ? data.fitnessRelative : null;
  const fatigueMarker = data.fatigue != null ? data.fatigueRelative : null;

  const formSubtitle = data.formScore == null ? null : `FS ${formatSubtitle(data.formScore)}`;
  const fitnessSubtitle = data.fitness == null
    ? null
    : `TFI ${Math.round(data.fitness)}`;
  const fatigueSubtitle = data.fatigue == null
    ? null
    : `AFI ${Math.round(data.fatigue)}`;
  const trendSubtitle = data.trendDeltaPct === 0 && data.trendWord === 'Building baseline'
    ? null
    : `${formatSubtitle(data.trendDeltaPct, '%')} / 4w`;

  return (
    <ClusterCard>
      <ClusterHeader title="ATHLETE STATE" subtitle="HOW THE BODY IS" />
      <SimpleGrid cols={cols} spacing={14} verticalSpacing={14}>
        <MetricCell
          label="FORM"
          visual={<MetricBar zones={FORM_ZONES} markerPos={formMarker} />}
          word={data.formWord}
          wordColor={data.formColor}
          subtitle={formSubtitle}
          onClick={onCellClick ? () => onCellClick('form') : undefined}
        />
        <MetricCell
          label="FITNESS"
          visual={<MetricBar zones={FITNESS_ZONES} markerPos={fitnessMarker} />}
          word={data.fitnessWord}
          wordColor={data.fitnessColor}
          subtitle={fitnessSubtitle}
          onClick={onCellClick ? () => onCellClick('fitness') : undefined}
        />
        <MetricCell
          label="FATIGUE"
          visual={<MetricBar zones={FATIGUE_ZONES} markerPos={fatigueMarker} />}
          word={data.fatigueWord}
          wordColor={data.fatigueColor}
          subtitle={fatigueSubtitle}
          onClick={onCellClick ? () => onCellClick('fatigue') : undefined}
        />
        <MetricCell
          label="TREND"
          visual={
            <Box style={{ paddingTop: 4 }}>
              <TrendVisual direction={data.trend} />
            </Box>
          }
          word={data.trendWord}
          wordColor={data.trendColor}
          subtitle={trendSubtitle}
          onClick={onCellClick ? () => onCellClick('trend') : undefined}
        />
      </SimpleGrid>
    </ClusterCard>
  );
}
