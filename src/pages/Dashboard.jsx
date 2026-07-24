import { useState, useEffect, useMemo } from 'react';
import {
  Container,
  SimpleGrid,
  Stack,
  Group,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useAuth } from '../contexts/AuthContext.jsx';
import AppShell from '../components/AppShell.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { supabase } from '../lib/supabase';
import { formatDistance, formatElevation } from '../utils/units';
import GetStartedGuide from '../components/activation/GetStartedGuide.jsx';
import ProactiveInsightCard from '../components/activation/ProactiveInsightCard.jsx';
import StatusBar from '../components/today/StatusBar.jsx';
import { FtpMissingBadge } from '../components/ui';
import { useFormConfidence } from '../hooks/useFormConfidence';
import { useTodayTerrain } from '../hooks/useTodayTerrain';
import IntelligenceCard from '../components/today/IntelligenceCard.jsx';
import { CoachCard } from '../components/coach';
import RecentRidesMap from '../components/RecentRidesMap.jsx';
import WeekChart from '../components/today/WeekChart.jsx';
import FitnessSummary from '../components/today/FitnessSummary.jsx';
import ProprietaryMetricsBar from '../components/today/ProprietaryMetricsBar.tsx';
import { ActivePlanCard } from '../components/training';
import { calculateCTL, calculateATL, calculateTSB } from '../utils/trainingPlans';
import { formatLocalDate } from '../utils/dateUtils';
import { estimateActivityTSS } from '../utils/computeFitnessSnapshots';

