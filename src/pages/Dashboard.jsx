import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Container,
  SimpleGrid,
  Stack,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import AppShell from '../components/AppShell.jsx';
import OnboardingModal from '../components/OnboardingModal.jsx';
import WhatsNewModal, { hasSeenLatestUpdates } from '../components/WhatsNewModal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { supabase } from '../lib/supabase';
import { formatDistance, formatElevation } from '../utils/units';
import GetStartedGuide from '../components/activation/GetStartedGuide.jsx';
import ProactiveInsightCard from '../components/activation/ProactiveInsightCard.jsx';
import StatusBar from '../components/today/StatusBar.jsx';
import { useFormConfidence } from '../hooks/useFormConfidence';
import { useTodayTerrain } from '../hooks/useTodayTerrain';
import IntelligenceCard from '../components/today/IntelligenceCard.jsx';
import { CoachCard } from '../components/coach';
import RecentRidesMap from '../components/RecentRidesMap.jsx';
import WeekChart from '../components/today/WeekChart.jsx';
import { ActivePlanCard } from '../components/training';
import { calculateCTL, calculateATL, calculateTSB } from '../utils/trainingPlans';
import { estimateActivityTSS } from '../utils/computeFitnessSnapshots';

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [activePlans, setActivePlans] = useState([]);
  const [todayWorkout, setTodayWorkout] = useState(null);
  const [weekStats, setWeekStats] = useState({ rides: 0, planned: 0, distance: 0, elevation: 0 });
  const [todayRouteMatch, setTodayRouteMatch] = useState(null);
  const [proprietaryMetrics, setProprietaryMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  // Check if onboarding is needed and load user profile
  useEffect(() => {
    const checkOnboardingAndLoadProfile = async () => {
      if (!user) return;

      // Always check database first for onboarding status (persists across browsers)
      try {
        const { data } = await supabase
          .from('user_profiles')
          .select('onboarding_completed, display_name, units_preference, ftp')
          .eq('id', user.id)
          .single();

        if (data) {
          setUserProfile(data);

          // If onboarding is completed in database, update localStorage and skip onboarding
          if (data.onboarding_completed) {
            localStorage.setItem(`tribos_welcome_seen_${user.id}`, 'true');
            // Check for What's New updates
            if (!hasSeenLatestUpdates(user.id)) {
              setShowWhatsNew(true);
            }
            return;
          }
        }
      } catch {
        // Profile doesn't exist yet - user needs onboarding
      }

      // Only show onboarding if not completed in database
      const hasSeenWelcome = localStorage.getItem(`tribos_welcome_seen_${user.id}`);
      if (!hasSeenWelcome) {
        localStorage.setItem(`tribos_welcome_seen_${user.id}`, 'true');
        setShowOnboarding(true);
      } else {
        // Check for What's New updates if onboarding already seen locally
        if (!hasSeenLatestUpdates(user.id)) {
          setShowWhatsNew(true);
        }
      }
    };

    checkOnboardingAndLoadProfile();
  }, [user]);

  // PostHog: today_view.opened — fired once per mount.
  useEffect(() => {
    if (typeof window === 'undefined' || !user) return;
    window.posthog?.capture?.('today_view.opened', {
      view_version: 'today_v2_reflow',
    });
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

  // CTL/ATL/TSB using canonical formulas (matches TrainingDashboard)
  const trainingMetrics = useMemo(() => {
    if (!activities || activities.length === 0) {
      return { ctl: 0, atl: 0, tsb: 0, ctlDeltaPct: 0 };
    }

    const userFtp = userProfile?.ftp || 200;

    // Build daily TSS map for the last 90 days
    const now = new Date();
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const dailyTSS = {};
    for (let d = new Date(ninetyDaysAgo); d <= now; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      dailyTSS[key] = 0;
    }

    activities.forEach((activity) => {
      const dateStr = activity.start_date?.split('T')[0];
      if (dateStr && dailyTSS[dateStr] !== undefined) {
        const tss = Math.min(estimateActivityTSS(activity, userFtp), 500);
        dailyTSS[dateStr] += tss;
      }
    });

    const days = Object.keys(dailyTSS).sort();
    const tssValues = days.map((d) => dailyTSS[d]);

    const ctl = calculateCTL(tssValues);
    const atl = calculateATL(tssValues);

    // TSB uses yesterday's CTL/ATL (freshness going into today)
    const tssYesterday = tssValues.length >= 2 ? tssValues.slice(0, -1) : tssValues;
    const ctlYesterday = calculateCTL(tssYesterday);
    const atlYesterday = calculateATL(tssYesterday);
    const tsb = calculateTSB(ctlYesterday, atlYesterday);

    // CTL trend: compare current CTL vs CTL 28 days ago
    const cutoffIndex = Math.max(0, tssValues.length - 28);
    const tssValues28dAgo = tssValues.slice(0, cutoffIndex);
    const ctl28dAgo = calculateCTL(tssValues28dAgo);
    const ctlDeltaPct = ctl28dAgo > 0 ? ((ctl - ctl28dAgo) / ctl28dAgo) * 100 : 0;

    return { ctl, atl, tsb, ctlDeltaPct };
  }, [activities, userProfile]);

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

  const handleCloseOnboarding = useCallback(() => setShowOnboarding(false), []);
  const handleCloseWhatsNew = useCallback(() => setShowWhatsNew(false), []);

  return (
    <AppShell>
      <OnboardingModal
        opened={showOnboarding}
        onClose={handleCloseOnboarding}
      />
      <WhatsNewModal
        opened={showWhatsNew}
        onClose={handleCloseWhatsNew}
        userId={user?.id}
      />
      <Container size="xl" py="lg" px={20}>
        <Stack gap={14}>
          {/* Strip 1 — Header: greeting + active plan progress */}
          <PageHeader
            greeting={`${getGreeting()},`}
            title={displayName}
            titleOrder={2}
          />

          {activePlans.length > 0 && activePlans.map((plan) => (
            <ActivePlanCard
              key={plan.id}
              plan={plan}
              compact
            />
          ))}

          {/* Strip 2 — Compact 7-cell metric row.
              FORM · FITNESS · FATIGUE · EFI · TCAS · TREND · THIS WEEK.
              StatusBar absorbs ProprietaryMetricsBar via the
              `proprietaryMetrics` prop so the row reads as a single
              instrument cluster. Each cell taps to /progress. */}
          <StatusBar
            ctl={trainingMetrics.ctl}
            atl={trainingMetrics.atl}
            tsb={trainingMetrics.tsb}
            ctlDeltaPct={trainingMetrics.ctlDeltaPct}
            weekRides={weekStats.activities}
            weekPlanned={weekStats.planned}
            loading={loading || metricsLoading}
            fsConfidence={fsConfidence}
            todayTerrain={todayTerrain}
            proprietaryMetrics={proprietaryMetrics}
            compact
            onCellClick={(metricId) => {
              if (typeof window !== 'undefined') {
                window.posthog?.capture?.('today_view.metric_expanded', {
                  view_version: 'today_v2_reflow',
                  metric: metricId,
                });
              }
              navigate(`/progress?metric=${metricId}`);
            }}
          />

          {/* Strip 3 — Two-column split: Today's Ride | Coach.
              IntelligenceCard consolidates Today's Focus + Best Route
              Match. CoachCard's persona-voiced first-message-of-day
              absorbs what FitnessSummary used to render here. */}
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing={14}>
            <IntelligenceCard
              workout={todayWorkout}
              plan={activePlans[0] || null}
              plans={activePlans}
              routeMatch={todayRouteMatch}
              loading={loading}
              formatDist={formatDist}
            />
            <CoachCard
              trainingContext={trainingContext}
              workoutRecommendation={todayWorkout ? { primary: { workout: todayWorkout, reason: todayWorkout.description || '', source: 'plan' } } : null}
              dailyMetrics={{
                tfi: trainingMetrics.ctl,
                afi: trainingMetrics.atl,
                formScore: trainingMetrics.tsb,
                ctlDeltaPct: trainingMetrics.ctlDeltaPct,
              }}
              showDailyMessage
              surface="today"
            />
          </SimpleGrid>

          {/* Strip 4 — Below the fold (acceptable). */}
          <RecentRidesMap
            activities={activities}
            loading={loading}
            formatDist={formatDist}
            formatElev={formatElev}
          />

          <WeekChart
            weekStats={weekStats}
            loading={loading}
            formatDist={formatDist}
            formatElev={formatElev}
          />

          {/* Conditional, only when applicable. Sits below the fold so
              they don't push the headline content off-screen. */}
          <GetStartedGuide />
          <ProactiveInsightCard />
        </Stack>
      </Container>
    </AppShell>
  );
}

export default Dashboard;
