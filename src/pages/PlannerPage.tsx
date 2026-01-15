/**
 * PlannerPage - Top-level page for the Training Planner
 * "Plan Your Training" - drag-and-drop workout scheduling
 * Now includes plan browsing (moved from Analysis page)
 */

import { useState, useEffect } from 'react';
import { Container, Loader, Box, Alert, Tabs, Group, Text, ThemeIcon, Stack } from '@mantine/core';
import { IconAlertCircle, IconCalendarEvent, IconList } from '@tabler/icons-react';
import { useSearchParams } from 'react-router-dom';
import AppShell from '../components/AppShell.jsx';
import { TrainingPlanner } from '../components/planner';
import TrainingPlanBrowser from '../components/TrainingPlanBrowser.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';
import { tokens } from '../theme';

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
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [ftp, setFtp] = useState<number | null>(null);
  const [activePlan, setActivePlan] = useState<TrainingPlan | null>(null);

  // Tab state - default to 'calendar' unless browsing plans
  const urlTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<string>(urlTab === 'browse' ? 'browse' : 'calendar');

  useEffect(() => {
    if (!user?.id) return;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        // Fetch user profile for FTP
        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('ftp')
          .eq('id', user.id)
          .single();

        if (profileError && profileError.code !== 'PGRST116') {
          console.error('Error loading profile:', profileError);
        }
        if (profileData?.ftp) {
          setFtp(profileData.ftp);
        }

        // Fetch activities (last 90 days for context)
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const { data: activityData, error: activityError } = await supabase
          .from('activities')
          .select('*')
          .eq('user_id', user.id)
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
          .eq('user_id', user.id)
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
          <Loader color="lime" size="lg" />
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
    <AppShell fullWidth={activeTab === 'calendar'}>
      <Container size="xl" py="md">
        <Tabs
          value={activeTab}
          onChange={(value) => setActiveTab(value || 'calendar')}
          color="lime"
        >
          <Tabs.List mb="md">
            <Tabs.Tab
              value="calendar"
              leftSection={<IconCalendarEvent size={16} />}
            >
              My Plan
            </Tabs.Tab>
            <Tabs.Tab
              value="browse"
              leftSection={<IconList size={16} />}
            >
              Browse Plans
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="calendar">
            <Box mx="-md">
              <TrainingPlanner
                userId={user?.id}
                activePlanId={activePlan?.id}
                activities={activities}
                ftp={ftp}
                onPlanUpdated={handlePlanUpdated}
              />
            </Box>
          </Tabs.Panel>

          <Tabs.Panel value="browse">
            <TrainingPlanBrowser
              activePlan={activePlan}
              onPlanActivated={async (plan) => {
                setActivePlan(plan);
                // Reload activities after plan activation
                if (plan?.id && user?.id) {
                  const { data: workoutsData } = await supabase
                    .from('planned_workouts')
                    .select('*')
                    .eq('plan_id', plan.id)
                    .order('scheduled_date', { ascending: true });
                  if (workoutsData) {
                    // Switch to calendar view to show the new plan
                    setActiveTab('calendar');
                  }
                }
              }}
            />
          </Tabs.Panel>
        </Tabs>
      </Container>
    </AppShell>
  );
}
