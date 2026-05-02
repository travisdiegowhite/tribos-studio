import { Skeleton } from '@mantine/core';
import { ClusterCard } from './shared/ClusterCard';
import { ClusterHeader } from './shared/ClusterHeader';
import { MetricCell } from './shared/MetricCell';
import { MetricBar } from './shared/MetricBar';
import { TrendVisual } from './shared/TrendVisual';
import { EmptyBaseline } from './shared/EmptyBaseline';
import {
  formWordFromScore,
  fitnessWord,
  fatigueWordFromAFI,
  trendWord,
} from '../../utils/todayVocabulary';
import type { TodayData } from './hooks/useTodayData';

interface Props {
  data: TodayData;
}

export function AthleteState({ data }: Props) {
  const { athleteState, loading } = data;
  const isLoading = loading.athleteState;

  const form = formWordFromScore(athleteState.formScore);
  const fitness = fitnessWord(athleteState.trendDeltaPct);
  const fatigue = fatigueWordFromAFI(athleteState.afi, athleteState.afi28dMax);
  const trend = trendWord(athleteState.trendDeltaPct);

  const trendDirection: 'up' | 'flat' | 'down' =
    athleteState.trendDeltaPct == null
      ? 'flat'
      : athleteState.trendDeltaPct > 2
        ? 'up'
        : athleteState.trendDeltaPct < -2
          ? 'down'
          : 'flat';

  const fitnessRelative =
    athleteState.tfi != null && athleteState.tfi28dMax && athleteState.tfi28dMax > 0
      ? athleteState.tfi
      : null;

  return (
    <ClusterCard>
      <ClusterHeader title="ATHLETE STATE" subtitle="HOW THE BODY IS" />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
        }}
      >
        {/* FORM */}
        <MetricCell
          label="FORM"
          visual={
            isLoading ? (
              <Skeleton height={8} />
            ) : athleteState.formScore == null ? (
              <EmptyBaseline />
            ) : (
              <MetricBar
                min={-30}
                max={20}
                markerValue={athleteState.formScore}
                zones={[
                  { start: -30, end: -20, token: 'coral' },
                  { start: -20, end: -10, token: 'orange' },
                  { start: -10, end: 5, token: 'teal' },
                  { start: 5, end: 15, token: 'gold' },
                  { start: 15, end: 20, token: 'gray' },
                ]}
              />
            )
          }
          word={form.word}
          wordToken={form.token}
          subtitle={
            athleteState.formScore == null
              ? null
              : `${athleteState.formScore >= 0 ? '+' : ''}${athleteState.formScore.toFixed(1)} FS`
          }
        />

        {/* FITNESS */}
        <MetricCell
          label="FITNESS"
          visual={
            isLoading ? (
              <Skeleton height={8} />
            ) : fitnessRelative == null || athleteState.tfi28dMax == null ? (
              <EmptyBaseline />
            ) : (
              <MetricBar
                min={0}
                max={Math.max(athleteState.tfi28dMax, 1)}
                markerValue={fitnessRelative}
                zones={[
                  {
                    start: 0,
                    end: Math.max(athleteState.tfi28dMax, 1),
                    token: 'teal',
                  },
                ]}
              />
            )
          }
          word={fitness.word}
          wordToken={fitness.token}
          subtitle={
            athleteState.tfi == null
              ? null
              : `${athleteState.tfi.toFixed(1)} TFI`
          }
        />

        {/* FATIGUE */}
        <MetricCell
          label="FATIGUE"
          visual={
            isLoading ? (
              <Skeleton height={8} />
            ) : athleteState.afi == null || athleteState.afi28dMax == null ? (
              <EmptyBaseline />
            ) : (
              <MetricBar
                min={0}
                max={Math.max(athleteState.afi28dMax, 1)}
                markerValue={athleteState.afi}
                zones={[
                  { start: 0, end: athleteState.afi28dMax * 0.25, token: 'gray' },
                  {
                    start: athleteState.afi28dMax * 0.25,
                    end: athleteState.afi28dMax * 0.7,
                    token: 'teal',
                  },
                  {
                    start: athleteState.afi28dMax * 0.7,
                    end: athleteState.afi28dMax * 0.88,
                    token: 'orange',
                  },
                  {
                    start: athleteState.afi28dMax * 0.88,
                    end: athleteState.afi28dMax,
                    token: 'coral',
                  },
                ]}
              />
            )
          }
          word={fatigue.word}
          wordToken={fatigue.token}
          subtitle={
            athleteState.afi == null
              ? null
              : `${athleteState.afi.toFixed(1)} AFI`
          }
        />

        {/* TREND */}
        <MetricCell
          label="TREND"
          visual={
            isLoading ? (
              <Skeleton height={16} />
            ) : athleteState.trendDeltaPct == null ? (
              <EmptyBaseline />
            ) : (
              <TrendVisual direction={trendDirection} sparkline={athleteState.sparkline} />
            )
          }
          word={trend.word}
          wordToken={trend.token}
          subtitle={
            athleteState.trendDeltaPct == null
              ? null
              : `${athleteState.trendDeltaPct >= 0 ? '+' : ''}${athleteState.trendDeltaPct.toFixed(0)}% / 4w`
          }
        />
      </div>
    </ClusterCard>
  );
}
