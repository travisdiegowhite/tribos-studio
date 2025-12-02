import React, { useState, useEffect } from 'react';
import { Paper, Text, Button, Group, Stack, ThemeIcon, CloseButton } from '@mantine/core';
import { Info, X } from 'lucide-react';

const FeatureTour = ({ page, onDismiss }) => {
  const [visible, setVisible] = useState(false);

  const tourContent = {
    'ai-routes': {
      title: 'Smart Route Planner',
      tips: [
        {
          text: 'Click on the map to set your start location, or use your current location',
          importance: 'high',
        },
        {
          text: 'The system considers weather, elevation, and your past rides to create optimal routes',
          importance: 'medium',
        },
        {
          text: 'Try different training goals to see how routes change for different objectives',
          importance: 'medium',
        },
      ],
    },
    'route-builder': {
      title: 'Route Builder',
      tips: [
        {
          text: 'Click anywhere on the map to add waypoints - the route connects them automatically',
          importance: 'high',
        },
        {
          text: 'Watch the elevation profile update in real-time as you build your route',
          importance: 'medium',
        },
        {
          text: "Don't forget to save your route when you're finished!",
          importance: 'medium',
        },
      ],
    },
    'route-studio': {
      title: 'Route Studio',
      tips: [
        {
          text: 'Use the gravel profile toggle to route along unpaved roads and trails',
          importance: 'high',
        },
        {
          text: 'Smart routing automatically finds the best cycling-friendly paths',
          importance: 'medium',
        },
        {
          text: 'Drag waypoints to adjust your route, or add new ones by clicking the map',
          importance: 'high',
        },
      ],
    },
    'upload': {
      title: 'Upload Routes',
      tips: [
        {
          text: 'Drag and drop GPX or FIT files from your bike computer',
          importance: 'high',
        },
        {
          text: 'Uploaded routes help the system understand your preferences and riding style',
          importance: 'medium',
        },
        {
          text: 'All uploaded routes are saved to your library automatically',
          importance: 'low',
        },
      ],
    },
    'training': {
      title: 'Training Dashboard',
      tips: [
        {
          text: 'Create personalized training plans based on your goals and fitness level',
          importance: 'high',
        },
        {
          text: 'The system adapts your plan based on completed workouts and performance',
          importance: 'medium',
        },
        {
          text: 'Track your progress over time with detailed metrics and insights',
          importance: 'medium',
        },
      ],
    },
  };

  useEffect(() => {
    // Check if user has dismissed this tour before
    const dismissed = localStorage.getItem(`tribos_tour_dismissed_${page}`);
    const onboardingCompleted = localStorage.getItem('tribos_onboarding_completed');

    if (!dismissed && onboardingCompleted === 'true') {
      // Show tour after a short delay
      const timer = setTimeout(() => setVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [page]);

  const handleDismiss = (permanently = false) => {
    setVisible(false);
    if (permanently) {
      localStorage.setItem(`tribos_tour_dismissed_${page}`, 'true');
    }
    if (onDismiss) {
      onDismiss();
    }
  };

  const content = tourContent[page];
  if (!content || !visible) return null;

  return (
    <Paper
      shadow="lg"
      p="lg"
      radius="md"
      withBorder
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        maxWidth: 400,
        zIndex: 1000,
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.95) 0%, rgba(34, 211, 238, 0.95) 100%)',
        color: 'white',
      }}
    >
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Group gap="xs">
            <ThemeIcon size={36} radius="md" color="white" variant="light">
              <Info size={20} />
            </ThemeIcon>
            <Text size="lg" fw={700} c="white">
              {content.title}
            </Text>
          </Group>
          <CloseButton
            icon={<X size={18} />}
            onClick={() => handleDismiss(false)}
            style={{ color: 'white' }}
          />
        </Group>

        <Stack gap="xs">
          {content.tips.map((tip, index) => (
            <Group key={index} align="flex-start" gap="xs">
              <Text c="white" size="lg" fw={700} style={{ minWidth: 20 }}>
                {index + 1}.
              </Text>
              <Text c="white" size="sm">
                {tip.text}
              </Text>
            </Group>
          ))}
        </Stack>

        <Group justify="flex-end" gap="xs">
          <Button
            variant="white"
            color="dark"
            size="xs"
            onClick={() => handleDismiss(true)}
          >
            Don't show again
          </Button>
          <Button
            variant="white"
            color="teal"
            size="xs"
            onClick={() => handleDismiss(false)}
          >
            Got it!
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
};

export default FeatureTour;
