// Training Dashboard - Updated Dec 2024
import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import {
  Container,
  Drawer,
  SegmentedControl,
  Stack,
  Group,
  Box,
  Button,
  Menu,
  ActionIcon,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMediaQuery } from '@mantine/hooks';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppShell from '../components/AppShell.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useActivation } from '../hooks/useActivation';
import { resolveTrainTab } from '../components/train/trainTabs';
import ProgressTab from '../components/train/ProgressTab.jsx';
import { buildTrainingContext, getSportTypeForActivity } from '../lib/training/buildTrainingContext';
import { useGear } from '../hooks/useGear';
import { trackGear } from '../utils/gearTelemetry';
import { formatLocalDate, getTodayString, activityDateKey, weekRangeKeys } from '../utils/dateUtils';
import { supabase } from '../lib/supabase';
import { fetchPlannedSessions } from '../lib/calendar/readPlannedSessions';
import { createEntry } from '../lib/calendar/calendarMutations';
import { resolveActivePlan } from '../utils/activePlan';
import { CheckInPage } from '../components/coach';
import TrainingCalendar from '../components/TrainingCalendar.jsx';
import TrainingPlanBrowser from '../components/TrainingPlanBrowser.jsx';
import RideHistoryTable from '../components/RideHistoryTable.jsx';
import HealthCheckInModal from '../components/HealthCheckInModal.jsx';
import FitUploadModal from '../components/FitUploadModal.jsx';
import BulkGpxUploadModal from '../components/BulkGpxUploadModal.jsx';
import { TrainingMetricsSkeleton } from '../components/LoadingSkeletons.jsx';
import { SupplementWorkoutModal, TrainingPlanExportItems } from '../components/training';
import RideAnalysisModal from '../components/RideAnalysisModal.jsx';
import { WorkoutModal } from '../components/planner/WorkoutModal';
import { getWorkoutById } from '../data/workoutLibrary';
import { getWorkoutRecommendation } from '../services/workoutRecommendation';
import { interpretTSB, findOptimalSupplementDays } from '../utils/trainingPlans';
import { estimateActivityTSS } from '../utils/computeFitnessSnapshots';
import { buildDailyLoadSeries } from '../views/today/athleteMetrics';
import { FtpMissingBadge } from '../components/ui';
import { translateTSB } from '../lib/fitness/translate';
import { formatDistance, formatElevation, formatSpeed } from '../utils/units';
import { garminService } from '../utils/garminService.js';
import PageHeader from '../components/PageHeader.jsx';
import { useCrossTraining } from '../hooks/useCrossTraining';
import { Barbell, Calendar, DotsThree, FileZip, Gear, Heart, Heartbeat, TrendDown, TrendUp, Watch } from '@phosphor-icons/react';
import PlanWeekCard from '../components/train/PlanWeekCard.jsx';
import SecondaryNavBar from '../components/train/SecondaryNavBar.jsx';

// Season planner (behind the season_planner flag): loaded only when opened.
const SeasonTab = lazy(() => import('../components/season/SeasonTab'));
const EventsTab = lazy(() => import('../components/train/EventsTab'));
import RideMapCard from '../components/train/RideMapCard.jsx';
import RepeatsTab from '../components/train/RepeatsTab.jsx';
import { rideHasGps, selectGpsRide } from '../utils/rideGeo';

// Rolling window handed to the coach context; not a visible control.
const COACH_CONTEXT_DAYS = 30;

