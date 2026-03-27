import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Container,
  SimpleGrid,
  Stack,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
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
import IntelligenceCard from '../components/today/IntelligenceCard.jsx';
import { CoachCard } from '../components/coach';
import RecentRidesMap from '../components/RecentRidesMap.jsx';
import WeekChart from '../components/today/WeekChart.jsx';
import FitnessSummary from '../components/today/FitnessSummary.jsx';
import ProprietaryMetricsBar from '../components/today/ProprietaryMetricsBar.tsx';

function Dashboard() {
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [activePlan, setActivePlan] = useState(null);
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
          .select('onboarding_completed, display_name, units_preference')
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

        if (!error) {
          setActivities(activityData || []);

          // Calculate week stats
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          const weekActivities = (activityData || []).filter(a =>
            new Date(a.start_date) >= weekAgo
          );

          setWeekStats({
            rides: weekActivities.length,
            planned: 5, // TODO: Get from active plan
            distance: weekActivities.reduce((sum, a) => sum + ((a.distance_meters || a.distance || 0) / 1000), 0),
            elevation: weekActivities.reduce((sum, a) => sum + (a.elevation_gain_meters || a.total_elevation_gain || 0), 0),
          });
        }

        // Fetch active training plan
        const { data: planData } = await supabase
          .from('training_plans')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (planData) {
          setActivePlan(planData);

          // Fetch today's workout
          const today = new Date().toISOString().split('T')[0];
          const { data: workoutData } = await supabase
            .from('planned_workouts')
            .select('*')
            .eq('plan_id', planData.id)
            .eq('scheduled_date', today)
            .maybeSingle();

          if (workoutData) {
            setTodayWorkout(workoutData);
          }
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

  // Lift CTL/ATL/TSB calculation from old FitnessMetrics component
  const trainingMetrics = useMemo(() => {
    if (!activities || activities.length === 0) {
      return { ctl: 0, atl: 0, tsb: 0 };
    }

    // Estimate TSS from activity if not provided
    const estimateTSS = (activity) => {
      if (activity.tss) return activity.tss;
      const hours = (activity.duration_seconds || activity.moving_time || 0) / 3600;
      const avgPower = activity.average_power_watts || activity.average_watts;
      if (avgPower && activity.normalized_power_watts) {
        const ftp = 200;
        const intensityFactor = activity.normalized_power_watts / ftp;
        return Math.round(hours * intensityFactor * intensityFactor * 100);
      }
      const avgHR = activity.average_heart_rate || activity.average_hr;
      if (avgHR) {
        const intensity = avgHR / 180;
        return Math.round(hours * intensity * 100);
      }
      return Math.round(hours * 50);
    };

    // Build daily TSS map for the last 60 days
    const now = new Date();
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const dailyTSS = {};
    for (let d = new Date(sixtyDaysAgo); d <= now; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split('T')[0];
      dailyTSS[key] = 0;
    }

    activities.forEach((activity) => {
      const date = new Date(activity.start_date).toISOString().split('T')[0];
      const tss = estimateTSS(activity);
      if (dailyTSS[date] !== undefined) {
        dailyTSS[date] += tss;
      }
    });

    const days = Object.keys(dailyTSS).sort();
    const tssValues = days.map((d) => dailyTSS[d]);

    // CTL: 42-day exponentially weighted average
    const ctlDecay = 1 / 42;
    let ctl = 0;
    tssValues.forEach((tss, index) => {
      const weight = Math.exp(-ctlDecay * (tssValues.length - index - 1));
      ctl += tss * weight;
    });
    ctl = Math.round(ctl * ctlDecay);

    // ATL: 7-day exponentially weighted average
    const recentTSS = tssValues.slice(-7);
    const atlDecay = 1 / 7;
    let atl = 0;
    recentTSS.forEach((tss, index) => {
      const weight = Math.exp(-atlDecay * (recentTSS.length - index - 1));
      atl += tss * weight;
    });
    atl = Math.round(atl * atlDecay);

    const tsb = ctl - atl;

    // CTL trend: compute CTL at 28 days ago for comparison
    const cutoffIndex = Math.max(0, tssValues.length - 28);
    const tssValues28dAgo = tssValues.slice(0, cutoffIndex);
    let ctl28dAgo = 0;
    tssValues28dAgo.forEach((tss, index) => {
      const weight = Math.exp(-ctlDecay * (tssValues28dAgo.length - index - 1));
      ctl28dAgo += tss * weight;
    });
    ctl28dAgo = Math.round(ctl28dAgo * ctlDecay);
    const ctlDeltaPct = ctl28dAgo > 0 ? ((ctl - ctl28dAgo) / ctl28dAgo) * 100 : 0;

    return { ctl, atl, tsb, ctlDeltaPct };
  }, [activities]);

  // Build training context string for CoachCard
  const trainingContext = useMemo(() => {
    const parts = [];
    parts.push(`CTL: ${trainingMetrics.ctl}, ATL: ${trainingMetrics.atl}, TSB: ${trainingMetrics.tsb}`);
    if (weekStats.rides > 0) {
      parts.push(`This week: ${weekStats.rides} rides, ${formatDist(weekStats.distance)}, ${formatElev(weekStats.elevation)}`);
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

          {/* Status Bar — CTL/ATL/TSB/This Week */}
          <StatusBar
            ctl={trainingMetrics.ctl}
            atl={trainingMetrics.atl}
            tsb={trainingMetrics.tsb}
            ctlDeltaPct={trainingMetrics.ctlDeltaPct}
            weekRides={weekStats.rides}
            weekPlanned={weekStats.planned}
            loading={loading}
          />

          {/* AI Fitness Summary — plain-language context */}
          {!loading && (
            <FitnessSummary
              ctl={trainingMetrics.ctl}
              atl={trainingMetrics.atl}
              tsb={trainingMetrics.tsb}
            />
          )}

          {/* Intelligence Card — workout + route match */}
          <IntelligenceCard
            workout={todayWorkout}
            plan={activePlan}
            routeMatch={todayRouteMatch}
            loading={loading}
            formatDist={formatDist}
          />

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
