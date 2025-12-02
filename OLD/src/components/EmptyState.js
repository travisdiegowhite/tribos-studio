import React from 'react';
import { Paper, Stack, Text, Button, ThemeIcon, Group } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import {
  Route,
  Upload,
  Brain,
  TrendingUp,
  Calendar,
  Activity,
  Map,
  FileText,
  Users,
} from 'lucide-react';

/**
 * EmptyState - Reusable component for displaying helpful empty states
 * Guides users to take action instead of just showing "no data"
 */

// Pre-defined empty state configurations
const EMPTY_STATE_CONFIGS = {
  // No rides imported
  noRides: {
    icon: Upload,
    iconColor: 'teal',
    title: 'No Rides Yet',
    description: 'Import your rides from Strava, Garmin, or upload FIT files to get started.',
    primaryAction: {
      label: 'Import Rides',
      path: '/import',
    },
    secondaryText: 'Your ride history will appear here once imported.',
  },

  // No routes created
  noRoutes: {
    icon: Route,
    iconColor: 'blue',
    title: 'No Routes Yet',
    description: 'Create your first AI-powered route or import your ride history.',
    primaryAction: {
      label: 'Create a Route',
      path: '/ai-planner',
    },
    secondaryAction: {
      label: 'Import Rides',
      path: '/import',
    },
  },

  // No training data
  noTrainingData: {
    icon: TrendingUp,
    iconColor: 'green',
    title: 'Not Enough Data',
    description: 'Import at least 2 weeks of rides to see your training metrics and trends.',
    primaryAction: {
      label: 'Import Rides',
      path: '/import',
    },
    secondaryText: 'Training load, form, and fitness trends need historical data to calculate.',
  },

  // No training plan
  noTrainingPlan: {
    icon: Calendar,
    iconColor: 'violet',
    title: 'No Training Plan',
    description: 'Create a personalized training plan to reach your cycling goals.',
    primaryAction: {
      label: 'Create Training Plan',
      path: '/training/plans/new',
    },
    secondaryText: 'Plans adapt to your fitness level and available time.',
  },

  // No workouts scheduled
  noWorkouts: {
    icon: Activity,
    iconColor: 'orange',
    title: 'No Workouts Scheduled',
    description: 'Your upcoming workouts will appear here.',
    primaryAction: {
      label: 'Browse Workout Library',
      path: '/workouts/library',
    },
    secondaryText: 'Add workouts from the library or get them from your coach.',
  },

  // No messages
  noMessages: {
    icon: Users,
    iconColor: 'cyan',
    title: 'No Messages',
    description: 'Connect with a coach to receive personalized guidance and workouts.',
    secondaryText: 'Messages from your coach will appear here.',
  },

  // Search no results
  noSearchResults: {
    icon: FileText,
    iconColor: 'gray',
    title: 'No Results Found',
    description: 'Try adjusting your search or filters.',
  },

  // Generic empty
  generic: {
    icon: Map,
    iconColor: 'gray',
    title: 'Nothing Here Yet',
    description: 'Check back later or take an action to add data.',
  },
};

const EmptyState = ({
  // Use a preset configuration
  type,
  // Or provide custom props
  icon: CustomIcon,
  iconColor = 'gray',
  title,
  description,
  primaryAction,
  secondaryAction,
  secondaryText,
  // Sizing
  size = 'md', // 'sm', 'md', 'lg'
}) => {
  const navigate = useNavigate();

  // Get config from preset or use custom props
  const config = type ? EMPTY_STATE_CONFIGS[type] : null;
  const Icon = CustomIcon || config?.icon || Map;
  const finalIconColor = iconColor || config?.iconColor || 'gray';
  const finalTitle = title || config?.title || 'No Data';
  const finalDescription = description || config?.description || '';
  const finalPrimaryAction = primaryAction || config?.primaryAction;
  const finalSecondaryAction = secondaryAction || config?.secondaryAction;
  const finalSecondaryText = secondaryText || config?.secondaryText;

  // Size configurations
  const sizes = {
    sm: { iconSize: 32, themeIconSize: 48, titleSize: 'md', textSize: 'sm', padding: 'md', gap: 'sm' },
    md: { iconSize: 40, themeIconSize: 64, titleSize: 'lg', textSize: 'md', padding: 'xl', gap: 'md' },
    lg: { iconSize: 48, themeIconSize: 80, titleSize: 'xl', textSize: 'md', padding: '2rem', gap: 'lg' },
  };
  const sizeConfig = sizes[size] || sizes.md;

  const handlePrimaryClick = () => {
    if (finalPrimaryAction?.onClick) {
      finalPrimaryAction.onClick();
    } else if (finalPrimaryAction?.path) {
      navigate(finalPrimaryAction.path);
    }
  };

  const handleSecondaryClick = () => {
    if (finalSecondaryAction?.onClick) {
      finalSecondaryAction.onClick();
    } else if (finalSecondaryAction?.path) {
      navigate(finalSecondaryAction.path);
    }
  };

  return (
    <Paper
      p={sizeConfig.padding}
      radius="md"
      withBorder
      style={{
        textAlign: 'center',
        borderStyle: 'dashed',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
      }}
    >
      <Stack align="center" gap={sizeConfig.gap}>
        <ThemeIcon
          size={sizeConfig.themeIconSize}
          radius="xl"
          variant="light"
          color={finalIconColor}
        >
          <Icon size={sizeConfig.iconSize} />
        </ThemeIcon>

        <div>
          <Text fw={600} size={sizeConfig.titleSize} mb={4}>
            {finalTitle}
          </Text>
          {finalDescription && (
            <Text c="dimmed" size={sizeConfig.textSize} maw={400} mx="auto">
              {finalDescription}
            </Text>
          )}
        </div>

        {(finalPrimaryAction || finalSecondaryAction) && (
          <Group gap="sm">
            {finalPrimaryAction && (
              <Button
                variant="gradient"
                gradient={{ from: 'teal', to: 'cyan' }}
                onClick={handlePrimaryClick}
              >
                {finalPrimaryAction.label}
              </Button>
            )}
            {finalSecondaryAction && (
              <Button
                variant="light"
                onClick={handleSecondaryClick}
              >
                {finalSecondaryAction.label}
              </Button>
            )}
          </Group>
        )}

        {finalSecondaryText && (
          <Text size="xs" c="dimmed" maw={350}>
            {finalSecondaryText}
          </Text>
        )}
      </Stack>
    </Paper>
  );
};

export default EmptyState;
