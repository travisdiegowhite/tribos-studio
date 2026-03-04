/**
 * PlannerPage - Top-level page for the Training Planner
 * "Plan Your Training" - drag-and-drop workout scheduling
 * Browse Plans opens as a modal overlay
 */

import { useState, useEffect } from 'react';
import { Container, Loader, Box, Alert, Group, Text, ThemeIcon, Stack, Card, Button, Modal } from '@mantine/core';
import { IconAlertCircle, IconTarget, IconList } from '@tabler/icons-react';
import AppShell from '../components/AppShell.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { TrainingPlanner } from '../components/planner';
import TrainingPlanBrowser from '../components/TrainingPlanBrowser.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [ftp, setFtp] = useState<number | null>(null);
  const [activePlan, setActivePlan] = useState<TrainingPlan | null>(null);
  const [unitsPreference, setUnitsPreference] = useState<string>('imperial');
  const [browseOpen, setBrowseOpen] = useState(false);

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
    <AppShell fullWidth>
      <Container size="xl" py="lg">
        <Stack gap="lg">
          <PageHeader
            title="Plan"
            subtitle={activePlan ? `Active: ${activePlan.name}` : 'Schedule and manage your training'}
            actions={
              <Button
                variant="light"
                color="terracotta"
                size="compact-sm"
                leftSection={<IconList size={14} />}
                onClick={() => setBrowseOpen(true)}
              >
                Browse Plans
              </Button>
            }
          />

          {/* Nudge for users without an active plan */}
          {!activePlan && activities.length > 0 && (
            <Card style={{ borderLeft: '3px solid var(--tribos-terracotta-500, #9E5A3C)' }}>
              <Group gap="sm" wrap="nowrap">
                <ThemeIcon size="lg" variant="light" color="terracotta" radius="xl">
                  <IconTarget size={18} />
                </ThemeIcon>
                <Box style={{ flex: 1 }}>
                  <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
                    Ready for structured training?
                  </Text>
                  <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                    {`You've been averaging ${Math.round(activities.length / 4)} rides/week. A training plan can help you get more from each session.`}
                  </Text>
                </Box>
                <Group gap="xs">
                  <Button
                    variant="light"
                    color="terracotta"
                    size="compact-sm"
                    onClick={() => setBrowseOpen(true)}
                  >
                    Browse plans
                  </Button>
                </Group>
              </Group>
            </Card>
          )}

          <Box mx="-md">
            <TrainingPlanner
              userId={user?.id ?? ''}
              activePlanId={activePlan?.id}
              activities={activities}
              ftp={ftp}
              onPlanUpdated={handlePlanUpdated}
            />
          </Box>
        </Stack>
      </Container>

      {/* Browse Plans Modal */}
      <Modal
        opened={browseOpen}
        onClose={() => setBrowseOpen(false)}
        size="xl"
        title="Browse Training Plans"
        styles={{
          title: { fontWeight: 600 },
        }}
      >
        <TrainingPlanBrowser
          activePlan={activePlan}
          onPlanActivated={async (plan: TrainingPlan | null) => {
            setActivePlan(plan);
            setBrowseOpen(false);
          }}
        />
      </Modal>
    </AppShell>
  );
}