function TrainingDashboard() {
  const { user } = useAuth();
  const { activation } = useActivation(user?.id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [loading, setLoading] = useState(true);

  // Six tabs (Calendar · Season · Coach · Progress · Rides · Find an event); old ?tab= values
  // redirect through resolveTrainTab (src/components/train/trainTabs.ts).
  const urlTabState = resolveTrainTab(searchParams);
  const urlTabKey = `${urlTabState.tab}|${urlTabState.view}|${urlTabState.browse}`;
  const [activeTab, setActiveTab] = useState(urlTabState.tab);
  // Season: the season view or one race's details. Rides: history or repeats.
  const [seasonView, setSeasonView] = useState(urlTabState.tab === 'season' ? urlTabState.view : null);
  const [rideView, setRideView] = useState(urlTabState.tab === 'rides' ? urlTabState.view : null);
  // The plan browser opens as a drawer over the calendar (old ?tab=browse links land here).
  const [browseOpen, setBrowseOpen] = useState(urlTabState.browse);
  // Keep the tab in sync with the URL so deep links and CTAs work even when already on this page.
  useEffect(() => {
    setActiveTab(urlTabState.tab);
    if (urlTabState.tab === 'season') setSeasonView(urlTabState.view);
    if (urlTabState.tab === 'rides') setRideView(urlTabState.view);
    if (urlTabState.browse) setBrowseOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTabKey]);
  const selectTab = useCallback((tab) => {
    setActiveTab(tab);
    if (tab !== 'season') setSeasonView(null);
    if (tab !== 'rides') setRideView(null);
  }, []);
  const [activities, setActivities] = useState([]);
  const [speedProfile, setSpeedProfile] = useState(null);
  const [unitsPreference, setUnitsPreference] = useState('imperial');
  const [ftp, setFtp] = useState(null);
  // Adaptive EWA tau (user_profiles.tfi_tau/afi_tau) so client-filled tail
  // days decay at the athlete's actual rate — same guard as the server engine.
  const [taus, setTaus] = useState({ tfi: 42, afi: 7 });
  const [powerZones, setPowerZones] = useState(null);
  const [userWeight, setUserWeight] = useState(null);
  const [trainingMetrics, setTrainingMetrics] = useState({
    ctl: 0,
    atl: 0,
    tsb: 0,
    interpretation: null,
  });
  const [dailyTSSData, setDailyTSSData] = useState([]);
  const [serverLoadHistory, setServerLoadHistory] = useState([]);
  const [healthCheckInOpen, setHealthCheckInOpen] = useState(false);
  const [fitUploadOpen, setFitUploadOpen] = useState(false);
  const [gpxUploadOpen, setGpxUploadOpen] = useState(false);
  const [todayHealthMetrics, setTodayHealthMetrics] = useState(null);
  const [healthHistory, setHealthHistory] = useState([]);
  const [workoutModalOpen, setWorkoutModalOpen] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [activePlan, setActivePlan] = useState(null);
  const [plannedWorkouts, setPlannedWorkouts] = useState([]);
  const [supplementModalOpen, setSupplementModalOpen] = useState(false);
  const [raceGoals, setRaceGoals] = useState([]);
  const [completedRaces, setCompletedRaces] = useState([]);
  const [trainNowExpanded, setTrainNowExpanded] = useState(false);
  const [rideAnalysisModalOpen, setRideAnalysisModalOpen] = useState(false);
  const [selectedRide, setSelectedRide] = useState(null);
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);

  // Cross-training activities
  const { getRecentActivitiesForContext, getDailyTSSRange } = useCrossTraining();
  const [crossTrainingContext, setCrossTrainingContext] = useState([]);

  // Unit conversion helpers
  const isImperial = unitsPreference === 'imperial';

  // Format functions using preference
  const formatDist = (km) => formatDistance(km, isImperial);
  const formatElev = (m) => formatElevation(m, isImperial);
  const formatSpd = (kmh) => formatSpeed(kmh, isImperial);

  // Filter out hidden activities for stats/calculations
  const visibleActivities = useMemo(() =>
    activities.filter(a => !a.is_hidden),
    [activities]
  );

  // The ride map above the tabs. `mapRideId` is the athlete's pick (a HISTORY
  // row or the prev/next arrows); null means "the newest ride with GPS". The
  // selection resolves by id on every render so it survives the gear merge
  // replacing every row object.
  const [mapRideId, setMapRideId] = useState(null);
  const [mapOpenSignal, setMapOpenSignal] = useState(0);
  // The map card starts collapsed; REPEATS overlays rides on the anchor
  // ride shown there, so opening that tab asks the card to unfold.
  useEffect(() => {
    if (activeTab === 'rides' && rideView === 'repeats') setMapOpenSignal((n) => n + 1);
  }, [activeTab, rideView]);
  const mapCardRef = useRef(null);
  const gpsRides = useMemo(() => visibleActivities.filter(rideHasGps), [visibleActivities]);
  const mapSel = useMemo(() => selectGpsRide(gpsRides, mapRideId), [gpsRides, mapRideId]);

  // Recalculate training metrics when visible activities change.
  // Uses the shared server-preferred day walk (buildDailyLoadSeries) so /train
  // shows the same fitness/fatigue/form as the Today views and Dashboard:
  // per-day training_load_daily rows win, client EWA fills the gaps.
  useEffect(() => {
    const series = buildDailyLoadSeries(visibleActivities, ftp, serverLoadHistory, 90, taus);
    if (series.length === 0) {
      setDailyTSSData([]);
      setTrainingMetrics({ ctl: 0, atl: 0, tsb: 0, interpretation: null });
      return;
    }

    // Enriched points: tss for RampRateAlert / the load area chart, plus the
    // server-preferred ctl/atl/tsb per day for the fitness lines.
    setDailyTSSData(
      series.map((p) => ({
        date: p.date,
        tss: p.rss,
        ctl: Math.round(p.tfi),
        atl: Math.round(p.afi),
        tsb: p.fs,
      }))
    );

    const last = series[series.length - 1];
    const ctl = Math.round(last.tfi);
    const atl = Math.round(last.afi);
    const tsb = last.fs;
    setTrainingMetrics({ ctl, atl, tsb, interpretation: interpretTSB(tsb) });
  }, [visibleActivities, ftp, serverLoadHistory, taus]);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      if (!user) return;

      try {
        const { data: userProfileData } = await supabase
          .from('user_profiles')
          .select('units_preference, ftp, power_zones, weight_kg, tfi_tau, afi_tau')
          .eq('id', user.id)
          .single();

        if (userProfileData?.units_preference) {
          setUnitsPreference(userProfileData.units_preference);
        }
        if (userProfileData?.ftp) setFtp(userProfileData.ftp);
        setTaus({
          tfi: Number(userProfileData?.tfi_tau) > 0 ? Number(userProfileData.tfi_tau) : 42,
          afi: Number(userProfileData?.afi_tau) > 0 ? Number(userProfileData.afi_tau) : 7,
        });
        if (userProfileData?.power_zones) setPowerZones(userProfileData.power_zones);
        if (userProfileData?.weight_kg) setUserWeight(userProfileData.weight_kg);

        // Server-stored daily load (terrain/MTB multipliers, per-athlete tau).
        // Same 90-day query as the Today views; buildDailyLoadSeries prefers
        // these rows per-day and client-computes the gaps.
        const ninety = new Date();
        ninety.setDate(ninety.getDate() - 90);
        const ninetyKey = formatLocalDate(ninety);
        const { data: serverLoadRows } = await supabase
          .from('training_load_daily')
          .select('date, tfi, afi, form_score')
          .eq('user_id', user.id)
          .gte('date', ninetyKey)
          .order('date', { ascending: true });
        setServerLoadHistory(serverLoadRows || []);

        // Get all activities using pagination (Supabase caps at 1000 per request)
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

        console.log(`Loaded ${allActivities.length} activities from database (${page} pages)`);
        if (allActivities.length > 0) {
          const dates = allActivities.map(a => a.start_date).filter(Boolean).sort();
          console.log(`Activity date range: ${dates[0]} to ${dates[dates.length - 1]}`);
        }
        setActivities(allActivities);

        // Which bike each ride is on (activity_gear, chunked .in()). Merged as
        // ride.gear so the history rows and the ride modal can show a picker.
        try {
          const rideIds = allActivities.map(a => a.id);
          const links = new Map();
          for (let i = 0; i < rideIds.length; i += 200) {
            const { data: linkRows } = await supabase
              .from('activity_gear')
              .select('activity_id, gear_item_id, assigned_by, surface_override')
              .in('activity_id', rideIds.slice(i, i + 200));
            for (const row of linkRows || []) links.set(row.activity_id, row);
          }
          if (links.size > 0) {
            setActivities(prev => prev.map(a => (links.has(a.id) ? { ...a, gear: links.get(a.id) } : a)));
          }
        } catch (gearErr) {
          console.warn('Could not load bike assignments:', gearErr?.message || gearErr);
        }

        const { data: profileData } = await supabase
          .from('user_speed_profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (profileData) setSpeedProfile(profileData);

        // Load today's health metrics
        const today = getTodayString();
        const { data: healthData, error: healthError } = await supabase
          .from('health_metrics')
          .select('*')
          .eq('user_id', user.id)
          .eq('metric_date', today)
          .maybeSingle();

        if (healthError) {
          console.warn('Health metrics query failed:', healthError.message);
        } else if (healthData) {
          // Map production column names to what the app expects
          setTodayHealthMetrics({
            ...healthData,
            recorded_date: healthData.metric_date,
            resting_heart_rate: healthData.resting_hr,
            hrv_score: healthData.hrv_ms
          });
        }

        // Load health history for trends visualization (last 90 days)
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const { data: healthHistoryData, error: healthHistoryError } = await supabase
          .from('health_metrics')
          .select('*')
          .eq('user_id', user.id)
          .gte('metric_date', formatLocalDate(ninetyDaysAgo))
          .order('metric_date', { ascending: true });

        if (healthHistoryError) {
          console.warn('Health history query failed:', healthHistoryError.message);
        } else if (healthHistoryData) {
          setHealthHistory(healthHistoryData);
          console.log(`Loaded ${healthHistoryData.length} days of health history`);
        }

        // Resolve the active plan via the single canonical resolver (priority-first).
        const planData = await resolveActivePlan(supabase, user.id);
        if (planData) {
          setActivePlan(planData);
          console.log('Active training plan loaded:', planData.name);
        } else {
          console.log('No active training plan found');
        }

        // Load planned workouts USER-scoped (not plan-scoped) so dashboard widgets see
        // every workout — coach adds, manual adds, any plan — matching the calendar.
        const workoutsData = await fetchPlannedSessions(user.id);
        setPlannedWorkouts(workoutsData);
        console.log(`Loaded ${workoutsData.length} calendar sessions`);
      } catch (error) {
        console.error('Error loading training data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user]);

  // Listen for plan activation events from coach UIs
  useEffect(() => {
    const handlePlanActivated = async () => {
      if (!user?.id) return;
      try {
        const planData = await resolveActivePlan(supabase, user.id);
        setActivePlan(planData || null);

        // Athlete-scoped reload so newly-added sessions from any source appear.
        setPlannedWorkouts(await fetchPlannedSessions(user.id));

        setCalendarRefreshKey((prev) => prev + 1);
      } catch (err) {
        console.error('Error refreshing after plan activation:', err);
      }
    };

    window.addEventListener('training-plan-activated', handlePlanActivated);
    window.addEventListener('training-plan-updated', handlePlanActivated);
    return () => {
      window.removeEventListener('training-plan-activated', handlePlanActivated);
      window.removeEventListener('training-plan-updated', handlePlanActivated);
    };
  }, [user]);

  // Automatic Garmin sync - recover failed events and backfill GPS on load
  useEffect(() => {
    const runGarminAutoSync = async () => {
      if (!user) return;

      try {
        // Check if user has Garmin connected
        const status = await garminService.getConnectionStatus();
        if (!status.connected) {
          return; // Not connected
        }
        // Note: Don't skip on tokenExpired - the server-side getValidAccessToken()
        // automatically refreshes tokens. Skipping here prevents recovery.

        console.log('🔄 Running automatic Garmin sync...');

        // Run reprocessFailedEvents to recover any failed webhook imports
        // This is what the user had to click "Recover Failed Events" for
        try {
          const recoverResult = await garminService.reprocessFailedEvents();
          if (recoverResult.reprocessed > 0) {
            console.log(`✅ Auto-recovered ${recoverResult.reprocessed} Garmin activities`);
            // Reload activities to show the newly recovered ones
            const { data: activityData } = await supabase
              .from('activities')
              .select('*')
              .eq('user_id', user.id)
              .is('duplicate_of', null)
              .order('start_date', { ascending: false })
              .limit(2000);
            if (activityData) {
              setActivities(activityData);
            }
          }
        } catch (err) {
          // Silent fail - this is a background optimization
          console.log('ℹ️ Garmin recover check:', err.message);
        }

        // Run GPS backfill for activities missing GPS data
        try {
          const gpsResult = await garminService.backfillGps(20); // Limit to 20 for faster completion
          if (gpsResult.stats?.success > 0) {
            console.log(`✅ Auto-backfilled GPS for ${gpsResult.stats.success} activities`);
            // Reload activities to show updated GPS data
            const { data: activityData } = await supabase
              .from('activities')
              .select('*')
              .eq('user_id', user.id)
              .is('duplicate_of', null)
              .order('start_date', { ascending: false })
              .limit(2000);
            if (activityData) {
              setActivities(activityData);
            }
          }
        } catch (err) {
          // Silent fail - this is a background optimization
          console.log('ℹ️ Garmin GPS backfill check:', err.message);
        }

        // Run streams backfill for activities missing ride analysis
        try {
          const streamsResult = await garminService.backfillStreams(10);
          if (streamsResult.stats?.success > 0) {
            console.log(`✅ Auto-backfilled streams for ${streamsResult.stats.success} activities`);
            const { data: activityData } = await supabase
              .from('activities')
              .select('*')
              .eq('user_id', user.id)
              .is('duplicate_of', null)
              .order('start_date', { ascending: false })
              .limit(2000);
            if (activityData) {
              setActivities(activityData);
            }
          }
        } catch (err) {
          console.log('ℹ️ Garmin streams backfill check:', err.message);
        }
      } catch (err) {
        // Silent fail - Garmin might not be set up
        console.log('ℹ️ Garmin auto-sync not available:', err.message);
      }
    };

    // Run after a short delay to not block initial load
    const timer = setTimeout(runGarminAutoSync, 2000);
    return () => clearTimeout(timer);
  }, [user]);

  // Adaptive arc refill — ease upcoming arc sessions when the athlete is carrying
  // fatigue (Increment B2). Stateless/reversible server recompute; runs once per
  // mount and refreshes the calendar only when something actually changed.
  const arcRefillRanRef = useRef(false);
  useEffect(() => {
    if (!user || arcRefillRanRef.current) return;
    arcRefillRanRef.current = true;

    const runArcRefill = async () => {
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        if (!token) return;
        const response = await fetch('/api/arc-refill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ userLocalDate: getTodayString() }),
        });
        if (!response.ok) return;
        const result = await response.json();
        if (result?.count > 0) {
          // Refresh the calendar/plan views via the existing reload event.
          window.dispatchEvent(new CustomEvent('training-plan-updated'));
          const eased = (result.changes || []).filter((c) => c.reason).length;
          notifications.show({
            title: 'Plan adapted to your readiness',
            message: eased > 0
              ? `Eased ${eased} upcoming session${eased === 1 ? '' : 's'} — you're carrying fatigue.`
              : `Restored ${result.count} session${result.count === 1 ? '' : 's'} as you've recovered.`,
            color: 'teal',
          });
        }
      } catch (err) {
        // Silent fail — background optimization.
        console.log('ℹ️ Arc refill not available:', err.message);
      }
    };

    const timer = setTimeout(runArcRefill, 2500);
    return () => clearTimeout(timer);
  }, [user]);

  // Load race goals for AI coach context
  useEffect(() => {
    const loadRaceGoals = async () => {
      if (!user) return;

      try {
        // Load upcoming race goals (next 6 months)
        const { data, error } = await supabase
          .from('race_goals')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'upcoming')
          .gte('race_date', getTodayString())
          .order('race_date', { ascending: true })
          .limit(10);

        if (error) {
          throw error;
        }

        if (data) {
          setRaceGoals(data);
          console.log(`Loaded ${data.length} upcoming race goals`);
        }

        // Also load recently completed races (last 6 months) for coach context
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const { data: pastRaces } = await supabase
          .from('race_goals')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'completed')
          .gte('race_date', formatLocalDate(sixMonthsAgo))
          .order('race_date', { ascending: false })
          .limit(5);

        if (pastRaces) {
          setCompletedRaces(pastRaces);
        }
      } catch (error) {
        console.error('Error loading race goals:', error);
      }
    };

    loadRaceGoals();
  }, [user]);

  // Load cross-training activities for AI context
  useEffect(() => {
    const loadCrossTrainingContext = async () => {
      if (!user) return;

      try {
        const recentActivities = await getRecentActivitiesForContext(14);
        setCrossTrainingContext(recentActivities);
        if (recentActivities.length > 0) {
          console.log(`Loaded ${recentActivities.length} cross-training activities for AI context`);
        }
      } catch (error) {
        // Degrade gracefully (coach context is optional) but log the real error
        console.error('Error loading cross-training context:', error);
      }
    };

    loadCrossTrainingContext();
  }, [user, getRecentActivitiesForContext]);

  // Rolling-window stats (uses visibleActivities to exclude hidden). Nothing
  // on the page renders these — they only feed buildTrainingContext, so the
  // window is a fixed 30 days rather than a header selector that appeared to
  // do nothing.
  const weeklyStats = useMemo(() => {
    const days = COACH_CONTEXT_DAYS;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const filtered = visibleActivities.filter(a => new Date(a.start_date) >= cutoff);

    const stats = filtered.reduce(
      (acc, a) => {
        // Unified 5-tier RSS estimation (same path as the CTL/ATL metrics) —
        // the old inline tiering fed average_watts into the NP-based formula,
        // underestimating variable rides vs the chart on this same page.
        const activityTSS = Math.min(estimateActivityTSS(a, ftp) || 0, 500);

        const sport = getSportTypeForActivity(a);
        const sportBucket = sport === 'running' ? acc.running : sport === 'cycling' ? acc.cycling : acc.other;
        sportBucket.distance += (a.distance || 0);
        sportBucket.time += (a.moving_time || 0);
        sportBucket.elevation += (a.total_elevation_gain || 0);
        sportBucket.tss += activityTSS;
        sportBucket.count += 1;
        if (sport === 'cycling' && a.average_watts > 0) {
          sportBucket.totalPower += a.average_watts;
          sportBucket.powerCount += 1;
        }

        return {
          ...acc,
          totalDistance: acc.totalDistance + (a.distance || 0),
          totalTime: acc.totalTime + (a.moving_time || 0),
          totalElevation: acc.totalElevation + (a.total_elevation_gain || 0),
          totalTSS: acc.totalTSS + (activityTSS || 0),
          rideCount: acc.rideCount + (sport === 'cycling' ? 1 : 0),
          runCount: acc.runCount + (sport === 'running' ? 1 : 0),
          otherCount: acc.otherCount + (sport === 'other' ? 1 : 0),
          activityCount: acc.activityCount + 1,
        };
      },
      {
        totalDistance: 0, totalTime: 0, totalElevation: 0, totalTSS: 0,
        rideCount: 0, runCount: 0, otherCount: 0, activityCount: 0,
        cycling: { distance: 0, time: 0, elevation: 0, tss: 0, count: 0, totalPower: 0, powerCount: 0 },
        running: { distance: 0, time: 0, elevation: 0, tss: 0, count: 0 },
        other: { distance: 0, time: 0, elevation: 0, tss: 0, count: 0 },
      }
    );

    // Compute derived metrics
    stats.cycling.avgPower = stats.cycling.powerCount > 0
      ? Math.round(stats.cycling.totalPower / stats.cycling.powerCount)
      : 0;
    // Average pace in min/km for running
    const runDistKm = stats.running.distance / 1000;
    stats.running.avgPaceMinKm = runDistKm > 0
      ? (stats.running.time / 60) / runDistKm
      : 0;

    return stats;
  }, [visibleActivities, ftp]);

  // Calculate true weekly stats (Monday-Sunday of current week).
  // Bounded at BOTH ends against date keys — the old `>= thisMonday` form had
  // no upper bound, so a future-dated activity counted toward this week, and
  // it compared Date objects built two different ways. `totalTSS` lives here
  // (not on `weeklyStats`, which is the coach's rolling 30-day window) so the
  // header's RSS numerator and denominator describe the same seven days.
  const actualWeeklyStats = useMemo(() => {
    const week = weekRangeKeys(getTodayString());

    const weeklyActivities = visibleActivities.filter((a) => {
      const key = activityDateKey(a);
      return !!(week && key && key >= week.startKey && key <= week.endKeyInclusive);
    });

    return weeklyActivities.reduce(
      (acc, a) => {
        const sport = getSportTypeForActivity(a);
        return {
          totalDistance: acc.totalDistance + (a.distance || 0),
          totalTime: acc.totalTime + (a.moving_time || 0),
          totalTSS: acc.totalTSS + Math.min(estimateActivityTSS(a, ftp) || 0, 500),
          rideCount: acc.rideCount + (sport === 'cycling' ? 1 : 0),
          runCount: acc.runCount + (sport === 'running' ? 1 : 0),
          otherCount: acc.otherCount + (sport === 'other' ? 1 : 0),
          activityCount: acc.activityCount + 1,
        };
      },
      { totalDistance: 0, totalTime: 0, totalTSS: 0, rideCount: 0, runCount: 0, otherCount: 0, activityCount: 0 }
    );
  }, [visibleActivities, ftp]);

  // Format helpers
  const formatTime = (seconds) => {
    if (!seconds) return '0h';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Get form status styling — delegates to canonical translate.ts thresholds
  const getFormStatus = () => {
    const t = translateTSB(trainingMetrics.tsb);
    const colorMap = { gold: 'teal', teal: 'green', orange: 'yellow', coral: 'red', muted: 'gray' };
    const iconMap = { gold: TrendUp, teal: TrendUp, orange: TrendDown, coral: TrendDown, muted: Heartbeat };
    const bgMap = { gold: 'rgba(168, 191, 168, 0.15)', teal: 'rgba(168, 191, 168, 0.15)', orange: 'rgba(212, 168, 67, 0.15)', coral: 'rgba(158, 90, 60, 0.15)', muted: 'rgba(168, 191, 168, 0.15)' };
    return { label: t.label.toUpperCase(), color: colorMap[t.color], icon: iconMap[t.color], bg: bgMap[t.color] };
  };

  const formStatus = getFormStatus();

  // Unified workout recommendation — single source of truth
  const [focusTimeAvailable, setFocusTimeAvailable] = useState(null);

  const recommendation = useMemo(() => getWorkoutRecommendation({
    trainingMetrics,
    activities: visibleActivities,
    raceGoals,
    plannedWorkouts,
    ftp,
    timeAvailable: focusTimeAvailable ? parseInt(focusTimeAvailable) : null,
  }), [trainingMetrics, visibleActivities, raceGoals, plannedWorkouts, ftp, focusTimeAvailable]);

  const suggestedWorkout = recommendation.primary?.workout || null;

  // Memoize trainingContext to avoid recreating on every render
  const trainingContext = useMemo(() =>
    buildTrainingContext(trainingMetrics, weeklyStats, actualWeeklyStats, ftp, visibleActivities, formatDist, formatTime, isImperial, activePlan, raceGoals, crossTrainingContext, recommendation, plannedWorkouts, completedRaces),
    [trainingMetrics, weeklyStats, actualWeeklyStats, ftp, visibleActivities, isImperial, activePlan, raceGoals, crossTrainingContext, recommendation, plannedWorkouts, completedRaces]
  );

  const handleAddWorkout = useCallback(async (workout) => {
    notifications.show({
      title: 'Workout Added',
      message: `${workout.name || workout.workout_id} scheduled`,
      color: 'terracotta'
    });
    setCalendarRefreshKey(prev => prev + 1);
  }, []);

  const handleOpenCheckIn = useCallback(() => setHealthCheckInOpen(true), []);

  const handlePlanUpdated = useCallback(async () => {
    if (user?.id) {
      const { data: planData } = await supabase
        .from('training_plans')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (planData) {
        setActivePlan(planData);
        // Athlete-scoped, not plan-scoped: an entry the coach or the calendar
        // created carries no plan_id and would be invisible to the old query.
        setPlannedWorkouts(await fetchPlannedSessions(user.id));
      }
    }
  }, [user?.id]);

  const handleViewWorkout = useCallback((workout) => {
    setSelectedWorkout(workout);
    setWorkoutModalOpen(true);
  }, []);

  // Handle viewing ride details
  const handleViewRide = useCallback((ride) => {
    setSelectedRide(ride);
    setRideAnalysisModalOpen(true);
  }, []);

  // A HISTORY row drives the map card above the tabs; a ride with nothing to
  // draw (indoor, hidden) still opens the full analysis directly.
  const handleSelectMapRide = useCallback((ride) => {
    if (!gpsRides.some(r => r.id === ride.id)) {
      handleViewRide(ride);
      return;
    }
    setMapRideId(ride.id);
    setMapOpenSignal(n => n + 1);
    mapCardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [gpsRides, handleViewRide]);
  const handleMapNewer = useCallback(() => {
    setMapRideId(gpsRides[mapSel.index - 1]?.id ?? null);
  }, [gpsRides, mapSel.index]);
  const handleMapOlder = useCallback(() => {
    setMapRideId(gpsRides[mapSel.index + 1]?.id ?? null);
  }, [gpsRides, mapSel.index]);

  // `/train?tab=rides&ride=<id>` (the Today card's "full analysis" link):
  // once the activities are in, put that ride on the map and open the modal
  // — once. The ref keeps a later `activities` replacement (gear merge, hide)
  // from re-opening it after the athlete closed it.
  const urlRideId = searchParams.get('ride');
  // `/train?tab=rides&view=repeats&segment=<id>` (the ride modal's "compare repeats"):
  // the REPEATS tab opens anchored on that segment.
  const urlSegmentId = searchParams.get('segment');
  const consumedUrlRide = useRef(null);
  useEffect(() => {
    if (!urlRideId || loading || consumedUrlRide.current === urlRideId) return;
    const ride = activities.find(a => a.id === urlRideId);
    if (!ride) return;
    consumedUrlRide.current = urlRideId;
    setMapRideId(ride.id);
    handleViewRide(ride);
  }, [urlRideId, loading, activities, handleViewRide]);

  // Which bike a ride was on — the rider's decision, so assigned_by 'manual'.
  const { gearItems, reassignActivityGear, setRideSurface } = useGear({ userId: user?.id });
  const bikes = useMemo(
    () => gearItems.filter(g => g.gear_type === 'bike'),
    [gearItems],
  );
  // Shoes for the same picker on runs (multisport phase 5).
  const shoes = useMemo(
    () => gearItems.filter(g => g.gear_type === 'shoes'),
    [gearItems],
  );
  const patchRideGear = useCallback((rideId, patch) => {
    const apply = (a) => (a.id === rideId ? { ...a, gear: { ...(a.gear || { activity_id: rideId, gear_item_id: null, assigned_by: 'manual', surface_override: null }), ...patch } } : a);
    setActivities(prev => prev.map(apply));
    setSelectedRide(prev => (prev && prev.id === rideId ? apply(prev) : prev));
  }, []);

  const handleAssignBike = useCallback(async (ride, gearItemId) => {
    const before = ride.gear || null;
    const bike = gearItems.find(b => b.id === gearItemId);
    const isShoes = bike?.gear_type === 'shoes';
    patchRideGear(ride.id, { gear_item_id: gearItemId, assigned_by: 'manual' });
    try {
      await reassignActivityGear(ride.id, gearItemId, 'manual');
      trackGear('gear_ride_assigned', { source: rideAnalysisModalOpen ? 'modal' : 'history', gearId: gearItemId, previousGearId: before?.gear_item_id ?? null });
      notifications.show({
        title: `On ${bike?.name || (isShoes ? 'those shoes' : 'that bike')}`,
        message: `"${ride.name || (isShoes ? 'Untitled run' : 'Untitled ride')}" now counts toward ${isShoes ? 'their' : 'its'} wear.`,
        color: 'green',
      });
    } catch (error) {
      setActivities(prev => prev.map(a => (a.id === ride.id ? { ...a, gear: before } : a)));
      setSelectedRide(prev => (prev && prev.id === ride.id ? { ...prev, gear: before } : prev));
      notifications.show({ title: isShoes ? 'Could not change the shoes' : 'Could not change the bike', message: error.message || 'Try again', color: 'red' });
    }
  }, [gearItems, patchRideGear, reassignActivityGear, rideAnalysisModalOpen]);

  const handleSetSurface = useCallback(async (ride, surface) => {
    const before = ride.gear || null;
    patchRideGear(ride.id, { surface_override: surface });
    try {
      await setRideSurface(ride.id, surface);
    } catch (error) {
      setActivities(prev => prev.map(a => (a.id === ride.id ? { ...a, gear: before } : a)));
      setSelectedRide(prev => (prev && prev.id === ride.id ? { ...prev, gear: before } : prev));
      notifications.show({ title: 'Could not set the surface', message: error.message || 'Try again', color: 'red' });
    }
  }, [patchRideGear, setRideSurface]);

  // Handle hiding/showing a ride
  const handleHideRide = useCallback(async (ride) => {
    if (!user) return;

    try {
      const response = await fetch('/api/activities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify({
          action: 'toggle_hide',
          activityId: ride.id,
          userId: user.id
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update activity');
      }

      // Update local state
      setActivities(prev => prev.map(a =>
        a.id === ride.id ? { ...a, is_hidden: result.isHidden } : a
      ));

      notifications.show({
        title: result.isHidden ? 'Ride hidden' : 'Ride restored',
        message: result.isHidden
          ? `"${ride.name}" has been hidden from your history`
          : `"${ride.name}" is now visible in your history`,
        color: result.isHidden ? 'gray' : 'green'
      });
    } catch (error) {
      console.error('Error hiding ride:', error);
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to update ride visibility',
        color: 'red'
      });
    }
  }, [user]);

  // Handle adding supplement workout to plan
  const handleAddSupplementWorkout = async (workoutId, scheduledDate) => {
    // No activePlan requirement: a supplement session is a calendar entry, and
    // the calendar does not need a plan to exist. week_number and day_of_week
    // are gone with it — both were derived from a plan's start date, and the
    // adapter derives them from the date instead.
    if (!user) return false;

    try {
      const workout = getWorkoutById(workoutId);
      if (!workout) return false;

      const result = await createEntry(user.id, formatLocalDate(scheduledDate), {
        type: 'workout',
        title: workout.name || `${workout.category} Workout`,
        workout_id: workoutId,
        workout_type: workout.category,
        target_load: workout.targetTSS || 0,
        target_duration_min: workout.duration || 0,
        notes: `Supplement: ${workout.name}`,
        source: 'manual',
        plan_id: activePlan?.id ?? null,
      });
      if (!result.success) throw new Error(result.error);

      // Keep the plan's own counter honest when there IS a plan.
      if (activePlan?.id) {
        await supabase
          .from('training_plans')
          .update({
            workouts_total: (activePlan.workouts_total || 0) + 1,
          })
          .eq('id', activePlan.id);
        setActivePlan(prev => ({
          ...prev,
          workouts_total: (prev.workouts_total || 0) + 1,
        }));
      }

      // Reload the calendar, athlete-scoped for the same reason as above.
      setPlannedWorkouts(await fetchPlannedSessions(user.id));

      return true;
    } catch (error) {
      console.error('Error adding supplement workout:', error);
      return false;
    }
  };

  // Get suggested supplement days based on existing plan
  const getSuggestedSupplementDays = (workoutId, weeksAhead = 4) => {
    if (!activePlan) return [];

    const workoutInfos = plannedWorkouts.map(w => ({
      date: w.scheduled_date,
      workoutType: w.workout_type,
      workoutId: w.workout_id,
    }));

    const today = new Date();
    return findOptimalSupplementDays(workoutId, workoutInfos, today, weeksAhead);
  };

  if (loading) {
    return (
      <AppShell>
        <Container size="xl" py="xl">
          <TrainingMetricsSkeleton />
        </Container>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Container size="xl" py="xl">
        <Stack gap="lg">
          {/* Header */}
          {/* One primary action (the daily check-in) and one overflow menu.
              The header used to carry seven controls, two of which did
              nothing visible: PLAN re-selected the default tab, and the
              "Last N days" select only changed what the coach was told. */}
          <PageHeader
            title="Training Hub"
            actions={
              <>
                <Button
                  variant={todayHealthMetrics ? 'subtle' : 'outline'}
                  color={todayHealthMetrics ? 'moss' : 'ink'}
                  size="xs"
                  leftSection={<Heart size={14} />}
                  onClick={() => setHealthCheckInOpen(true)}
                >
                  {todayHealthMetrics ? 'Checked in ✓' : 'Body check-in'}
                </Button>
                <Menu shadow="md" width={280} position="bottom-end">
                  <Menu.Target>
                    <ActionIcon
                      variant="default"
                      radius={0}
                      size="lg"
                      aria-label="More training actions"
                    >
                      <DotsThree size={18} weight="bold" />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    {activePlan && (
                      <>
                        <Menu.Label>Plan</Menu.Label>
                        <Menu.Item
                          leftSection={<Barbell size={16} />}
                          onClick={() => setSupplementModalOpen(true)}
                        >
                          Add supplement workout
                        </Menu.Item>
                        <Menu.Divider />
                        <TrainingPlanExportItems
                          plan={activePlan}
                          workouts={plannedWorkouts}
                          progress={null}
                        />
                        <Menu.Divider />
                      </>
                    )}
                    <Menu.Item leftSection={<Calendar size={16} />} onClick={() => setBrowseOpen(true)}>
                      Browse training plans
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Label>Import activities</Menu.Label>
                    {/* Strava and Garmin bulk exports go through the same
                        modal — it tells them apart itself. */}
                    <Menu.Item
                      leftSection={<FileZip size={16} />}
                      onClick={() => setGpxUploadOpen(true)}
                    >
                      Strava or Garmin export (ZIP)
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<Watch size={16} />}
                      onClick={() => setFitUploadOpen(true)}
                    >
                      FIT file (single)
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item
                      leftSection={<Gear size={16} />}
                      onClick={() => navigate('/settings')}
                    >
                      Settings
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </>
            }
          />

          {/* Secondary Nav Bar — the page's tabs, directly under the header so
              they read as the page's top-level navigation rather than sitting
              below the ride map. */}
          <SecondaryNavBar activeTab={activeTab} onTabChange={selectTab} />

          {/* Plan strip + this week's plan-vs-actual, one card (Calendar only) */}
          {activeTab === 'calendar' && (
          <PlanWeekCard
            activePlan={activePlan}
            plannedWorkouts={plannedWorkouts}
            actualWeeklyStats={actualWeeklyStats}
            formatTime={formatTime}
            loading={loading}
          />
          )}

          {/* The ride map: newest GPS ride by default, or the RIDES pick. Rides tab only. */}
          {mapSel.ride && activeTab === 'rides' && (
            <div ref={mapCardRef}>
              <RideMapCard
                ride={mapSel.ride}
                ftp={ftp}
                isImperial={isImperial}
                formatDistance={formatDist}
                formatElevation={formatElev}
                formatTime={formatTime}
                title={
                  rideView === 'repeats' ? 'Anchor ride' : 'Selected ride'
                }
                hasNewer={mapSel.hasNewer}
                hasOlder={mapSel.hasOlder}
                onNewer={handleMapNewer}
                onOlder={handleMapOlder}
                onFullAnalysis={handleViewRide}
                openSignal={mapOpenSignal}
              />
            </div>
          )}

          {/* FTP nudge — TSS/intensity/form below are estimated without an FTP */}
          {!loading && !ftp && (
            <Group justify="flex-end">
              <FtpMissingBadge ftp={ftp} />
            </Group>
          )}

          {/* Tab Content Panels */}
          <Box>
            {/* CALENDAR TAB */}
            {activeTab === 'calendar' && (
              <TrainingCalendar
                activePlan={activePlan}
                rides={visibleActivities}
                formatDistance={formatDist}
                ftp={ftp}
                isImperial={isImperial}
                refreshKey={calendarRefreshKey}
                onPlanUpdated={handlePlanUpdated}
              />
            )}

            {/* SEASON TAB — races, the season profile, and one race's details */}
            {activeTab === 'season' && (
              <Suspense fallback={null}>
                <SeasonTab
                  isImperial={isImperial}
                  view={seasonView === 'race' ? 'race' : 'season'}
                  onViewChange={(v) => setSeasonView(v === 'race' ? 'race' : null)}
                  trainingContext={trainingContext}
                  formatDist={formatDist}
                  formatElev={formatElev}
                />
              </Suspense>
            )}

            {/* COACH TAB */}
            {activeTab === 'coach' && (
              <CheckInPage
                plannedWorkouts={plannedWorkouts}
                activities={visibleActivities}
                ftp={ftp}
                trainingContext={trainingContext}
              />
            )}

            {/* PROGRESS TAB — fitness, the year, zones and power, insights */}
            {activeTab === 'progress' && (
              <ProgressTab
                dailyTSSData={dailyTSSData}
                trainingMetrics={trainingMetrics}
                activities={visibleActivities}
                speedProfile={speedProfile}
                formatDist={formatDist}
                formatElev={formatElev}
                isImperial={isImperial}
                ftp={ftp}
                weight={userWeight}
                healthHistory={healthHistory}
                onOpenCheckIn={handleOpenCheckIn}
                powerZones={powerZones}
                navigate={navigate}
                userId={user?.id}
              />
            )}

            {/* RIDES TAB — the ride list, or every ride along the anchor ride / a segment */}
            {activeTab === 'rides' && (
              <Stack gap="md">
                <SegmentedControl
                  radius={0}
                  size="xs"
                  value={rideView === 'repeats' ? 'repeats' : 'history'}
                  onChange={(v) => setRideView(v === 'repeats' ? 'repeats' : null)}
                  data={[
                    { value: 'history', label: 'History' },
                    { value: 'repeats', label: 'Repeats' },
                  ]}
                  style={{ alignSelf: 'flex-start' }}
                />
                {rideView === 'repeats' ? (
                  <RepeatsTab
                    anchorRide={mapSel.ride}
                    activities={visibleActivities}
                    userId={user?.id}
                    initialSegmentId={urlSegmentId}
                    formatDistance={formatDist}
                    formatSpeed={formatSpd}
                    onOpenRide={handleViewRide}
                  />
                ) : (
                  <RideHistoryTable
                    rides={activities}
                    formatDistance={formatDist}
                    formatElevation={formatElev}
                    isImperial={isImperial}
                    ftp={ftp}
                    maxRows={Infinity}
                    onViewRide={handleSelectMapRide}
                    selectedRideId={mapSel.ride?.id ?? null}
                    onHideRide={handleHideRide}
                    bikes={bikes}
                    shoes={shoes}
                    onAssignBike={handleAssignBike}
                    onSetSurface={handleSetSurface}
                  />
                )}
              </Stack>
            )}

            {/* FIND AN EVENT TAB — the event catalog; add an event to the season */}
            {activeTab === 'events' && (
              <Suspense fallback={null}>
                <EventsTab isImperial={isImperial} />
              </Suspense>
            )}
          </Box>
        </Stack>
      </Container>

      {/* Training plans, over the calendar ("Browse training plans", or an old ?tab=browse link) */}
      <Drawer
        opened={browseOpen}
        onClose={() => setBrowseOpen(false)}
        position="right"
        size="xl"
        radius={0}
        title="Training plans"
      >
        {browseOpen && (
          <TrainingPlanBrowser
            activePlan={activePlan}
            onPlanActivated={async (plan) => {
              await handlePlanUpdated();
              if (plan) {
                setBrowseOpen(false);
                selectTab('calendar');
              }
            }}
          />
        )}
      </Drawer>

      {/* Health Check-in Modal */}
      <HealthCheckInModal
        opened={healthCheckInOpen}
        onClose={() => setHealthCheckInOpen(false)}
        onSave={(data) => {
          setTodayHealthMetrics(data);
          // Also update health history for immediate chart refresh
          setHealthHistory(prev => {
            const dateStr = data.metric_date || data.recorded_date;
            const filtered = prev.filter(h => (h.metric_date || h.recorded_date) !== dateStr);
            return [...filtered, data].sort((a, b) =>
              new Date(a.metric_date || a.recorded_date) - new Date(b.metric_date || b.recorded_date)
            );
          });
        }}
        existingData={todayHealthMetrics}
      />

      {/* FIT File Upload Modal */}
      <FitUploadModal
        opened={fitUploadOpen}
        onClose={() => setFitUploadOpen(false)}
        onUploadComplete={(results) => {
          // Refresh activities after upload
          if (results.success.length > 0) {
            window.location.reload();
          }
        }}
        formatDistance={formatDist}
        formatElevation={formatElev}
      />

      {/* Bulk GPX Upload Modal (Strava Export) */}
      <BulkGpxUploadModal
        opened={gpxUploadOpen}
        onClose={() => setGpxUploadOpen(false)}
        onUploadComplete={(results) => {
          // Refresh activities after upload
          if (results.success.length > 0) {
            window.location.reload();
          }
        }}
      />

      {/* Workout Detail Modal (shared with planner for consistent experience) */}
      <WorkoutModal
        workout={selectedWorkout}
        plannedWorkout={null}
        opened={workoutModalOpen}
        onClose={() => setWorkoutModalOpen(false)}
      />

      {/* Supplement Workout Modal */}
      <SupplementWorkoutModal
        opened={supplementModalOpen}
        onClose={() => setSupplementModalOpen(false)}
        onAddWorkout={handleAddSupplementWorkout}
        getSuggestedDays={getSuggestedSupplementDays}
        activePlan={activePlan}
      />

      {/* Ride Analysis Modal */}
      <RideAnalysisModal
        opened={rideAnalysisModalOpen}
        onClose={() => {
          setRideAnalysisModalOpen(false);
          setSelectedRide(null);
        }}
        ride={selectedRide}
        ftp={ftp}
        weight={userWeight}
        formatDistance={formatDist}
        formatElevation={formatElev}
        formatSpeed={formatSpd}
        isImperial={isImperial}
        hasCreatedRoute={!!activation?.steps?.first_route?.completed}
        bikes={bikes}
        shoes={shoes}
        onAssignBike={handleAssignBike}
        onSetSurface={handleSetSurface}
      />
    </AppShell>
  );
}

export default TrainingDashboard;