function Dashboard() {
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  const [activePlans, setActivePlans] = useState([]);
  const [todayWorkout, setTodayWorkout] = useState(null);
  const [weekStats, setWeekStats] = useState({ activities: 0, planned: 0, distance: 0, elevation: 0 });
  const [todayRouteMatch, setTodayRouteMatch] = useState(null);
  const [proprietaryMetrics, setProprietaryMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  // Latest training_load_daily snapshot — preferred over the client-computed
  // CTL when present (decision memo docs/tfi-duality-decision.md, option a).
  // Falls through to client-compute when no row exists or the latest row is
  // stale (we walk the EWA forward over the missing tail).
  const [serverLoadHistory, setServerLoadHistory] = useState([]);

  // Load user profile (onboarding + What's New overlays live in AppShell via
  // LifecycleOverlays now — rendering them here too would double-mount them)
  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;

      try {
        const { data } = await supabase
          .from('user_profiles')
          .select('onboarding_completed, display_name, units_preference, ftp')
          .eq('id', user.id)
          .single();

        if (data) {
          setUserProfile(data);
        }
      } catch {
        // Profile doesn't exist yet
      }
    };

    loadProfile();
  }, [user]);

  const displayName = userProfile?.display_name || user?.email?.split('@')[0] || 'Rider';
  const isImperial = userProfile?.units_preference !== 'metric';
  const formatDist = (km) => formatDistance(km, isImperial);
  const formatElev = (m) => formatElevation(m, isImperial);

  // Fetch activities and training plan
  useEffect(() => {
    const fetchData = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        // Fetch activities
        const { data: activityData, error } = await supabase
          .from('activities')
          .select('*')
          .eq('user_id', user.id)
          .is('duplicate_of', null)
          .or('is_hidden.eq.false,is_hidden.is.null')
          .gte('start_date', ninetyDaysAgo.toISOString())
          .order('start_date', { ascending: false });

        // Server-stored TFI/AFI/form_score. We pull the last 30 days so the
        // useMemo can locate both today's row (preferred) and a row ~28
        // days back (for ctlDeltaPct).
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const tldKey = thirtyDaysAgo.toISOString().slice(0, 10);
        const { data: tldRows } = await supabase
          .from('training_load_daily')
          .select('date, tfi, afi, form_score')
          .eq('user_id', user.id)
          .gte('date', tldKey)
          .order('date', { ascending: true });
        setServerLoadHistory(tldRows || []);

        // Calculate calendar week boundaries (Monday–Sunday)
        const weekStart = new Date();
        const dayOfWeek = weekStart.getDay();
        weekStart.setDate(weekStart.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        if (!error) {
          setActivities(activityData || []);

          const weekActivities = (activityData || []).filter(a => {
            const d = new Date(a.start_date);
            return d >= weekStart && d < weekEnd;
          });

          setWeekStats({
            activities: weekActivities.length,
            planned: 0, // Updated below if active plan exists
            distance: weekActivities.reduce((sum, a) => sum + ((a.distance_meters || a.distance || 0) / 1000), 0),
            elevation: weekActivities.reduce((sum, a) => sum + (a.elevation_gain_meters || a.total_elevation_gain || 0), 0),
          });
        }

        // Fetch active training plans
        const { data: plansData } = await supabase
          .from('training_plans')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('started_at', { ascending: false });

        if (plansData && plansData.length > 0) {
          setActivePlans(plansData);

          const planIds = plansData.map(p => p.id);

          // Fetch today's workout across all active plans
          const todayDate = new Date();
          const today = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;
          const { data: workoutData } = await supabase
            .from('planned_workouts')
            .select('*')
            .in('plan_id', planIds)
            .eq('scheduled_date', today)
            .limit(1)
            .maybeSingle();

          if (workoutData) {
            setTodayWorkout(workoutData);
          }

          // Fetch planned workouts for this week across all active plans
          const wsKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
          const weKey = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, '0')}-${String(weekEnd.getDate()).padStart(2, '0')}`;
          // Prefer canonical target_rss (spec §2). The filter uses .or() to
          // include rows written pre-§3b-2/3b-6 (legacy target_tss > 0) as
          // well as rows written post-cut-over (target_rss > 0).
          const { data: plannedWorkouts } = await supabase
            .from('planned_workouts')
            .select('id, target_rss, target_tss')
            .in('plan_id', planIds)
            .gte('scheduled_date', wsKey)
            .lt('scheduled_date', weKey)
            .or('target_rss.gt.0,target_tss.gt.0');

          setWeekStats(prev => ({ ...prev, planned: plannedWorkouts?.length || 0 }));
        }
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  // Fetch best route match for today's workout
  useEffect(() => {
    if (!todayWorkout || !user?.id) return;
    let cancelled = false;
    async function fetchRouteMatch() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const workoutCategory = todayWorkout.workout_type || todayWorkout.category || 'endurance';
        const workoutId = todayWorkout.id || 'today';
        const res = await fetch('/api/route-analysis', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'get_matches',
            workouts: [{
              id: workoutId,
              name: todayWorkout.title || todayWorkout.workout_type || 'Workout',
              category: workoutCategory,
              duration: todayWorkout.duration_minutes || 60,
            }],
          }),
        });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          const matches = data.matches?.[workoutId] || [];
          if (matches.length > 0) {
            setTodayRouteMatch(matches[0]);
          }
        }
      } catch {
        // Non-blocking — silently fail
      }
    }
    fetchRouteMatch();
    return () => { cancelled = true; };
  }, [todayWorkout, user?.id]);

  // Fetch proprietary metrics (EFI, TWL, TCAS)
  useEffect(() => {
    if (!user?.id) {
      setMetricsLoading(false);
      return;
    }
    let cancelled = false;
    async function fetchMetrics() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token || cancelled) return;
        const res = await fetch('/api/metrics', {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setProprietaryMetrics(data);
        }
      } catch {
        // Non-blocking — silently fail
      } finally {
        if (!cancelled) setMetricsLoading(false);
      }
    }
    fetchMetrics();
    return () => { cancelled = true; };
  }, [user?.id]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Form Score confidence — drives the `~`/muted-italic gating in StatusBar.
  // Null while loading or when the user has no training_load_daily rows yet.
  const fsConfidence = useFormConfidence(user?.id);

  // Today's terrain classification — drives the small TERRAIN chip above
  // StatusBar. Null while loading or when the user has no recent
  // training_load_daily rows with a populated terrain_class.
  const todayTerrain = useTodayTerrain(user?.id);

  // TFI/AFI/FormScore — prefer server-stored values from training_load_daily
  // (spec §3.1: terrain × MTB multipliers, per-athlete tau, persistent state)
  // and fall through to client-compute for any tail days the server hasn't
  // written yet. See docs/tfi-duality-decision.md.
  //
  // Internal identifiers stay legacy (ctl/atl/tsb) under the freeze policy —
  // the values themselves now flow from canonical server columns.
  const trainingMetrics = useMemo(() => {
    if ((!activities || activities.length === 0) && serverLoadHistory.length === 0) {
      return { ctl: 0, atl: 0, tsb: 0, ctlDeltaPct: 0 };
    }

    const userFtp = userProfile?.ftp || 200;

    // Build daily RSS map for the last 90 days (kept as the fallback path
    // and for walking the EWA forward across the missing tail).
    const now = new Date();
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const dailyTSS = {};
    for (let d = new Date(ninetyDaysAgo); d <= now; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      dailyTSS[key] = 0;
    }
    (activities || []).forEach((activity) => {
      // Local-date key to match the local-keyed map above — a UTC split would
      // shift evening rides to the next day and drop today's ride entirely.
      const dateStr = activity.start_date ? formatLocalDate(new Date(activity.start_date)) : undefined;
      if (dateStr && dailyTSS[dateStr] !== undefined) {
        const tss = Math.min(estimateActivityTSS(activity, userFtp), 500);
        dailyTSS[dateStr] += tss;
      }
    });

    const todayKey = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();

    const latestServer = serverLoadHistory.length > 0
      ? serverLoadHistory[serverLoadHistory.length - 1]
      : null;

    let ctl;
    let atl;
    let tsb;

    if (latestServer && latestServer.date === todayKey) {
      // Server has today's row — use it directly.
      ctl = Math.round(latestServer.tfi ?? 0);
      atl = Math.round(latestServer.afi ?? 0);
      tsb = Math.round(latestServer.form_score ?? 0);
    } else if (latestServer) {
      // Walk client EWA forward from the latest server row through today.
      let tfi = Number(latestServer.tfi) || 0;
      let afi = Number(latestServer.afi) || 0;
      const cursor = new Date(latestServer.date + 'T00:00:00');
      cursor.setDate(cursor.getDate() + 1);
      const end = new Date();
      let tfiYesterday = tfi;
      let afiYesterday = afi;
      while (cursor <= end) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
        const rss = dailyTSS[key] || 0;
        tfiYesterday = tfi;
        afiYesterday = afi;
        tfi = tfi + (rss - tfi) / 42;
        afi = afi + (rss - afi) / 7;
        cursor.setDate(cursor.getDate() + 1);
      }
      ctl = Math.round(tfi);
      atl = Math.round(afi);
      tsb = Math.round(tfiYesterday - afiYesterday);
    } else {
      // No server data — full client compute (legacy behavior).
      const days = Object.keys(dailyTSS).sort();
      const tssValues = days.map((d) => dailyTSS[d]);
      ctl = calculateCTL(tssValues);
      atl = calculateATL(tssValues);
      const tssYesterday = tssValues.length >= 2 ? tssValues.slice(0, -1) : tssValues;
      const ctlYesterday = calculateCTL(tssYesterday);
      const atlYesterday = calculateATL(tssYesterday);
      tsb = calculateTSB(ctlYesterday, atlYesterday);
    }

    // CTL trend: compare current TFI vs the server row from ~28 days ago,
    // falling back to client-compute when the historical row is missing.
    let ctl28dAgo = null;
    if (serverLoadHistory.length > 0) {
      const target = new Date();
      target.setDate(target.getDate() - 28);
      const targetKey = target.toISOString().slice(0, 10);
      const match = serverLoadHistory.find((r) => r.date <= targetKey);
      if (match && Number.isFinite(Number(match.tfi))) ctl28dAgo = Number(match.tfi);
    }
    if (ctl28dAgo == null) {
      const days = Object.keys(dailyTSS).sort();
      const tssValues = days.map((d) => dailyTSS[d]);
      const cutoffIndex = Math.max(0, tssValues.length - 28);
      ctl28dAgo = calculateCTL(tssValues.slice(0, cutoffIndex));
    }
    const ctlDeltaPct = ctl28dAgo > 0 ? ((ctl - ctl28dAgo) / ctl28dAgo) * 100 : 0;

    return { ctl, atl, tsb, ctlDeltaPct };
  }, [activities, userProfile, serverLoadHistory]);

  // Build training context string for CoachCard
  const trainingContext = useMemo(() => {
    const parts = [];
    parts.push(`TFI: ${trainingMetrics.ctl}, AFI: ${trainingMetrics.atl}, FS: ${trainingMetrics.tsb}`);
    if (weekStats.activities > 0) {
      parts.push(`This week: ${weekStats.activities} activities, ${formatDist(weekStats.distance)}, ${formatElev(weekStats.elevation)}`);
    }
    if (todayWorkout) {
      parts.push(`Today's planned workout: ${todayWorkout.title || todayWorkout.workout_type || 'Training'}`);
    }
    return parts.join('. ');
  }, [trainingMetrics, weekStats, todayWorkout, formatDist, formatElev]);

  return (
    <AppShell>
      <Container size="xl" py="lg" px={20}>
        <Stack gap={14}>
          {/* Header */}
          <PageHeader
            greeting={`${getGreeting()},`}
            title={displayName}
            titleOrder={2}
          />

          {/* Activation Guide (new users) */}
          <GetStartedGuide />

          {/* Proprietary Metrics — EFI/TWL/TCAS */}
          <ProprietaryMetricsBar
            metrics={proprietaryMetrics}
            loading={metricsLoading}
          />

          {/* FTP nudge — metrics below are estimated without an FTP set */}
          {!loading && !userProfile?.ftp && (
            <Group justify="flex-end">
              <FtpMissingBadge ftp={userProfile?.ftp} />
            </Group>
          )}

          {/* Status Bar — CTL/ATL/TSB/This Week */}
          <StatusBar
            ctl={trainingMetrics.ctl}
            atl={trainingMetrics.atl}
            tsb={trainingMetrics.tsb}
            ctlDeltaPct={trainingMetrics.ctlDeltaPct}
            weekRides={weekStats.activities}
            weekPlanned={weekStats.planned}
            loading={loading}
            fsConfidence={fsConfidence}
            todayTerrain={todayTerrain}
          />

          {/* AI Fitness Summary — plain-language context */}
          {!loading && (
            <FitnessSummary
              tfi={trainingMetrics.ctl}
              afi={trainingMetrics.atl}
              formScore={trainingMetrics.tsb}
              ctlDeltaPct={trainingMetrics.ctlDeltaPct}
            />
          )}

          {/* Intelligence Card — workout + route match */}
          <IntelligenceCard
            workout={todayWorkout}
            plan={activePlans[0] || null}
            plans={activePlans}
            routeMatch={todayRouteMatch}
            loading={loading}
            formatDist={formatDist}
          />

          {/* Active Training Plans */}
          {activePlans.length > 0 && activePlans.map((plan) => (
            <ActivePlanCard
              key={plan.id}
              plan={plan}
              compact
            />
          ))}

          {/* Proactive Insight */}
          <ProactiveInsightCard />

          {/* Map + Coach — side-by-side visual anchors */}
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing={14}>
            <RecentRidesMap
              activities={activities}
              loading={loading}
              formatDist={formatDist}
              formatElev={formatElev}
            />
            <CoachCard
              trainingContext={trainingContext}
              workoutRecommendation={todayWorkout ? { primary: { workout: todayWorkout, reason: todayWorkout.description || '', source: 'plan' } } : null}
            />
          </SimpleGrid>

          {/* This Week */}
          <WeekChart
            weekStats={weekStats}
            loading={loading}
            formatDist={formatDist}
            formatElev={formatElev}
          />
        </Stack>
      </Container>
    </AppShell>
  );
}

export default Dashboard;
