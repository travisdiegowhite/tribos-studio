import React, { useMemo } from 'react';
import { Stack } from '@mantine/core';
import EmptyState from '../EmptyState.jsx';
import RampRateAlert from '../RampRateAlert.jsx';
import TrainingLoadChart from '../TrainingLoadChart.jsx';
import { StatRow, TONE } from './progressUi.jsx';
import { formatPace, paceSecPerKm } from '../../utils/paceFormat';
import { isRunningActivity } from '../../utils/sportType';

const median = (xs) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Pace tiles for runs: from the runs themselves, never the ride speed profile. */
export function runTrendStats(activities, { isImperial = false, formatElev } = {}) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const runs = (activities || []).filter((a) => isRunningActivity(a) && new Date(a.start_date) >= cutoff);
  const paces = runs.map((a) => paceSecPerKm(a.distance, a.moving_time)).filter((p) => p != null);
  const minutes = runs.map((a) => (a.moving_time || 0) / 60).filter((m) => m > 0);
  const climbs = runs.map((a) => a.total_elevation_gain || 0);
  return [
    { label: 'Typical pace', value: paces.length ? formatPace(median(paces), isImperial) : '--' },
    { label: 'Typical run', value: minutes.length ? `${Math.round(median(minutes))} min` : '--' },
    {
      label: 'Avg climbing',
      value: climbs.length && formatElev ? formatElev(climbs.reduce((s, c) => s + c, 0) / climbs.length) : '--',
      note: 'per run',
    },
  ];
}

// ============================================================================
// FITNESS — the first section of the Progress tab: the load chart, the ramp
// rate when it needs saying, and the numbers that matter in one ruled row.
// ============================================================================
const TrendsSection = React.memo(function TrendsSection({
  dailyTSSData,
  trainingMetrics,
  activities,
  speedProfile,
  formatElev,
  isImperial,
  // Progress sport filter: 'all' | 'cycling' | 'running'.
  sport = 'all',
  // Latest per-sport fitness ({ tfi_cycling, tfi_running }) or null.
  loadSplit = null,
}) {
  // Count activities in last 90 days
  const ninetyDayActivityCount = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    return (activities || []).filter(a => new Date(a.start_date) >= cutoff).length;
  }, [activities]);

  // Real 4-week fitness change, read off the server-preferred per-day series
  // (points carry ctl from buildDailyLoadSeries).
  const fitnessDelta4w = useMemo(() => {
    if (!dailyTSSData || dailyTSSData.length < 29) return null;
    const now = dailyTSSData[dailyTSSData.length - 1];
    const fourWeeksAgo = dailyTSSData[dailyTSSData.length - 29];
    if (now?.ctl == null || fourWeeksAgo?.ctl == null) return null;
    return Math.round(now.ctl - fourWeeksAgo.ctl);
  }, [dailyTSSData]);

  const stats = [
    {
      label: 'Fitness, 4 weeks',
      value: fitnessDelta4w == null ? '--' : `${fitnessDelta4w >= 0 ? '+' : ''}${fitnessDelta4w}`,
      color: fitnessDelta4w != null && fitnessDelta4w < 0 ? TONE.warn : TONE.neutral,
      note:
        fitnessDelta4w == null
          ? 'Log a few weeks of training to see your trend.'
          : fitnessDelta4w > 3
            ? 'Your base is growing — the training is landing.'
            : fitnessDelta4w < -3
              ? 'A lighter month — fitness eases when the load does.'
              : 'Holding steady over the last month.',
    },
    {
      label: `${sport === 'running' ? 'Runs' : sport === 'cycling' ? 'Rides' : 'Activities'}, 90 days`,
      value: String(ninetyDayActivityCount),
    },
  ];
  // The chart and the 4-week number are combined fitness; a single-sport view
  // also gives that sport's share.
  const sportTfi =
    sport === 'running' ? loadSplit?.tfi_running : sport === 'cycling' ? loadSplit?.tfi_cycling : null;
  if (Number(sportTfi) > 0) {
    stats.push({
      label: `${sport === 'running' ? 'Run' : 'Ride'} fitness`,
      value: String(Math.round(Number(sportTfi))),
      note: 'share of total',
    });
  }
  if (sport === 'running') {
    stats.push(...runTrendStats(activities, { isImperial, formatElev }));
  } else {
    stats.push({
      label: `Avg speed (${isImperial ? 'mph' : 'km/h'})`,
      value: speedProfile ? (speedProfile.average_speed * (isImperial ? 0.621371 : 1)).toFixed(1) : '--',
    });
  }
  if (sport !== 'running' && activities.length > 5) {
    stats.push(
      { label: 'Typical ride', value: speedProfile ? `${Math.round(speedProfile.avg_ride_duration)} min` : '60–90 min' },
      { label: 'Avg climbing', value: speedProfile ? `${formatElev(speedProfile.avg_elevation_per_km * 20)}` : '--', note: 'per ride' },
    );
  }

  return (
    <Stack gap="md">
      {dailyTSSData.length > 0 ? (
        <TrainingLoadChart data={dailyTSSData} />
      ) : (
        <EmptyState type="noTrainingData" size="sm" />
      )}

      {/* Ramp rate: the tab's one moment, only when it has something to say */}
      {dailyTSSData.length > 14 && (
        <RampRateAlert dailyTSSData={dailyTSSData} currentCTL={trainingMetrics.ctl} showDetails={true} />
      )}

      <StatRow stats={stats} />
    </Stack>
  );
});

export default TrendsSection;
