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
import { isPowerSport } from '../../utils/sportType';
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
export function useProgressSectionsData() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [activities, setActivities] = useState([]);
  const [serverLoadHistory, setServerLoadHistory] = useState([]);
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

  // Calculate zone distribution
  const zoneData = useMemo(() => {
    const days = parseInt(zoneTimeFilter) || 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    // Power zones only mean something for power sports — rides, or an
    // unclassified activity whose device measured watts.
    const filtered = activities.filter(a => {
      if (new Date(a.start_date) < cutoff) return false;
      return isPowerSport(a);
    });
    if (filtered.length === 0) return { zones: [], totalTime: 0 };

    const zoneTimes = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    let totalTime = 0;

    filtered.forEach(a => {
      const duration = a.moving_time || 0;
      totalTime += duration;
      const zone = getPowerZone(a.average_watts, ftp);
      const dist = ZONE_DISTRIBUTIONS[zone] || ZONE_DISTRIBUTIONS[2];
      Object.entries(dist).forEach(([z, pct]) => {
        zoneTimes[parseInt(z)] += duration * pct;
      });
    });

    const zones = Object.entries(zoneTimes).map(([z, time]) => ({
      zone: parseInt(z),
      time,
      percentage: totalTime > 0 ? (time / totalTime) * 100 : 0,
      hours: formatHoursMinutes(time),
    }));

    return { zones, totalTime };
  }, [activities, ftp, zoneTimeFilter]);

  // Current CTL/ATL/TSB. Prefer the shared server-preferred walk (same math
  // as Today/Glance/Dashboard — see docs/tfi-duality-decision.md) so this
  // page can't disagree with the Today surfaces. Fall back to the full-history
  // client engine only when no server rows exist (new/pre-engine users) —
  // there, the full walk beats a 90-day-window EWA cold start.
  const trainingMetrics = useMemo(() => {
    if (serverLoadHistory.length > 0) {
      const m = buildAthleteMetrics(activities, ftp || 200, serverLoadHistory, taus);
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
    const weeklySnapshots = computeWeeklySnapshots(activities, ftp);
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
  }, [activities, serverLoadHistory, ftp, taus]);

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
          detail: 'Good balance of easy riding and hard efforts — the most effective training approach.',
          sentiment: 'positive',
        });
      } else if (z2Pct > 60) {
        insights.push({
          title: 'Distribution: Aerobic-heavy',
          detail: 'Lots of easy riding. Consider adding some intensity to drive adaptation.',
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
  }, [trainingMetrics, activities, zoneData]);

  // Calculate YTD stats
  const ytdStats = useMemo(() => {
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const ytd = activities.filter(a => new Date(a.start_date) >= yearStart);

    return {
      totalRides: ytd.length,
      totalDistance: ytd.reduce((s, a) => s + (a.distance_meters || a.distance || 0), 0),
      totalElevation: ytd.reduce((s, a) => s + (a.elevation_gain_meters || a.total_elevation_gain || 0), 0),
      totalTime: ytd.reduce((s, a) => s + (a.moving_time || 0), 0),
    };
  }, [activities]);

  return {
    loading,
    loadError,
    retryLoad,
    empty: !loading && !loadError && activities.length === 0,
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
      <ZoneDistributionRow zones={data.zoneData.zones} totalTime={data.zoneData.totalTime} />
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
