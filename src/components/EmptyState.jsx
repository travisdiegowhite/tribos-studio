import { Box, Stack, Text, Button, Group } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { Calendar, FileText, Heartbeat, MapTrifold, Path, TrendUp, UploadSimple, Users } from '@phosphor-icons/react';

/**
 * EmptyState - Reusable component for displaying helpful empty states
 * Guides users to take action instead of just showing "no data"
 */

const EMPTY_STATE_CONFIGS = {
  noRides: {
    icon: UploadSimple,
    title: 'No Rides Yet',
    description: 'Connect your devices to sync activities, or upload FIT files to get started.',
    primaryAction: {
      label: 'Connect Devices',
      path: '/settings',
    },
    secondaryText: 'Your ride history will appear here once synced.',
  },
  noRoutes: {
    icon: Path,
    title: 'No Routes Yet',
    description: 'Create your first route or import your ride history.',
    primaryAction: {
      label: 'Create a Route',
      path: '/ride/new',
    },
    secondaryAction: {
      label: 'Connect Devices',
      path: '/settings',
    },
  },
  noTrainingData: {
    icon: TrendUp,
    title: 'Not Enough Data',
    description: 'Sync at least 2 weeks of rides to see your training metrics and trends.',
    primaryAction: {
      label: 'Connect Devices',
      path: '/settings',
    },
    secondaryText: 'Training load, form, and fitness trends need historical data to calculate.',
  },
  noTrainingPlan: {
    icon: Calendar,
    title: 'No Training Plan',
    description: 'Create a personalized training plan to reach your cycling goals.',
    primaryAction: {
      label: 'View Training Dashboard',
      path: '/training',
    },
    secondaryText: 'Plans adapt to your fitness level and available time.',
  },
  noWorkouts: {
    icon: Heartbeat,
    title: 'No Workouts Scheduled',
    description: 'Your upcoming workouts will appear here.',
    primaryAction: {
      label: 'View Training Dashboard',
      path: '/training',
    },
    secondaryText: 'Check your training dashboard to see workout recommendations.',
  },
  noMessages: {
    icon: Users,
    title: 'No Messages',
    description: 'Connect with a coach to receive personalized guidance and workouts.',
    secondaryText: 'Messages from your coach will appear here.',
  },
  noSearchResults: {
    icon: FileText,
    title: 'No Results Found',
    description: 'Try adjusting your search or filters.',
  },
  generic: {
    icon: MapTrifold,
    title: 'Nothing Here Yet',
    description: 'Check back later or take an action to add data.',
  },
};

const display = {
  fontFamily: 'var(--font-display)',
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: '0.01em',
  // The condensed face's space is narrow; keep multi-word titles readable.
  wordSpacing: '0.18em',
  lineHeight: 1.05,
};

/**
 * Flat, ruled empty state (CLAUDE.md "Design System"): no blob, no gradient,
 * no shadow, radius 0. `iconColor` is still accepted for older callers but
 * ignored — the icon is muted ink, like the rest of the system.
 */
const EmptyState = ({
  type,
  icon: CustomIcon,
  // eslint-disable-next-line no-unused-vars
  iconColor,
  title,
  description,
  primaryAction,
  secondaryAction,
  secondaryText,
  size = 'md',
}) => {
  const navigate = useNavigate();
  // Normalize the legacy "new route" path onto the canonical builder entry.
  const remapRoutePath = (path) =>
    path === '/routes/new' ? '/ride/new' : path;

  const config = type ? EMPTY_STATE_CONFIGS[type] : null;
  const Icon = CustomIcon || config?.icon || MapTrifold;
  const finalTitle = title || config?.title || 'No Data';
  const finalDescription = description || config?.description || '';
  const finalPrimaryAction = primaryAction || config?.primaryAction;
  const finalSecondaryAction = secondaryAction || config?.secondaryAction;
  const finalSecondaryText = secondaryText || config?.secondaryText;

  const sizes = {
    sm: { iconSize: 24, titleSize: 16, padding: 16, gap: 8 },
    md: { iconSize: 28, titleSize: 20, padding: 24, gap: 12 },
    lg: { iconSize: 32, titleSize: 24, padding: 32, gap: 14 },
  };
  const sizeConfig = sizes[size] || sizes.md;

  const handlePrimaryClick = () => {
    if (finalPrimaryAction?.onClick) {
      finalPrimaryAction.onClick();
    } else if (finalPrimaryAction?.path) {
      navigate(remapRoutePath(finalPrimaryAction.path));
    }
  };

  const handleSecondaryClick = () => {
    if (finalSecondaryAction?.onClick) {
      finalSecondaryAction.onClick();
    } else if (finalSecondaryAction?.path) {
      navigate(remapRoutePath(finalSecondaryAction.path));
    }
  };

  return (
    <Box
      style={{
        border: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-card)',
        padding: sizeConfig.padding,
      }}
    >
      <Stack align="flex-start" gap={sizeConfig.gap}>
        <Icon size={sizeConfig.iconSize} style={{ color: 'var(--color-text-muted)' }} aria-hidden />

        <div>
          <Text style={{ ...display, fontSize: sizeConfig.titleSize }} mb={6}>
            {finalTitle}
          </Text>
          {finalDescription && (
            <Text size="sm" c="var(--color-text-secondary)" maw={460}>
              {finalDescription}
            </Text>
          )}
        </div>

        {(finalPrimaryAction || finalSecondaryAction) && (
          <Group gap="sm">
            {finalPrimaryAction && (
              <Button radius={0} size="sm" onClick={handlePrimaryClick}>
                {finalPrimaryAction.label}
              </Button>
            )}
            {finalSecondaryAction && (
              <Button radius={0} size="sm" variant="outline" onClick={handleSecondaryClick}>
                {finalSecondaryAction.label}
              </Button>
            )}
          </Group>
        )}

        {finalSecondaryText && (
          <Text size="xs" c="var(--color-text-muted)" maw={420}>
            {finalSecondaryText}
          </Text>
        )}
      </Stack>
    </Box>
  );
};

export default EmptyState;
