/**
 * PlannerPage - Top-level page for the Training Planner
 * "Plan Your Training" - drag-and-drop workout scheduling
 * Now includes plan browsing and training calendar (moved from Analysis page)
 */

import { useState, useEffect } from 'react';
import { Container, Loader, Box, Alert, Tabs, Group, Text, ThemeIcon, Stack } from '@mantine/core';
import { IconAlertCircle, IconCalendarEvent, IconList, IconHistory } from '@tabler/icons-react';
import { useSearchParams } from 'react-router-dom';
import AppShell from '../components/AppShell.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { TrainingPlanner } from '../components/planner';
import TrainingPlanBrowser from '../components/TrainingPlanBrowser.jsx';
import TrainingCalendar from '../components/TrainingCalendar.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';
import { tokens } from '../theme';
import { formatDistance } from '../utils/units';

// Activity type - matches the activities table schema
// Using a flexible type since we select('*') to get all fields
interface Activity {
  id: string;
  user_id: string;
  name?: string;
  type?: string;
  start_date: string;
  start_date_local?: string;
  moving_time?: number;
  duration_seconds?: number;
  distance?: number;
  total_elevation_gain?: number;
  average_watts?: number;
  trainer?: boolean;
  [key: string]: unknown; // Allow additional fields from select('*')
}

interface TrainingPlan {
  id: string;
  name: string;
  status: string;
  started_at: string;
}

export default function PlannerPage() {
  const { user } = useAuth() as { user: { id: string } | null };
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [ftp, setFtp] = useState<number | null>(null);
  const [activePlan, setActivePlan] = useState<TrainingPlan | null>(null);
  const [unitsPreference, setUnitsPreference] = useState<string>('imperial');
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);

  // Tab state - default to 'planner' unless specified
  const urlTab = searchParams.get('tab');
  const validTabs = ['planner', 'browse', 'history'];
  const [activeTab, setActiveTab] = useState<string>(
    validTabs.includes(urlTab || '') ? urlTab! : 'planner'
  );

  const isImperial = unitsPreference === 'imperial';
  const formatDist = (meters: number) => formatDistance(meters, isImperial);

  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        // Fetch user profile for FTP and units preference
        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('ftp, units_preference')
          .eq('id', userId)
          .single();

        if (profileError && profileError.code !== 'PGRST116') {
          console.error('Error loading profile:', profileError);
        }
        if (profileData?.ftp) {
          setFtp(profileData.ftp);
        }
        if (profileData?.units_preference) {
          setUnitsPreference(profileData.units_preference);
        }

        // Fetch activities (last 90 days for context)
        // Exclude duplicates (duplicate_of IS NULL) to show only primary activities
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const { data: activityData, error: activityError } = await supabase
          .from('activities')
          .select('*')
          .eq('user_id', userId)
          .is('duplicate_of', null)
          .gte('start_date', ninetyDaysAgo.toISOString())
          .order('start_date', { ascending: false });

        if (activityError) {
          console.error('Error loading activities:', activityError);
        } else {
          console.log(`[PlannerPage] Loaded ${activityData?.length || 0} activities`);
          setActivities(activityData || []);
        }

        // Fetch active training plan
        const { data: planData, error: planError } = await supabase
          .from('training_plans')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (planError) {
          console.error('Error loading plan:', planError);
        } else if (planData) {
          setActivePlan(planData);
        }
      } catch (err) {
        console.error('Error loading planner data:', err);
        setError('Failed to load training data. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [user?.id]);

  // Callback to reload active plan after updates
  const handlePlanUpdated = async () => {
    if (!user?.id) return;

    const { data } = await supabase
      .from('training_plans')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setActivePlan(data);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <Box
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 'calc(100vh - 60px)',
          }}
        >
          <Loader color="terracotta" size="lg" />
        </Box>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <Container size="xl" py="xl">
          <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red">
            {error}
          </Alert>
        </Container>
      </AppShell>
    );
  }

  return (
    <AppShell fullWidth={activeTab === 'planner'}>
      <Container size="xl" py="lg">
        <Stack gap="lg">
          <PageHeader
            title="Plan"
            subtitle={activePlan ? `Active: ${activePlan.name}` : 'Schedule and manage your training'}
          />

          <Tabs
            value={activeTab}
            onChange={(value) => setActiveTab(value || 'planner')}
            color="terracotta"
          >
            <Tabs.List mb="md">
            <Tabs.Tab
              value="planner"
              leftSection={<IconCalendarEvent size={16} />}
            >
              Planner
            </Tabs.Tab>
            <Tabs.Tab
              value="history"
              leftSection={<IconHistory size={16} />}
            >
              History
            </Tabs.Tab>
            <Tabs.Tab
              value="browse"
              leftSection={<IconList size={16} />}
            >
              Browse Plans
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="planner">
            <Box mx="-md">
              <TrainingPlanner
                userId={user?.id ?? ''}
                activePlanId={activePlan?.id}
                activities={activities}
                ftp={ftp}
                onPlanUpdated={handlePlanUpdated}
              />
            </Box>
          </Tabs.Panel>

          <Tabs.Panel value="history">
            <TrainingCalendar
              activePlan={activePlan}
              // @ts-expect-error TrainingCalendar JSX component lacks type definitions
              rides={activities}
              formatDistance={formatDist}
              ftp={ftp}
              isImperial={isImperial}
              refreshKey={calendarRefreshKey}
              onPlanUpdated={async () => {
                // Reload the active plan to get updated compliance stats
                await handlePlanUpdated();
                setCalendarRefreshKey(prev => prev + 1);
              }}
            />
          </Tabs.Panel>

          <Tabs.Panel value="browse">
            <TrainingPlanBrowser
              activePlan={activePlan}
              onPlanActivated={async (plan: TrainingPlan | null) => {
                setActivePlan(plan);
                // Reload activities after plan activation
                if (plan?.id && user?.id) {
                  const { data: workoutsData } = await supabase
                    .from('planned_workouts')
                    .select('*')
                    .eq('plan_id', plan.id)
                    .order('scheduled_date', { ascending: true });
                  if (workoutsData) {
                    // Switch to planner view to show the new plan
                    setActiveTab('planner');
                  }
                }
              }}
            />
          </Tabs.Panel>
        </Tabs>
        </Stack>
      </Container>
    </AppShell>
  );
}
