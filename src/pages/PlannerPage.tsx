/**
 * PlannerPage - Top-level page for the Training Planner
 * "Plan Your Training" - drag-and-drop workout scheduling
 * Browse Plans opens as a modal overlay
 */

import { useState, useEffect } from 'react';
import { Container, Loader, Box, Alert, Group, Text, ThemeIcon, Stack, Card, Button, Modal, SegmentedControl } from '@mantine/core';
import AppShell from '../components/AppShell.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { TrainingPlanner } from '../components/planner';
import TrainingPlanBrowser from '../components/TrainingPlanBrowser.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';
import { formatDistance } from '../utils/units';
import { useTrainingPlannerStore } from '../stores/trainingPlannerStore';
import { List, Target, WarningCircle } from '@phosphor-icons/react';
import { useTour } from '../hooks/useTour';
import { TourButton } from '../components/TourButton';
import { getTrainingPlanSteps } from '../lib/tours/trainingPlanTour';
import { getPlanToRouteSteps } from '../lib/tours/planToRouteTour';

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
  sport_type?: string | null;
}

export default function PlannerPage() {
  const { user } = useAuth() as { user: { id: string } | null };
  const setActivePlanInStore = useTrainingPlannerStore((state) => state.setActivePlan);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [ftp, setFtp] = useState<number | null>(null);
  const [activePlans, setActivePlans] = useState<TrainingPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [unitsPreference, setUnitsPreference] = useState<string>('imperial');
  const [userLocation, setUserLocation] = useState<string | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);

  // Shepherd.js guided tours — auto-trigger on first visit, replay via TourButton.
  const { startTour: startTrainingPlanTour } = useTour('training_plan_setup', getTrainingPlanSteps);
  const { startTour: startPlanToRouteTour } = useTour('plan_to_route', getPlanToRouteSteps);

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
          .select('ftp, units_preference, location')
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
        if (profileData?.location) {
          setUserLocation(profileData.location);
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

        // Fetch all active training plans
        const { data: planData, error: planError } = await supabase
          .from('training_plans')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('started_at', { ascending: false });

        if (planError) {
          console.error('Error loading plans:', planError);
        } else if (planData && planData.length > 0) {
          setActivePlans(planData);
          setSelectedPlanId(planData[0].id);
          // Don't set store.activePlanId here — TrainingPlanner will handle loading
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

  // Callback to reload active plans after updates
  const handlePlanUpdated = async () => {
    if (!user?.id) return;

    const { data } = await supabase
      .from('training_plans')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('started_at', { ascending: false });

    if (data && data.length > 0) {
      setActivePlans(data);
      // Keep selection if still valid, otherwise select first
      if (!selectedPlanId || !data.find((p: TrainingPlan) => p.id === selectedPlanId)) {
        setSelectedPlanId(data[0].id);
        // Don't set store.activePlanId here — TrainingPlanner will handle loading
      }
    } else {
      setActivePlans([]);
      setSelectedPlanId(null);
    }
  };

  const activePlan = activePlans.find((p: TrainingPlan) => p.id === selectedPlanId) ?? null;

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
          <Loader color="teal" size="lg" />
        </Box>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <Container size="xl" py="xl">
          <Alert icon={<WarningCircle size={16} />} title="Error" color="red">
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
              <Group gap="xs">
                <Button
                  variant="light"
                  color="teal"
                  size="compact-sm"
                  leftSection={<List size={14} />}
                  onClick={() => setBrowseOpen(true)}
                  data-tour="tp-browse"
                >
                  Browse Plans
                </Button>
                <TourButton onStart={startTrainingPlanTour} />
                {activePlan && (
                  <TourButton onStart={startPlanToRouteTour} label="Route from workout tour" />
                )}
              </Group>
            }
          />

          {/* Plan selector tabs when multiple active plans exist */}
          {activePlans.length > 1 && (
            <SegmentedControl
              value={selectedPlanId ?? ''}
              onChange={(value: string) => {
                setSelectedPlanId(value);
                setActivePlanInStore(value);
              }}
              data={activePlans.map((plan: TrainingPlan) => ({
                value: plan.id,
                label: `${plan.name}${plan.sport_type ? ` (${plan.sport_type})` : ''}`,
              }))}
              color="teal"
              size="sm"
              fullWidth
            />
          )}

          {/* Nudge for users without an active plan */}
          {!activePlan && activities.length > 0 && (
            <Card style={{ borderLeft: '3px solid var(--tribos-terracotta-500, #3A5A8C)' }}>
              <Group gap="sm" wrap="nowrap">
                <ThemeIcon size="lg" variant="light" color="teal" radius="xl">
                  <Target size={18} />
                </ThemeIcon>
                <Box style={{ flex: 1 }}>
                  <Text size="sm" fw={600} style={{ color: 'var(--color-text-primary)' }}>
                    Ready for structured training?
                  </Text>
                  <Text size="xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {`You've been averaging ${Math.round(activities.length / 4)} rides/week. A training plan can help you get more from each session.`}
                  </Text>
                </Box>
                <Group gap="xs">
                  <Button
                    variant="light"
                    color="teal"
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
              userLocation={userLocation}
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
            if (plan) {
              // Add to active plans if not already present, or replace
              setActivePlans((prev: TrainingPlan[]) => {
                const exists = prev.find((p: TrainingPlan) => p.id === plan.id);
                if (exists) return prev;
                return [plan, ...prev];
              });
              setSelectedPlanId(plan.id);
              setActivePlanInStore(plan.id);
            }
            setBrowseOpen(false);
            await handlePlanUpdated();
          }}
        />
      </Modal>
    </AppShell>
  );
}
