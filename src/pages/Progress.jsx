import { useState, useEffect, useMemo } from 'react';
import { Container, Stack, Box, Text, SimpleGrid, Skeleton, Group, Button } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import AppShell from '../components/AppShell.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';
import { formatDistance, formatElevation } from '../utils/units';
import { interpretTSB } from '../utils/trainingPlans';
import { computeWeeklySnapshots } from '../utils/computeFitnessSnapshots';
import { translateCTL, translateTSB } from '../lib/fitness/translate';
import { ctlTooltip, tsbTooltip } from '../lib/fitness/tooltips';
import { useSegmentLibrary } from '../hooks/useSegmentLibrary';
import ZoneDistributionRow from '../components/progress/ZoneDistributionRow.jsx';
import TrendInsightRow from '../components/progress/TrendInsightRow.jsx';
import YearToDateStats from '../components/progress/YearToDateStats.jsx';
import SegmentIntelligence from '../components/progress/SegmentIntelligence.jsx';
import FitnessProgressChart from '../components/progress/FitnessProgressChart.jsx';

// Zone allocation based on average power zone (matches ZoneDistributionChart logic)
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

function Progress() {
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState([]);
  const [ftp, setFtp] = useState(null);
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
      try {
        // Load user profile for FTP and units
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('units_preference, ftp, power_zones, weight_kg')
          .eq('id', user.id)
          .single();

        if (profile) {
          if (profile.ftp) setFtp(profile.ftp);
          if (profile.units_preference) setUnitsPreference(profile.units_preference);
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
            console.error('Error loading activities:', activityError);
            break;
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
      } catch (err) {
        console.error('Error loading progress data:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [user]);

  // Fetch segments on mount
  useEffect(() => {
    if (user?.id) fetchSegments();
  }, [user?.id]);

  // Calculate zone distribution
  const zoneData = useMemo(() => {
    const days = parseInt(zoneTimeFilter) || 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const NON_CYCLING_TYPES = ['run', 'virtualrun', 'trailrun', 'swim', 'walk', 'hike'];
    const filtered = activities.filter(a => {
      if (new Date(a.start_date) < cutoff) return false;
      const type = (a.sport_type || a.type || '').toLowerCase();
      return !NON_CYCLING_TYPES.includes(type);
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

  // Calculate CTL/ATL/TSB from full activity history
  const trainingMetrics = useMemo(() => {
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
  }, [activities, ftp]);

  // Generate trend insights
  const trendInsights = useMemo(() => {
    const insights = [];

    // CTL trend — canonical thresholds from translate.ts
    if (trainingMetrics.ctl > 0) {
      const ctlTranslation = translateCTL(trainingMetrics.ctl);
      insights.push({
        title: `Fitness (CTL): ${trainingMetrics.ctl}`,
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

  if (loading) {
    return (
      <AppShell>
        <Container size="xl" py="lg">
          <Stack gap={14}>
            <Skeleton height={32} width={200} />
            <Skeleton height={200} />
            <Skeleton height={150} />
          </Stack>
        </Container>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Container size="xl" py="lg">
        <Stack gap={14}>
          <PageHeader title="Progress" />

          {/* Fitness Progression — CTL + TFI peer lines */}
          <FitnessProgressChart />

          {/* Zone Distribution */}
          <Box
            style={{
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-card)',
              padding: 20,
            }}
          >
            <Group justify="space-between" mb={14}>
              <Text
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-primary)',
                }}
              >
                ZONE DISTRIBUTION
              </Text>
              <Group gap={4}>
                {['7', '30', '90'].map((period) => (
                  <Button
                    key={period}
                    variant={zoneTimeFilter === period ? 'filled' : 'subtle'}
                    color={zoneTimeFilter === period ? 'dark' : 'gray'}
                    size="compact-xs"
                    onClick={() => setZoneTimeFilter(period)}
                    style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {period}D
                  </Button>
                ))}
              </Group>
            </Group>

            <ZoneDistributionRow zones={zoneData.zones} totalTime={zoneData.totalTime} />
          </Box>

          {/* Key Trends */}
          {trendInsights.length > 0 && (
            <Box
              style={{
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-card)',
                padding: 20,
              }}
            >
              <Text
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-primary)',
                  marginBottom: 10,
                }}
              >
                KEY TRENDS
              </Text>

              {trendInsights.map((insight, i) => (
                <TrendInsightRow
                  key={i}
                  title={insight.title}
                  detail={insight.detail}
                  sentiment={insight.sentiment}
                />
              ))}
            </Box>
          )}

          {/* Two-column: YTD stats + Segment Intelligence */}
          <SimpleGrid cols={isMobile ? 1 : 2} spacing={14}>
            <YearToDateStats
              ytdStats={ytdStats}
              formatDist={formatDist}
              formatElev={formatElev}
              formatTime={formatTimeFromSeconds}
              loading={loading}
            />
            <SegmentIntelligence
              segments={segments}
              loading={segmentsLoading}
            />
          </SimpleGrid>
        </Stack>
      </Container>
    </AppShell>
  );
}

export default Progress;
