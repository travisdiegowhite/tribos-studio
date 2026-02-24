import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Card,
  Text,
  Group,
  Stack,
  Button,
  Progress,
  CloseButton,
  Box,
  ThemeIcon,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconLink,
  IconRefresh,
  IconBrain,
  IconMap,
  IconCalendarEvent,
  IconCheck,
} from '@tabler/icons-react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useActivation } from '../../hooks/useActivation';
import { supabase } from '../../lib/supabase';

const ACTIVATION_STEPS = [
  {
    key: 'connect_device',
    label: 'Connect your device',
    description: 'Link Garmin, Wahoo, or Strava',
    cta: 'Connect',
    href: '/settings',
    icon: IconLink,
  },
  {
    key: 'first_sync',
    label: 'Sync your first activity',
    description: 'Your recent rides will import automatically',
    cta: 'Check sync',
    href: '/training?tab=history',
    icon: IconRefresh,
  },
  {
    key: 'first_insight',
    label: 'See what your coach thinks',
    description: 'AI analysis of your ride',
    cta: 'View insight',
    href: '#insight-card',
    icon: IconBrain,
  },
  {
    key: 'first_route',
    label: 'Build a route',
    description: 'Plan your next ride with AI assistance',
    cta: 'Route builder',
    href: '/routes/new',
    icon: IconMap,
  },
  {
    key: 'first_plan',
    label: 'Start a training plan',
    description: 'Structured training based on your goals',
    cta: 'Browse plans',
    href: '/planner',
    icon: IconCalendarEvent,
  },
];

export default function GetStartedGuide() {
  const { user } = useAuth();
  const {
    activation,
    loading,
    completedCount,
    totalSteps,
    isComplete,
    isDismissed,
    dismissGuide,
    setActivation,
  } = useActivation(user?.id);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`activation-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_activation',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newData = payload.new;
          const oldData = payload.old;

          setActivation(newData);

          // Show toast for newly completed steps
          if (newData.steps && oldData.steps) {
            for (const step of ACTIVATION_STEPS) {
              if (
                newData.steps[step.key]?.completed &&
                !oldData.steps[step.key]?.completed
              ) {
                notifications.show({
                  title: step.label,
                  message: 'Step complete!',
                  color: 'sage',
                  autoClose: 3000,
                });
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, setActivation]);

  // Don't render if loading, complete, dismissed, or no activation record
  if (loading || isComplete || isDismissed || !activation) return null;

  const progressPct = (completedCount / totalSteps) * 100;

  return (
    <Card
      style={{
        borderLeft: '3px solid var(--tribos-terracotta-500, #9E5A3C)',
      }}
    >
      <Group justify="space-between" mb="sm">
        <Box>
          <Text
            size="sm"
            fw={700}
            tt="uppercase"
            ff="'DM Mono', monospace"
            lts={1}
            style={{ color: 'var(--tribos-text-primary)' }}
          >
            Get Started
          </Text>
          <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
            {completedCount} of {totalSteps} complete
          </Text>
        </Box>
        <CloseButton
          size="sm"
          onClick={dismissGuide}
          aria-label="Dismiss guide"
          style={{ color: 'var(--tribos-text-muted)' }}
        />
      </Group>

      <Progress
        value={progressPct}
        color="terracotta"
        size="xs"
        radius="xl"
        mb="md"
      />

      <Stack gap="xs">
        {ACTIVATION_STEPS.map((step) => {
          const StepIcon = step.icon;
          const isStepComplete = activation.steps?.[step.key]?.completed;

          return (
            <Group
              key={step.key}
              justify="space-between"
              wrap="nowrap"
              py={4}
              style={{
                opacity: isStepComplete ? 0.6 : 1,
              }}
            >
              <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                <ThemeIcon
                  size="sm"
                  variant="light"
                  color={isStepComplete ? 'sage' : 'gray'}
                  radius="xl"
                >
                  {isStepComplete ? (
                    <IconCheck size={14} />
                  ) : (
                    <StepIcon size={14} />
                  )}
                </ThemeIcon>
                <Box style={{ minWidth: 0 }}>
                  <Text
                    size="sm"
                    fw={500}
                    style={{
                      color: 'var(--tribos-text-primary)',
                      textDecoration: isStepComplete ? 'line-through' : 'none',
                    }}
                    truncate
                  >
                    {step.label}
                  </Text>
                  <Text
                    size="xs"
                    style={{ color: 'var(--tribos-text-muted)' }}
                    truncate
                  >
                    {step.description}
                  </Text>
                </Box>
              </Group>

              {!isStepComplete && (
                <Button
                  component={step.href.startsWith('#') ? 'button' : Link}
                  {...(step.href.startsWith('#')
                    ? {
                        onClick: () => {
                          const el = document.getElementById(
                            step.href.replace('#', '')
                          );
                          el?.scrollIntoView({ behavior: 'smooth' });
                        },
                      }
                    : { to: step.href })}
                  variant="light"
                  color="terracotta"
                  size="compact-xs"
                  style={{ flexShrink: 0 }}
                >
                  {step.cta}
                </Button>
              )}
            </Group>
          );
        })}
      </Stack>
    </Card>
  );
}
