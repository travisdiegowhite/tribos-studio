import { useState, useEffect } from 'react';
import { Box, Text, Button, Group, Paper, Kbd } from '@mantine/core';
import { IconX, IconPointer, IconMapPin, IconRoute } from '@tabler/icons-react';
import { tokens } from '../theme';

/**
 * MapTutorialOverlay - Interactive tutorial overlay for first-time users
 * @param {boolean} show - Whether to show the tutorial
 * @param {function} onDismiss - Callback when tutorial is dismissed
 * @param {number} waypointCount - Current number of waypoints
 */
function MapTutorialOverlay({ show, onDismiss, waypointCount = 0 }) {
  const [step, setStep] = useState(0);
  const [isPulsing, setIsPulsing] = useState(true);

  // Tutorial steps
  const tutorialSteps = [
    {
      icon: <IconPointer size={24} />,
      title: 'Click on the Map',
      description: 'Click anywhere on the map to add your first waypoint',
      position: 'center',
    },
    {
      icon: <IconMapPin size={24} />,
      title: 'Add More Waypoints',
      description: 'Continue clicking to add waypoints and create your route',
      position: 'center',
    },
    {
      icon: <IconRoute size={24} />,
      title: 'Route Created!',
      description: 'Your route is automatically calculated between waypoints',
      position: 'center',
    },
  ];

  // Progress through tutorial based on waypoint count
  useEffect(() => {
    if (waypointCount === 1) {
      setStep(1);
    } else if (waypointCount >= 2) {
      setStep(2);
      // Auto-dismiss after showing the completion step
      setTimeout(() => {
        onDismiss();
      }, 3000);
    }
  }, [waypointCount, onDismiss]);

  if (!show) return null;

  const currentStep = tutorialSteps[step];

  return (
    <>
      {/* Semi-transparent overlay */}
      <Box
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          zIndex: 100,
          pointerEvents: step >= 2 ? 'none' : 'auto',
        }}
        onClick={(e) => {
          // Allow clicks to pass through to the map
          e.stopPropagation();
        }}
      />

      {/* Pulsing indicator in center of map */}
      {step === 0 && (
        <Box
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 101,
            pointerEvents: 'none',
          }}
        >
          <Box
            style={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              backgroundColor: `${'var(--tribos-lime)'}40`,
              border: `3px solid ${'var(--tribos-lime)'}`,
              animation: isPulsing ? 'pulse-tutorial 1.5s ease-in-out infinite' : 'none',
            }}
          />
        </Box>
      )}

      {/* Tutorial tooltip */}
      <Paper
        shadow="xl"
        style={{
          position: 'absolute',
          top: step === 0 ? 'calc(50% + 60px)' : '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 102,
          padding: '20px 24px',
          backgroundColor: 'var(--tribos-bg-secondary)',
          border: `1px solid ${'var(--tribos-lime)'}`,
          maxWidth: 320,
          textAlign: 'center',
        }}
        radius="lg"
      >
        <Box
          style={{
            color: 'var(--tribos-lime)',
            marginBottom: '12px',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          {currentStep.icon}
        </Box>

        <Text size="lg" fw={700} style={{ color: 'var(--tribos-text-primary)', marginBottom: '8px' }}>
          {currentStep.title}
        </Text>

        <Text size="sm" style={{ color: 'var(--tribos-text-secondary)', marginBottom: '16px' }}>
          {currentStep.description}
        </Text>

        <Group justify="center" gap="sm">
          <Button
            variant="subtle"
            size="xs"
            onClick={onDismiss}
            style={{ color: 'var(--tribos-text-muted)' }}
          >
            Skip Tutorial
          </Button>
          {step < 2 && (
            <Button variant="filled" color="lime" size="xs" onClick={onDismiss}>
              Got It
            </Button>
          )}
        </Group>

        {/* Keyboard shortcut hint */}
        <Box style={{ marginTop: '12px' }}>
          <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
            Press <Kbd size="xs">H</Kbd> anytime for help
          </Text>
        </Box>
      </Paper>

      {/* CSS Animation */}
      <style>{`
        @keyframes pulse-tutorial {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.2);
            opacity: 0.7;
          }
        }
      `}</style>
    </>
  );
}

export default MapTutorialOverlay;
