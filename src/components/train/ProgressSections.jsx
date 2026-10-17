import { useState, useEffect, useMemo } from 'react';
import { Box, Button, SegmentedControl, Skeleton, Text } from '@mantine/core';
import { SubHeading, mono } from './progressUi.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { supabase } from '../../lib/supabase';
import { formatDistance, formatElevation } from '../../utils/units';
import { interpretTSB } from '../../utils/trainingPlans';
import { computeWeeklySnapshots } from '../../utils/computeFitnessSnapshots';
import { buildAthleteMetrics } from '../../views/today/athleteMetrics';
import { formatLocalDate } from '../../utils/dateUtils';
import { translateCTL, translateTSB } from '../../lib/fitness/translate';
import { ctlTooltip, tsbTooltip } from '../../lib/fitness/tooltips';
import { useSegmentLibrary } from '../../hooks/useSegmentLibrary';
import { getActivitySport, isPowerSport, isRunningActivity } from '../../utils/sportType';
import { LTHR_ZONE_DEFS, zoneFor } from '../../utils/rideZones';
import { resolveRunProfile } from '../../../api/utils/runLoad.js';
import { useRunThresholds } from '../../hooks/useRunThresholds';
import ZoneDistributionRow from '../progress/ZoneDistributionRow.jsx';
import TrendInsightRow from '../progress/TrendInsightRow.jsx';
import YearToDateStats from '../progress/YearToDateStats.jsx';
import SegmentIntelligence from '../progress/SegmentIntelligence.jsx';

// Zone allocation based on average power zone
function getPowerZone(avgWatts, ftp) {
  if (!ftp || !avgWatts) return 2;
  const ratio = avgWatts / ftp;
  if (ratio < 0.55) return 1;
  if (ratio < 0.75) return 2;
  if (ratio < 0.90) return 3;
  if (ratio < 1.05) return 4;
  if (ratio < 1.20) return 5;
  return 6;
}

const ZONE_DISTRIBUTIONS = {
  1: { 1: 0.40, 2: 0.50, 3: 0.10 },
  2: { 1: 0.20, 2: 0.70, 3: 0.10 },
  3: { 2: 0.30, 3: 0.40, 4: 0.25, 5: 0.05 },
  4: { 2: 0.25, 3: 0.25, 4: 0.35, 5: 0.15 },
  5: { 2: 0.30, 3: 0.15, 4: 0.20, 5: 0.25, 6: 0.10 },
  6: { 2: 0.20, 3: 0.10, 4: 0.15, 5: 0.30, 6: 0.25 },
};

/** Estimated time in zone: each activity's time spread around its own zone. */
function spreadZoneTimes(items) {
  const zoneTimes = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  let totalTime = 0;
  for (const { duration, zone } of items) {
    totalTime += duration;
    const dist = ZONE_DISTRIBUTIONS[zone] || ZONE_DISTRIBUTIONS[2];
    Object.entries(dist).forEach(([z, pct]) => {
      zoneTimes[parseInt(z)] += duration * pct;
    });
  }
  if (totalTime === 0) return { zones: [], totalTime: 0 };
  const zones = Object.entries(zoneTimes).map(([z, time]) => ({
    zone: parseInt(z),
    time,
    percentage: totalTime > 0 ? (time / totalTime) * 100 : 0,
    hours: formatHoursMinutes(time),
  }));
  return { zones, totalTime };
}

/** Does an activity belong under the Progress sport filter? */
export function matchesSportFilter(activity, sport) {
  if (!sport || sport === 'all') return true;
  return getActivitySport(activity) === sport;
}

