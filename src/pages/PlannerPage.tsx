/**
 * PlannerPage - Top-level page for the Training Planner
 * "Plan Your Training" - drag-and-drop workout scheduling
 */

import { useState, useEffect } from 'react';
import { Container, Loader, Box, Alert } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import AppShell from '../components/AppShell.jsx';
import { TrainingPlanner } from '../components/planner';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';

interface Activity {
  id: string;
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
}

interface TrainingPlan {
  id: string;
  name: string;
  status: string;
  started_at: string;
}

export default function PlannerPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [ftp, setFtp] = useState<number | null>(null);
  const [activePlan, setActivePlan] = useState<TrainingPlan | null>(null);

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
          .select('id, name, type, start_date, start_date_local, moving_time, duration_seconds, distance, total_elevation_gain, average_watts, trainer')
          .eq('user_id', user.id)
          .gte('start_date', ninetyDaysAgo.toISOString())
          .order('start_date', { ascending: false });

        if (activityError) {
          console.error('Error loading activities:', activityError);
        } else {
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
    <AppShell fullWidth>
      <TrainingPlanner
        userId={user?.id}
        activePlanId={activePlan?.id}
        activities={activities}
        ftp={ftp}
        onPlanUpdated={handlePlanUpdated}
      />
    </AppShell>
  );
}
