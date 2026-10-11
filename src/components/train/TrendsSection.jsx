import React, { useMemo } from 'react';
import { Stack } from '@mantine/core';
import EmptyState from '../EmptyState.jsx';
import RampRateAlert from '../RampRateAlert.jsx';
import TrainingLoadChart from '../TrainingLoadChart.jsx';
import { StatRow, TONE } from './progressUi.jsx';

// ============================================================================
// FITNESS — the first section of the Progress tab: the load chart, the ramp
// rate when it needs saying, and the numbers that matter in one ruled row.
// ============================================================================
const TrendsSection = React.memo(function TrendsSection({ dailyTSSData, trainingMetrics, activities, speedProfile, formatElev, isImperial }) {
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
          ? 'Log a few weeks of riding to see your trend.'
          : fitnessDelta4w > 3
            ? 'Your base is growing — the training is landing.'
            : fitnessDelta4w < -3
              ? 'A lighter month — fitness eases when the load does.'
              : 'Holding steady over the last month.',
    },
    { label: 'Rides, 90 days', value: String(ninetyDayActivityCount) },
    {
      label: `Avg speed (${isImperial ? 'mph' : 'km/h'})`,
      value: speedProfile ? (speedProfile.average_speed * (isImperial ? 0.621371 : 1)).toFixed(1) : '--',
    },
  ];
  if (activities.length > 5) {
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