function formatTimeFromSeconds(seconds) {
  if (!seconds) return '0h';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatHoursMinutes(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

/**
 * Data for the former /progress page's blocks, now spread through the Progress
 * tab on /train: zone distribution, key trends, year to date and segments.
 * Still loads its own activities; sharing the dashboard's is a later step.
 */
export function useProgressSectionsData(sport = 'all') {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Every sport. Fitness and form stay combined; the sport filter narrows
  // only the per-activity blocks (zones, volume, year to date).
  const [allActivities, setActivities] = useState([]);
  const activities = useMemo(
    () => allActivities.filter((a) => matchesSportFilter(a, sport)),
    [allActivities, sport],
  );
  const runThresholds = useRunThresholds();
  const [serverLoadHistory, setServerLoadHistory] = useState([]);
  // Latest per-sport TFI row (migration 133), or null.
  const [loadSplit, setLoadSplit] = useState(null);
  const [ftp, setFtp] = useState(null);
  // Adaptive EWA tau (user_profiles.tfi_tau/afi_tau) so client-filled tail
  // days decay at the athlete's actual rate — same guard as the server engine.
  const [taus, setTaus] = useState({ tfi: 42, afi: 7 });
  const [unitsPreference, setUnitsPreference] = useState('imperial');
  const [zoneTimeFilter, setZoneTimeFilter] = useState('30');

  const isImperial = unitsPreference === 'imperial';
  const formatDist = (km) => formatDistance(km, isImperial);
  const formatElev = (m) => formatElevation(m, isImperial);

  const { segments, loading: segmentsLoading, fetchSegments } = useSegmentLibrary(user?.id);

  // Load activities and user profile
  useEffect(() => {
    const loadData = async () => {
      if (!user) return;
      setLoadError(null);
      try {
        // Load user profile for FTP and units
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('units_preference, ftp, power_zones, weight_kg, tfi_tau, afi_tau')
          .eq('id', user.id)
          .single();

        if (profile) {
          if (profile.ftp) setFtp(profile.ftp);
          if (profile.units_preference) setUnitsPreference(profile.units_preference);
          setTaus({
            tfi: Number(profile.tfi_tau) > 0 ? Number(profile.tfi_tau) : 42,
            afi: Number(profile.afi_tau) > 0 ? Number(profile.afi_tau) : 7,
          });
        }

        // Load all activities with pagination (Supabase caps at 1000 per request)
        let allActivities = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data: activityData, error: activityError } = await supabase
            .from('activities')
            .select('*')
            .eq('user_id', user.id)
            .is('duplicate_of', null)
            .or('is_hidden.eq.false,is_hidden.is.null')
            .order('start_date', { ascending: false })
            .range(page * pageSize, (page + 1) * pageSize - 1);

          if (activityError) {
            // Surface the failure instead of silently rendering partial (wrong) stats
            throw activityError;
          }

          if (activityData && activityData.length > 0) {
            allActivities = [...allActivities, ...activityData];
            hasMore = activityData.length === pageSize;
            page++;
          } else {
            hasMore = false;
          }
        }

        setActivities(allActivities);

        // Server-computed daily load (canonical-only columns — legacy were
        // dropped by migration 071). Lets the fitness tiles use the same
        // engine as the Today surfaces (per-athlete tau, terrain multipliers).
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const { data: loadRows } = await supabase
          .from('training_load_daily')
          .select('date, tfi, afi, form_score')
          .eq('user_id', user.id)
          .gte('date', formatLocalDate(ninetyDaysAgo))
          .order('date', { ascending: true });
        setServerLoadHistory(loadRows || []);

        // Per-sport TFI (migration 133), latest row only. Separate query so a
        // missing column hides just the "Fitness by sport" insight.
        const { data: splitRow, error: splitError } = await supabase
          .from('training_load_daily')
          .select('tfi_cycling, tfi_running')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle();
        setLoadSplit(splitError ? null : splitRow ?? null);
      } catch (err) {
        console.error('Error loading progress data:', err);
        setLoadError(err.message || 'Failed to load your training data');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [user, reloadKey]);

  const retryLoad = () => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  // Fetch segments on mount
  useEffect(() => {
    if (user?.id) fetchSegments();
  }, [user?.id]);

  // Run anchors: the athlete's own LTHR / max HR, else estimated from their
  // runs — the same resolution the server's run load uses.
  const runProfile = useMemo(() => {
    const runs = allActivities.filter((a) => isRunningActivity(a));
    if (runs.length === 0) return null;
    return resolveRunProfile(
      { lthr: runThresholds.lthr, max_hr: runThresholds.maxHr, threshold_pace_sec: runThresholds.thresholdPaceSec },
      runs,
    );
  }, [allActivities, runThresholds]);

  // Zone distribution, estimated from each activity's average: rides by
  // average power against FTP, runs by average HR against LTHR (power zones
  // mean nothing for a run).
  const zoneData = useMemo(() => {
    const days = parseInt(zoneTimeFilter) || 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const recent = activities.filter((a) => new Date(a.start_date) >= cutoff);

    const rides = sport === 'running' ? [] : recent.filter((a) => isPowerSport(a));
    const ridesData = spreadZoneTimes(
      rides.map((a) => ({ duration: a.moving_time || 0, zone: getPowerZone(a.average_watts, ftp) })),
    );

    const lthr = runProfile?.lthr;
    const runs = sport === 'cycling' || !lthr ? [] : recent.filter((a) => isRunningActivity(a) && a.average_heartrate > 0);
    const runsData = spreadZoneTimes(
      runs.map((a) => ({
        duration: a.moving_time || 0,
        zone: zoneFor(LTHR_ZONE_DEFS, a.average_heartrate, lthr)?.zone ?? 2,
      })),
    );

    // The single-sport view, and the ride row of "All", keep the old shape.
    const primary = sport === 'running' ? runsData : ridesData;
    return { ...primary, rides: ridesData, runs: runsData };
  }, [activities, ftp, zoneTimeFilter, sport, runProfile]);

  // Current CTL/ATL/TSB. Prefer the shared server-preferred walk (same math
  // as Today/Glance/Dashboard — see docs/tfi-duality-decision.md) so this
  // page can't disagree with the Today surfaces. Fall back to the full-history
  // client engine only when no server rows exist (new/pre-engine users) —
  // there, the full walk beats a 90-day-window EWA cold start.
  const trainingMetrics = useMemo(() => {
    if (serverLoadHistory.length > 0) {
      const m = buildAthleteMetrics(allActivities, ftp || 200, serverLoadHistory, taus);
      if (m.tfiCurrent != null) {
        const tsb = Math.round(m.formScore ?? 0);
        return {
          ctl: Math.round(m.tfiCurrent),
          atl: Math.round(m.afiCurrent ?? 0),
          tsb,
          interpretation: interpretTSB(tsb),
        };
      }
    }
    const weeklySnapshots = computeWeeklySnapshots(allActivities, ftp);
    if (weeklySnapshots.length === 0) {
      return { ctl: 0, atl: 0, tsb: 0, interpretation: interpretTSB(0) };
    }
    // Most recent snapshot (index 0 since sorted descending)
    const current = weeklySnapshots[0];
    return {
      ctl: current.ctl,
      atl: current.atl,
      tsb: current.tsb,
      interpretation: interpretTSB(current.tsb),
    };
  }, [allActivities, serverLoadHistory, ftp, taus]);

  // Generate trend insights
  const trendInsights = useMemo(() => {
    const insights = [];

    // CTL trend — canonical thresholds from translate.ts
    if (trainingMetrics.ctl > 0) {
      const ctlTranslation = translateCTL(trainingMetrics.ctl);
      insights.push({
        title: `Fitness: ${ctlTranslation.label}`,
        detail: ctlTooltip(trainingMetrics.ctl),
        sentiment: ctlTranslation.color === 'teal' || ctlTranslation.color === 'gold' ? 'positive' : 'neutral',
      });
    }

    // Fitness by sport — only for athletes with fitness in both sports. The
    // two numbers are shares of the combined fitness above.
    const rideTfi = Math.round(Number(loadSplit?.tfi_cycling) || 0);
    const runTfi = Math.round(Number(loadSplit?.tfi_running) || 0);
    if (rideTfi > 0 && runTfi > 0) {
      insights.push({
        title: `Fitness by sport: Ride ${rideTfi} · Run ${runTfi}`,
        detail: 'Your fitness split by where the training came from. Together they make up your total fitness; fatigue and form are shared.',
        sentiment: 'neutral',
      });
    }

    // Form / TSB — canonical thresholds from translate.ts
    const tsb = trainingMetrics.tsb;
    const tsbTranslation = translateTSB(tsb);
    insights.push({
      title: `Form: ${tsbTranslation.label}`,
      detail: tsbTooltip(tsb),
      sentiment: tsbTranslation.color === 'gold' || tsbTranslation.color === 'teal' ? 'positive'
        : tsbTranslation.color === 'orange' ? 'attention' : 'urgent',
    });

    // Volume trend (last 7d vs previous 7d)
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const last7 = activities.filter(a => new Date(a.start_date) >= sevenDaysAgo);
    const prev7 = activities.filter(a => {
      const d = new Date(a.start_date);
      return d >= fourteenDaysAgo && d < sevenDaysAgo;
    });

    const last7Time = last7.reduce((s, a) => s + (a.moving_time || 0), 0);
    const prev7Time = prev7.reduce((s, a) => s + (a.moving_time || 0), 0);

    if (prev7Time > 0) {
      const change = ((last7Time - prev7Time) / prev7Time) * 100;
      if (change > 20) {
        insights.push({
          title: `Volume: +${Math.round(change)}% this week`,
          detail: 'Training volume increased significantly. Monitor recovery.',
          sentiment: 'attention',
        });
      } else if (change < -20) {
        insights.push({
          title: `Volume: ${Math.round(change)}% this week`,
          detail: 'Reduced volume — planned recovery or missed sessions?',
          sentiment: 'neutral',
        });
      } else {
        insights.push({
          title: 'Volume: Consistent',
          detail: 'Training volume is steady week-over-week. Good consistency.',
          sentiment: 'positive',
        });
      }
    }

    // Zone distribution insight
    if (zoneData.zones.length > 0) {
      const z2Pct = zoneData.zones.find(z => z.zone === 2)?.percentage || 0;
      const highPct = (zoneData.zones.find(z => z.zone === 4)?.percentage || 0)
        + (zoneData.zones.find(z => z.zone === 5)?.percentage || 0)
        + (zoneData.zones.find(z => z.zone === 6)?.percentage || 0);

      if (z2Pct > 60 && highPct > 10) {
        insights.push({
          title: 'Distribution: Polarized',
          detail: `Good balance of easy ${sport === 'running' ? 'running' : 'riding'} and hard efforts — the most effective training approach.`,
          sentiment: 'positive',
        });
      } else if (z2Pct > 60) {
        insights.push({
          title: 'Distribution: Aerobic-heavy',
          detail: `Lots of easy ${sport === 'running' ? 'running' : 'riding'}. Consider adding some intensity to drive adaptation.`,
          sentiment: 'neutral',
        });
      } else if (highPct > 30) {
        insights.push({
          title: 'Distribution: Intensity-heavy',
          detail: 'High proportion of hard efforts. Ensure adequate recovery between sessions.',
          sentiment: 'attention',
        });
      }
    }

    return insights;
  }, [trainingMetrics, activities, zoneData, loadSplit, sport]);

  // Calculate YTD stats
  const ytdStats = useMemo(() => {
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const ytd = activities.filter(a => new Date(a.start_date) >= yearStart);

    return {
      // `totalRides` counts every activity under the filter; the label follows the sport.
      totalRides: ytd.length,
      sport,
      totalDistance: ytd.reduce((s, a) => s + (a.distance_meters || a.distance || 0), 0),
      totalElevation: ytd.reduce((s, a) => s + (a.elevation_gain_meters || a.total_elevation_gain || 0), 0),
      totalTime: ytd.reduce((s, a) => s + (a.moving_time || 0), 0),
    };
  }, [activities, sport]);

  return {
    sport,
    // Every activity of the filtered sport, with streams (select '*'), for
    // the Pace section's best efforts.
    activities,
    runProfile,
    // Latest per-sport fitness (migration 133), or null.
    loadSplit,
    loading,
    loadError,
    retryLoad,
    empty: !loading && !loadError && allActivities.length === 0,
    zoneData,
    zoneTimeFilter,
    setZoneTimeFilter,
    trendInsights,
    ytdStats,
    segments,
    segmentsLoading,
    formatDist,
    formatElev,
  };
}

/** Loading / error states shared by the blocks (render nothing once loaded). */
export function ProgressDataStatus({ data }) {
  if (data.loading) return <Skeleton height={120} />;
  if (!data.loadError) return null;
  return (
    <Box style={{ border: '1px solid var(--color-border)', padding: 16 }}>
      <Text style={{ ...mono, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        Couldn&apos;t load your progress data. {String(data.loadError)}
      </Text>
      <Button mt={12} size="xs" radius={0} onClick={data.retryLoad}>
        Retry
      </Button>
    </Box>
  );
}

const ready = (data) => !data.loading && !data.loadError && !data.empty;

/** Zone distribution with the 7/30/90-day toggle. */
export function ZonesBlock({ data }) {
  if (!ready(data)) return null;
  return (
    <Box>
      <SubHeading
        aside={
          <SegmentedControl
            size="xs"
            radius={0}
            value={data.zoneTimeFilter}
            onChange={data.setZoneTimeFilter}
            data={['7', '30', '90'].map((d) => ({ value: d, label: `${d}D` }))}
            styles={{ label: { fontFamily: 'var(--font-mono)' } }}
          />
        }
      >
        Zone distribution
      </SubHeading>
      {data.sport === 'all' && data.zoneData.runs?.zones.length > 0 ? (
        <>
          <Text style={{ ...mono, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '4px 0 6px' }}>
            Rides · by power
          </Text>
          <ZoneDistributionRow
            zones={data.zoneData.rides.zones}
            totalTime={data.zoneData.rides.totalTime}
            emptyText="No rides with power in this window."
          />
          <Text style={{ ...mono, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '14px 0 6px' }}>
            Runs · by heart rate
          </Text>
          <ZoneDistributionRow zones={data.zoneData.runs.zones} totalTime={data.zoneData.runs.totalTime} />
        </>
      ) : (
        <ZoneDistributionRow
          zones={data.zoneData.zones}
          totalTime={data.zoneData.totalTime}
          emptyText={
            data.sport === 'running'
              ? 'No zone data yet. Runs recorded with heart rate fill this in.'
              : undefined
          }
        />
      )}
    </Box>
  );
}

/** Plain-language trend sentences. */
export function KeyTrendsBlock({ data }) {
  if (!ready(data) || data.trendInsights.length === 0) return null;
  return (
    <Box>
      <SubHeading>Key trends</SubHeading>
      {data.trendInsights.map((insight, i) => (
        <TrendInsightRow key={i} title={insight.title} detail={insight.detail} sentiment={insight.sentiment} />
      ))}
    </Box>
  );
}

export function YearBlock({ data }) {
  if (!ready(data)) return null;
  return (
    <YearToDateStats
      ytdStats={data.ytdStats}
      formatDist={data.formatDist}
      formatElev={data.formatElev}
      formatTime={formatTimeFromSeconds}
      loading={data.loading}
    />
  );
}

export function SegmentsBlock({ data }) {
  if (!ready(data)) return null;
  return <SegmentIntelligence segments={data.segments} loading={data.segmentsLoading} />;
}
